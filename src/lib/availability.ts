/**
 * DISPONIBILIDADE como SERVIÇO do sistema.
 *
 * Toda tela (TaskCard, Visão Geral, criação manual, alocação em massa) responde
 * à mesma pergunta com o MESMO motor (`scheduleOccupancy`): "esta pessoa cabe
 * nesta janela e, se não, qual é o próximo espaço livre dela?".
 *
 * Nunca replique matriz de duração, expediente, feriados ou timezone fora daqui.
 */
import {
  checkAssignmentConflicts,
  suggestFreeSlot,
  isUntimedStage,
  type FreeSlotSuggestion,
  type OccupancyCardInput,
  type WorkArea,
} from "@/lib/scheduleOccupancy";
import { DEFAULT_WORK_HOURS } from "@/lib/reorderSequence";

export interface AssigneeAvailability {
  /** A janela pedida está livre (ou a etapa não ocupa agenda). */
  availableNow: boolean;
  /** Etapa client-facing/sem prazo: não ocupa agenda operacional. */
  untimed: boolean;
  conflictReason: string | null;
  suggestedSlot: FreeSlotSuggestion | null;
  timezone: string;
}

export interface ResolveAvailabilityParams {
  tenantId: string;
  userId: string | null;
  card: OccupancyCardInput;
  targetStage?: string | null;
  area?: WorkArea | null;
  /** Janela desejada; ausente = usa as datas do próprio card. */
  preferredSchedule?: {
    due_date?: string | null;
    due_time?: string | null;
    delivery_date?: string | null;
    delivery_time?: string | null;
  } | null;
  /** Não buscar próximo slot (economiza consultas). */
  skipSuggestion?: boolean;
}

const EMPTY = (tz: string): AssigneeAvailability => ({
  availableNow: true,
  untimed: false,
  conflictReason: null,
  suggestedSlot: null,
  timezone: tz,
});

export async function resolveAssigneeAvailability(
  params: ResolveAvailabilityParams,
): Promise<AssigneeAvailability> {
  const tz = DEFAULT_WORK_HOURS.tz;
  const { tenantId, userId } = params;
  if (!tenantId || !userId) return EMPTY(tz);

  const stage = params.targetStage ?? params.card.current_function_key ?? null;
  if (isUntimedStage(stage)) {
    return { ...EMPTY(tz), untimed: true };
  }

  const card: OccupancyCardInput = {
    ...params.card,
    current_function_key: stage,
    ...(params.preferredSchedule
      ? {
          due_date: params.preferredSchedule.due_date ?? params.card.due_date ?? null,
          due_time: params.preferredSchedule.due_time ?? params.card.due_time ?? null,
          delivery_date: params.preferredSchedule.delivery_date ?? null,
          delivery_time: params.preferredSchedule.delivery_time ?? null,
        }
      : {}),
  };

  const conflicts = await checkAssignmentConflicts({
    tenantId,
    userId,
    card,
    targetStage: stage,
    area: params.area ?? null,
  });

  const hasWindow = !!card.due_date || !!card.publish_date;
  const available = conflicts.hard.length === 0;

  let suggestedSlot: FreeSlotSuggestion | null = null;
  if (!params.skipSuggestion && (!available || !hasWindow)) {
    try {
      suggestedSlot = await suggestFreeSlot({
        tenantId,
        userId,
        card,
        targetStage: stage,
        area: params.area ?? null,
      });
    } catch {
      suggestedSlot = null;
    }
  }

  return {
    availableNow: available,
    untimed: false,
    conflictReason: available ? null : conflicts.hard[0]?.message || "Horário ocupado.",
    suggestedSlot,
    timezone: tz,
  };
}

/** `Hoje 16:15–16:35` / `20/08 09:00–09:20` (relativo à data de referência). */
export function describeSlot(
  slot: FreeSlotSuggestion,
  todayISO?: string,
): string {
  const [y, m, d] = slot.date.split("-");
  const label = todayISO && slot.date === todayISO ? "Hoje" : `${d}/${m}`;
  void y;
  return `${label} ${slot.startTime}–${slot.endTime}`;
}
