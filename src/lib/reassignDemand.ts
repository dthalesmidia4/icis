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
import { userHasFunction } from "@/lib/clientStageAssignments";
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";
import { recordFlowHistory } from "@/lib/flowHistory";
import { applyFlowReactivation } from "@/lib/reactivateDemand";
import { commitFlowTransition } from "@/lib/flowTransition";
import {
  checkAssignmentConflicts,
  suggestFreeSlot,
  type AssignmentConflict,
  type FreeSlotSuggestion,
  type OccupancyCardInput,
  type WorkArea,
} from "@/lib/scheduleOccupancy";

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
    const holdsCurrent = await userHasFunction(
      tenantId,
      newAssignedTo,
      currentKey,
      (card.work_area as any) ?? undefined,
    );

    if (!holdsCurrent) {
      let resolved: string | null = null;
      try {
        resolved = await resolveFunctionForAssignee(
          tenantId,
          newAssignedTo,
          card.demand_type_key ?? null,
          currentKey,
          card.id,
          {
            workArea: (card.work_area as any) ?? undefined,
            origin: (card.origin as any) ?? undefined,
            mode: params.mode ?? "administrative_reassign",
          },
        );
      } catch {
        resolved = null;
      }

      const usableStage =
        !!resolved &&
        resolved !== currentKey &&
        (await userHasFunction(tenantId, newAssignedTo, resolved, (card.work_area as any) ?? undefined));

      if (!usableStage) {
        return {
          ...base,
          allowed: false,
          blockedBy: "function",
          message: `${nome} não tem etapa OPERACIONAL habilitada compatível com "${stageLabel}" na área ${areaLabel}`,
        };
      }

      nextFunctionKey = resolved;
      functionRemapped = true;
      direction = await stageDirection(
        tenantId,
        (card.work_area as any) ?? undefined,
        currentKey,
        resolved as string,
      );
      remapMessage =
        direction === "backward"
          ? `Etapa ajustada: o card voltou para "${resolved}" (etapa habilitada de ${nome}).`
          : `Etapa ajustada: o card avançou para "${resolved}" (etapa habilitada de ${nome}).`;
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

/** Compara a posição de duas etapas na área para saber se houve regressão. */
async function stageDirection(
  tenantId: string,
  workArea: string | null | undefined,
  fromKey: string,
  toKey: string,
): Promise<"same" | "forward" | "backward"> {
  if (fromKey === toKey) return "same";
  const area = workArea === "sistemas" ? "sistemas" : "midia";
  const { data } = await (supabase.from("flow_functions") as any)
    .select("function_key, position")
    .eq("tenant_id", tenantId)
    .eq("work_area", area)
    .in("function_key", [fromKey, toKey]);
  const rows = (data || []) as Array<{ function_key: string; position: number }>;
  const from = rows.find((r) => r.function_key === fromKey)?.position;
  const to = rows.find((r) => r.function_key === toKey)?.position;
  if (from == null || to == null) return "forward";
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

  const update: Record<string, any> = {
    assigned_to: newAssignedTo,
    updated_at: new Date().toISOString(),
  };
  if ((nextFunctionKey ?? null) !== (card.current_function_key ?? null)) {
    update.current_function_key = nextFunctionKey;
  }
  // Colaboradores extras pertencem à CAPTAÇÃO: sair de `captar` limpa a lista;
  // dentro dela o novo principal nunca fica duplicado nos extras.
  // (mesma regra já aplicada na alocação em massa)
  const extras = normalizeAdditionalAssignees({
    extras: card.additional_assignees ?? null,
    currentFunctionKey: card.current_function_key ?? null,
    nextFunctionKey: nextFunctionKey ?? null,
    newAssignedTo,
  });
  if (extras) update.additional_assignees = extras.value;
  if (reschedule) {
    update.due_date = reschedule.due_date;
    update.due_time = reschedule.due_time;
    update.delivery_date = reschedule.delivery_date;
    update.delivery_time = reschedule.delivery_time;
  }


  await applyFlowReactivation(update, card.id, newAssignedTo);

  const commit = await commitFlowTransition({
    demandId: card.id,
    payload: update,
    expectedAssignee: card.assigned_to ?? null,
    expectedFunctionKey: card.current_function_key ?? null,
  });

  if (commit.status === "error") return { status: "error", error: commit.error };
  if (commit.status === "stale") return { status: "stale", error: null };

  if (tenantId) {
    await recordFlowHistory({
      tenantId,
      demandId: card.id,
      action: input.direction === "backward" ? "moved_back" : "manual_assignment",
      fromUserId: card.assigned_to ?? null,
      toUserId: newAssignedTo,
      fromFunctionKey: card.current_function_key ?? null,
      toFunctionKey: nextFunctionKey,
      metadata: {
        source: input.historySource || "reassign",
        rescheduled: !!reschedule,
        ...(input.metadata || {}),
      },
    });
  }
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
