/**
 * PONTO ÚNICO de transferência de responsável.
 *
 * Todo caminho que muda `assigned_to` deve passar por aqui, na ordem:
 *   1. validação de função (etapas de cliente)
 *   2. resolução da etapa alvo para o novo responsável
 *   3. verificação de OCUPAÇÃO DE AGENDA (mesma área e entre áreas)
 *   4. gravação + histórico
 *
 * Conflito duro NUNCA é gravado: a decisão volta para a UI.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  loadFlowSequenceKeys,
  previewStageForAssignee,
  transitionDemand,
  type StagePreviewCard,
} from "@/lib/demandTransition";
import { applyFlowReactivation } from "@/lib/reactivateDemand";

import {
  checkAssignmentConflicts,
  suggestFreeSlot,
  type AssignmentConflict,
  type FreeSlotSuggestion,
  type OccupancyCardInput,
  type WorkArea,
} from "@/lib/scheduleOccupancy";
import { normalizeAdditionalAssignees } from "@/lib/reassignRules";

export interface ReassignCard extends OccupancyCardInput {
  id: string;
  tenant_id?: string | null;
  assigned_to?: string | null;
  origin?: string | null;
  additional_assignees?: string[] | null;
}

export { normalizeAdditionalAssignees };

export type ReassignBlockReason = "function" | "schedule";



export interface ReassignEvaluation {
  allowed: boolean;
  blockedBy?: ReassignBlockReason;
  message?: string;
  /** Etapa resolvida para o novo responsável. */
  nextFunctionKey: string | null;
  /** Etapa mantida por não haver função compatível. */
  functionRemapped: boolean;
  /** Sentido do remapeamento de etapa: mesma, adiante ou regressão. */
  direction?: "same" | "forward" | "backward";
  /** Mensagem informativa quando a etapa foi ajustada ao fluxo do novo responsável. */
  remapMessage?: string;
  hard: AssignmentConflict[];
  softMessages: string[];
  suggestion: FreeSlotSuggestion | null;
}


/**
 * Avalia a transferência sem gravar nada.
 */
export async function evaluateReassign(params: {
  tenantId: string;
  card: ReassignCard;
  newAssignedTo: string | null;
  collaboratorName?: string;
  functionLabel?: string;
  /** Quando true, não busca sugestão de slot livre (economiza consultas). */
  skipSuggestion?: boolean;
  /**
   * `administrative` (default) = só troca de responsável: a etapa nunca pode
   * pular automaticamente para uma etapa client-facing. Use `flow` apenas em
   * transições reais de processo.
   */
  mode?: "flow" | "administrative_reassign";
}): Promise<ReassignEvaluation> {
  const { tenantId, card, newAssignedTo } = params;
  const currentKey = card.current_function_key ?? null;
  const nome = params.collaboratorName || "Este colaborador";

  const base: ReassignEvaluation = {
    allowed: true,
    nextFunctionKey: currentKey,
    functionRemapped: false,
    hard: [],
    softMessages: [],
    suggestion: null,
  };

  if (!newAssignedTo) {
    return { ...base, nextFunctionKey: null };
  }
  if (!tenantId) return base;

  // QUALQUER etapa exige função atribuída ao novo responsável (na área do card).
  // Se ele não tiver a etapa atual, a etapa é remapeada para uma que ele possa
  // exercer: primeiro à frente (não regride) e, como último recurso, a etapa
  // habilitada mais próxima atrás. Só bloqueia quando não existe nenhuma.
  const areaLabel = (card.work_area as any) === "sistemas" ? "Sistemas" : "Mídia";
  const stageLabel = params.functionLabel || currentKey || "etapa atual";
  let nextFunctionKey: string | null = currentKey;
  let functionRemapped = false;
  let direction: "same" | "forward" | "backward" = "same";
  let remapMessage: string | undefined;

  if (currentKey) {
    // A DECISÃO DE ETAPA É DO KERNEL DO BANCO (mesmas funções usadas no commit).
    // Nenhum fallback local escolhe etapa: se o kernel não devolve etapa, não
    // existe etapa válida deste fluxo para o colaborador.
    const resolved = await previewStageForAssignee({
      tenantId,
      card: {
        id: card.id,
        demand_type_key: card.demand_type_key ?? null,
        work_area: (card.work_area as any) ?? null,
        origin: card.origin ?? null,
        current_function_key: currentKey,
      },
      userId: newAssignedTo,
      administrative: (params.mode ?? "administrative_reassign") === "administrative_reassign",
    });

    if (!resolved) {
      return {
        ...base,
        allowed: false,
        blockedBy: "function",
        message: `${nome} não tem nenhuma etapa OPERACIONAL válida na área ${areaLabel} (fluxo de "${stageLabel}")`,
      };
    }

    nextFunctionKey = resolved;
    if (resolved !== currentKey) {
      functionRemapped = true;
      direction = await stageDirection(tenantId, card, currentKey, resolved);
      remapMessage =
        direction === "backward"
          ? `Etapa ajustada: o card voltou para "${resolved}" (etapa válida de ${nome}).`
          : `Etapa ajustada: o card avançou para "${resolved}" (etapa válida de ${nome}).`;
    }
  }




  // 3. Ocupação de agenda do novo responsável.
  const conflicts = await checkAssignmentConflicts({
    tenantId,
    userId: newAssignedTo,
    card,
    targetStage: nextFunctionKey,
    area: (card.work_area as WorkArea) ?? null,
  });

  const softMessages: string[] = [];
  if (conflicts.scheduleMessage && !conflicts.scheduleHard) {
    softMessages.push(conflicts.scheduleMessage);
  }

  if (conflicts.hard.length > 0) {
    let suggestion: FreeSlotSuggestion | null = null;
    if (!params.skipSuggestion) {
      try {
        suggestion = await suggestFreeSlot({
          tenantId,
          userId: newAssignedTo,
          card,
          targetStage: nextFunctionKey,
          area: (card.work_area as WorkArea) ?? null,
        });
      } catch {
        suggestion = null;
      }
    }
    return {
      allowed: false,
      blockedBy: "schedule",
      message: `${nome} já tem demanda ocupando este horário.`,
      nextFunctionKey,
      functionRemapped,
      direction,
      remapMessage,
      hard: conflicts.hard,
      softMessages,
      suggestion,
    };
  }

  return { ...base, nextFunctionKey, functionRemapped, direction, remapMessage, softMessages };
}

