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
import { isClientStageKey, userHasFunction } from "@/lib/clientStageAssignments";
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";
import { recordFlowHistory } from "@/lib/flowHistory";
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
}

export type ReassignBlockReason = "function" | "schedule";

export interface ReassignEvaluation {
  allowed: boolean;
  blockedBy?: ReassignBlockReason;
  message?: string;
  /** Etapa resolvida para o novo responsável. */
  nextFunctionKey: string | null;
  /** Etapa mantida por não haver função compatível. */
  functionRemapped: boolean;
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

  // 1. Etapas de cliente exigem função explícita.
  if (isClientStageKey(currentKey)) {
    const ok = await userHasFunction(
      tenantId,
      newAssignedTo,
      currentKey as string,
      (card.work_area as any) ?? undefined,
    );

    if (!ok) {
      return {
        ...base,
        allowed: false,
        blockedBy: "function",
        message: `${nome} não tem a função "${params.functionLabel || currentKey}" atribuída`,
      };
    }
  }

  // 2. Etapa alvo compatível com as funções do novo responsável.
  let nextFunctionKey: string | null = currentKey;
  let functionRemapped = false;
  try {
    const resolved = await resolveFunctionForAssignee(
      tenantId,
      newAssignedTo,
      card.demand_type_key ?? null,
      currentKey,
      card.id,
      { workArea: (card.work_area as any) ?? undefined, origin: (card.origin as any) ?? undefined },
    );
    if (resolved) nextFunctionKey = resolved;
    else if (currentKey) functionRemapped = true;
  } catch {
    /* mantém etapa atual */
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
      hard: conflicts.hard,
      softMessages,
      suggestion,
    };
  }

  return { ...base, nextFunctionKey, functionRemapped, softMessages };
}

export interface ApplyReassignInput {
  tenantId: string;
  card: ReassignCard;
  newAssignedTo: string | null;
  nextFunctionKey: string | null;
  /** Reagendamento aplicado junto da transferência. */
  reschedule?: { due_date: string; due_time: string; delivery_date: string; delivery_time: string } | null;
  historySource?: string;
  metadata?: Record<string, unknown>;
}

/** Grava a transferência (já validada) e registra o histórico. */
export async function applyReassign(input: ApplyReassignInput): Promise<{ error: unknown | null }> {
  const { tenantId, card, newAssignedTo, nextFunctionKey, reschedule } = input;
  const update: Record<string, any> = {
    assigned_to: newAssignedTo,
    updated_at: new Date().toISOString(),
  };
  if ((nextFunctionKey ?? null) !== (card.current_function_key ?? null)) {
    update.current_function_key = nextFunctionKey;
  }
  if (reschedule) {
    update.due_date = reschedule.due_date;
    update.due_time = reschedule.due_time;
    update.delivery_date = reschedule.delivery_date;
    update.delivery_time = reschedule.delivery_time;
  }

  const { error } = await supabase.from("demands").update(update).eq("id", card.id);
  if (error) return { error };

  if (tenantId) {
    await recordFlowHistory({
      tenantId,
      demandId: card.id,
      action: "manual_assignment",
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
  return { error: null };
}
