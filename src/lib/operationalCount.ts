/**
 * SEMÂNTICA ÚNICA de contagem de demandas por colaborador.
 *
 * A Visão Geral esconde da FILA OPERACIONAL os cards com publicação agendada
 * (dispatch ativo). Sem um helper compartilhado, cada tela contava de um jeito
 * diferente — foi assim que "Lúcia 37" apareceu como "66" na alocação em massa.
 */

import {
  isScheduledPublishStage,
  isPendingScheduledReview,
  operationalToday,
} from "@/lib/scheduledPublishStage";

export interface CountableDemandRow {
  id: string;
  current_function_key?: string | null;
  assigned_to?: string | null;
  archived_at?: string | null;
  is_draft?: boolean | null;
  publish_date?: string | null;
}

export interface OperationalCounts {
  /** Ativas não arquivadas / não rascunho (ownership principal). */
  totalActiveDemandCount: number;
  /** Ativas com publicação agendada — fora da fila operacional. */
  scheduledDemandCount: number;
  /** Fila que o usuário reconhece no Kanban. */
  operationalDemandCount: number;
}

export function isActiveOwnedRow(row: CountableDemandRow, userId: string): boolean {
  if (!row) return false;
  // `additional_assignees` é participação extra, NUNCA ownership principal.
  if ((row.assigned_to ?? null) !== userId) return false;
  if (row.archived_at) return false;
  if (row.is_draft) return false;
  return true;
}

/** Conta as demandas de UM responsável separando fila operacional × agendadas. */
export function countOperationalDemands(
  rows: CountableDemandRow[],
  userId: string,
  activeDispatchIds: Set<string> | ReadonlySet<string>,
  today: string = operationalToday(),
): OperationalCounts {
  let total = 0;
  let scheduled = 0;
  for (const row of rows) {
    if (!isActiveOwnedRow(row, userId)) continue;
    total += 1;
    // Fora da fila operacional: dispatch ativo, etapa canônica `publicar` ou
    // conferência de publicação (`revisar_publicacao`) com data futura.
    if (
      activeDispatchIds.has(row.id) ||
      isScheduledPublishStage(row) ||
      isPendingScheduledReview(row, today)
    ) {
      scheduled += 1;
    }
  }
  return {
    totalActiveDemandCount: total,
    scheduledDemandCount: scheduled,
    operationalDemandCount: total - scheduled,
  };
}


/** Texto secundário canônico: `+29 com publicação agendada · 66 ativas no total`. */
export function describeCollaboratorCounts(counts: OperationalCounts): string | null {
  if (counts.scheduledDemandCount === 0) return null;
  return `+${counts.scheduledDemandCount} com publicação agendada · ${counts.totalActiveDemandCount} ativas no total`;
}