/**
 * Sentido do remapeamento, medido na SEQUÊNCIA REAL do fluxo (kernel do banco),
 * não na lista bruta de funções da área.
 */
async function stageDirection(
  tenantId: string,
  card: StagePreviewCard,
  fromKey: string,
  toKey: string,
): Promise<"same" | "forward" | "backward"> {
  if (fromKey === toKey) return "same";
  const seq = await loadFlowSequenceKeys({ tenantId, card });
  const from = seq.indexOf(fromKey);
  const to = seq.indexOf(toKey);
  if (from < 0 || to < 0) return "forward";
  return to < from ? "backward" : "forward";
}



export interface ApplyReassignInput {
  tenantId: string;
  card: ReassignCard;
  newAssignedTo: string | null;
  nextFunctionKey: string | null;
  /** Reagendamento aplicado junto da transferência. */
  reschedule?: { due_date: string; due_time: string; delivery_date: string; delivery_time: string } | null;
  /** Sentido do remapeamento de etapa (vindo de evaluateReassign). */
  direction?: "same" | "forward" | "backward";
  historySource?: string;
  metadata?: Record<string, unknown>;
}


export type ApplyReassignResult =
  | { status: "ok"; error: null }
  | { status: "stale"; error: null }
  | { status: "conflict"; error: null; hard: AssignmentConflict[]; message: string }
  | { status: "error"; error: unknown };

/**
 * Grava a transferência com compare-and-set: só efetiva se o card ainda estiver
 * no responsável/etapa que a UI leu. Antes de gravar, reconfere o slot — entre a
 * avaliação e o clique de confirmação outra pessoa pode ter ocupado o horário.
 */
export async function applyReassign(input: ApplyReassignInput): Promise<ApplyReassignResult> {
  const { tenantId, card, newAssignedTo, nextFunctionKey, reschedule } = input;

  // Reconferência de agenda com a janela final (já com eventual reagendamento).
  if (newAssignedTo) {
    const probeCard: ReassignCard = reschedule
      ? {
          ...card,
          due_date: reschedule.due_date,
          due_time: reschedule.due_time,
          delivery_date: reschedule.delivery_date,
          delivery_time: reschedule.delivery_time,
        }
      : card;
    const recheck = await checkAssignmentConflicts({
      tenantId,
      userId: newAssignedTo,
      card: probeCard,
      targetStage: nextFunctionKey,
      area: (card.work_area as WorkArea) ?? null,
    });
    if (recheck.hard.length > 0) {
      return {
        status: "conflict",
        error: null,
        hard: recheck.hard,
        message: "O horário foi ocupado por outra demanda enquanto você decidia.",
      };
    }
  }

  // Agenda vai DENTRO da transição: o kernel grava tuple + datas de uma vez
  // (e também desarquiva / sai de status final quando o card volta ao fluxo).
  const schedule = reschedule
    ? {
        due_date: reschedule.due_date,
        due_time: reschedule.due_time,
        delivery_date: reschedule.delivery_date,
        delivery_time: reschedule.delivery_time,
      }
    : undefined;

  // AUTORIDADE ÚNICA: o banco decide/valida etapa, responsável e histórico.
  const result = await transitionDemand({
    demandId: card.id,
    intent: !newAssignedTo
      ? "unassign"
      : input.direction === "backward"
        ? "move_back"
        : "reassign",
    targetUserId: newAssignedTo,
    targetFunctionKey: newAssignedTo ? (nextFunctionKey ?? undefined) : undefined,
    administrative: true,
    schedule,
    expected: {
      assignedTo: card.assigned_to ?? null,
      functionKey: card.current_function_key ?? null,
    },
    source: input.historySource || "reassign",
    metadata: { rescheduled: !!reschedule, ...(input.metadata || {}) },
  });

  if (result.status === "stale") return { status: "stale", error: null };
  if (result.status === "blocked" || result.status === "end") {
    return { status: "conflict", error: null, hard: [], message: result.message };
  }
  if (result.status === "error") return { status: "error", error: result.message };

  return { status: "ok", error: null };
}




/**
 * Mensagem de falha (ou null quando a transferência foi efetivada).
 * Centraliza o tratamento para todos os pontos de UI.
 */
export function reassignFailureMessage(result: ApplyReassignResult): string | null {
  switch (result.status) {
    case "ok":
      return null;
    case "stale":
      return "A demanda foi alterada por outra ação enquanto você transferia. Recarregue e tente novamente.";
    case "conflict":
      return result.message;
    default:
      return "Não foi possível transferir a demanda.";
  }
}
