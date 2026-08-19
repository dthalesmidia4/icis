/**
 * CONTRATO ÚNICO de TRANSFERÊNCIA ADMINISTRATIVA de responsável.
 *
 * "Quero que outra pessoa assuma este card; encaixe-a de forma segura na etapa
 * e na agenda adequadas."
 *
 * O sistema é AUXILIADOR, não bloqueante:
 *  - etapa incompatível  → remapeia para etapa operacional segura (resolvedor central);
 *  - horário ocupado     → reagenda automaticamente para o próximo slot livre;
 *  - corrida no apply    → reavalia UMA vez e tenta novamente com o novo slot;
 *  - bloqueia apenas quando existe impossibilidade real de processo/agenda.
 *
 * NÃO é usado por transições de PROCESSO (prosseguir/entregar/regredir/jump):
 * essas mantêm sua semântica própria.
 */
import {
  evaluateReassign as evaluateReassignReal,
  applyReassign as applyReassignReal,
  type ApplyReassignInput,
  type ApplyReassignResult,
  type ReassignCard,
  type ReassignEvaluation,
} from "@/lib/reassignDemand";
import type { FreeSlotSuggestion } from "@/lib/scheduleOccupancy";

export type SmartReassignStatus = "applied" | "blocked" | "stale" | "error";

export interface SmartReassignResult {
  status: SmartReassignStatus;
  stageChanged: boolean;
  previousFunctionKey: string | null;
  nextFunctionKey: string | null;
  rescheduled: boolean;
  finalSchedule: {
    due_date: string;
    due_time: string;
    delivery_date: string;
    delivery_time: string;
  } | null;
  retried: boolean;
  /** Mensagem pronta para toast (sucesso descritivo ou motivo do bloqueio). */
  message: string;
  softMessages: string[];
  direction?: "same" | "forward" | "backward";
}

export interface SmartReassignDeps {
  evaluate: typeof evaluateReassignReal;
  apply: (input: ApplyReassignInput) => Promise<ApplyReassignResult>;
}

const DEFAULT_DEPS: SmartReassignDeps = {
  evaluate: evaluateReassignReal,
  apply: applyReassignReal,
};

const isCaptar = (k?: string | null) => (k || "").toLowerCase().trim() === "captar";

const slotOf = (s: FreeSlotSuggestion) => ({
  due_date: s.date,
  due_time: s.startTime,
  delivery_date: s.date,
  delivery_time: s.endTime,
});

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
};

/** Mensagem amigável descrevendo o que o sistema fez automaticamente. */
export function buildSmartReassignMessage(params: {
  targetName: string;
  stageChanged: boolean;
  stageLabel?: string | null;
  rescheduled: boolean;
  finalSchedule: SmartReassignResult["finalSchedule"];
}): string {
  const parts: string[] = [`Transferida para ${params.targetName}`];
  if (params.stageChanged && params.stageLabel) {
    parts.push(`etapa ajustada para ${params.stageLabel}`);
  }
  if (params.rescheduled && params.finalSchedule) {
    parts.push(
      `reagendada para ${fmtDate(params.finalSchedule.due_date)} às ${params.finalSchedule.due_time}`,
    );
  }
  return `${parts.join(" · ")}.`;
}

export interface SmartReassignParams {
  tenantId: string;
  card: ReassignCard;
  targetUserId: string | null;
  targetUserName?: string;
  /** Nome legível da etapa atual (mensagens de bloqueio). */
  functionLabel?: string;
  /** Nome legível da etapa final (mensagem de sucesso). */
  stageLabelOf?: (key: string) => string;
  historySource?: string;
  metadata?: Record<string, unknown>;
}

/**
 * ÚNICO orquestrador de reassign administrativo disparado pela UI.
 * Deve ser chamado DENTRO do `perform` dos guards (Alterações/Execução).
 */
export async function smartAdministrativeReassign(
  params: SmartReassignParams,
  depsOverride?: Partial<SmartReassignDeps>,
): Promise<SmartReassignResult> {
  const deps = { ...DEFAULT_DEPS, ...(depsOverride || {}) };
  const { tenantId, card, targetUserId } = params;
  const previousFunctionKey = card.current_function_key ?? null;
  const targetName = params.targetUserName || "colaborador";
  const labelOf = (k: string | null) => (k ? (params.stageLabelOf?.(k) || k) : null);

  const base: SmartReassignResult = {
    status: "error",
    stageChanged: false,
    previousFunctionKey,
    nextFunctionKey: previousFunctionKey,
    rescheduled: false,
    finalSchedule: null,
    retried: false,
    message: "Não foi possível transferir a demanda.",
    softMessages: [],
  };

  let evaluation: ReassignEvaluation;
  try {
    evaluation = await deps.evaluate({
      tenantId,
      card,
      newAssignedTo: targetUserId,
      collaboratorName: params.targetUserName,
      functionLabel: params.functionLabel,
      mode: "administrative_reassign",
    });
  } catch (e) {
    return { ...base, message: "Não foi possível avaliar a transferência." };
  }

  const softMessages = evaluation.softMessages || [];

  // Bloqueio REAL de processo: nenhuma etapa operacional compatível.
  if (!evaluation.allowed && evaluation.blockedBy === "function") {
    return {
      ...base,
      status: "blocked",
      message: evaluation.message || `${targetName} não tem etapa compatível.`,
      softMessages,
    };
  }

  const nextFunctionKey = evaluation.nextFunctionKey ?? null;
  const stageChanged = (nextFunctionKey ?? null) !== (previousFunctionKey ?? null);

  let reschedule: SmartReassignResult["finalSchedule"] = null;

  if (!evaluation.allowed && evaluation.blockedBy === "schedule") {
    // Captação com compromisso FIXO não é empurrada como tarefa comum.
    if (isCaptar(previousFunctionKey) && isCaptar(nextFunctionKey)) {
      return {
        ...base,
        status: "blocked",
        nextFunctionKey,
        stageChanged,
        message:
          `${targetName} já tem demanda neste horário e captações têm compromisso fixo: ` +
          "reagende a captação manualmente antes de transferir.",
        softMessages,
      };
    }
    if (!evaluation.suggestion) {
      return {
        ...base,
        status: "blocked",
        nextFunctionKey,
        stageChanged,
        message:
          evaluation.message ||
          `${targetName} não tem nenhum horário livre compatível nos próximos dias.`,
        softMessages,
      };
    }
    reschedule = slotOf(evaluation.suggestion);
  }

  const runApply = async (
    fnKey: string | null,
    sched: SmartReassignResult["finalSchedule"],
    direction: ReassignEvaluation["direction"],
  ) =>
    deps.apply({
      tenantId,
      card,
      newAssignedTo: targetUserId,
      nextFunctionKey: fnKey,
      reschedule: sched,
      direction,
      historySource: params.historySource,
      metadata: {
        ...(params.metadata || {}),
        smart_reassign: true,
        final_function_key: fnKey,
        final_schedule: sched,
      },
    });

  let res: ApplyReassignResult;
  try {
    res = await runApply(nextFunctionKey, reschedule, evaluation.direction);
  } catch (e) {
    return { ...base, nextFunctionKey, stageChanged, softMessages };
  }

  let retried = false;

  // Corrida: a agenda mudou entre avaliar e gravar → reavalia UMA única vez.
  if (res.status === "conflict") {
    retried = true;
    let re: ReassignEvaluation;
    try {
      re = await deps.evaluate({
        tenantId,
        card,
        newAssignedTo: targetUserId,
        collaboratorName: params.targetUserName,
        functionLabel: params.functionLabel,
        mode: "administrative_reassign",
      });
    } catch {
      return { ...base, status: "error", nextFunctionKey, stageChanged, retried, softMessages };
    }

    // Contexto semântico mudou: não escreve plano antigo.
    if (!re.allowed && re.blockedBy === "function") {
      return {
        ...base,
        status: "blocked",
        nextFunctionKey: re.nextFunctionKey ?? null,
        retried,
        message: re.message || `${targetName} não tem etapa compatível.`,
        softMessages,
      };
    }
    if ((re.nextFunctionKey ?? null) !== (nextFunctionKey ?? null)) {
      return {
        ...base,
        status: "stale",
        nextFunctionKey: re.nextFunctionKey ?? null,
        retried,
        message:
          "A demanda mudou de etapa enquanto a transferência era processada. Recarregue e tente novamente.",
        softMessages,
      };
    }

    const newSuggestion = re.allowed ? null : re.suggestion;
    if (!re.allowed && !newSuggestion) {
      return {
        ...base,
        status: "blocked",
        nextFunctionKey,
        stageChanged,
        retried,
        message: `${targetName} não tem nenhum horário livre compatível nos próximos dias.`,
        softMessages,
      };
    }
    reschedule = newSuggestion ? slotOf(newSuggestion) : reschedule;
    try {
      res = await runApply(nextFunctionKey, reschedule, re.direction ?? evaluation.direction);
    } catch {
      return { ...base, status: "error", nextFunctionKey, stageChanged, retried, softMessages };
    }
    if (res.status === "conflict") {
      return {
        ...base,
        status: "blocked",
        nextFunctionKey,
        stageChanged,
        retried,
        message:
          "O horário voltou a ser ocupado durante a transferência. Escolha outro horário manualmente.",
        softMessages,
      };
    }
  }

  if (res.status === "stale") {
    return {
      ...base,
      status: "stale",
      nextFunctionKey,
      stageChanged,
      retried,
      message:
        "A demanda foi alterada por outra ação enquanto você transferia. Recarregue e tente novamente.",
      softMessages,
    };
  }
  if (res.status === "error") {
    return { ...base, status: "error", nextFunctionKey, stageChanged, retried, softMessages };
  }

  return {
    status: "applied",
    stageChanged,
    previousFunctionKey,
    nextFunctionKey,
    rescheduled: !!reschedule,
    finalSchedule: reschedule,
    retried,
    direction: evaluation.direction,
    softMessages,
    message: buildSmartReassignMessage({
      targetName,
      stageChanged,
      stageLabel: labelOf(nextFunctionKey),
      rescheduled: !!reschedule,
      finalSchedule: reschedule,
    }),
  };
}
