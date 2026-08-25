/**
 * POLÍTICA DE RECARGA DO QUADRO (Visão Geral).
 *
 * `fetchAllCards()` busca TODOS os ativos + TODOS os arquivados + joins +
 * fallback de histórico e liga o `loading` global — a tela inteira pisca e
 * bloqueia. Usar isso após uma troca simples de etapa era a causa da lentidão
 * percebida ao "prosseguir"/trocar etapa.
 *
 * Regra: mutação PONTUAL de um card → recarga pontual daquele card
 * (`patchCardsById`, sem loading global). Somente eventos que mudam a
 * COMPOSIÇÃO do quadro (arquivar, restaurar, criar, excluir, alocação em massa)
 * justificam recarga completa.
 *
 * Puro e testável — nenhuma consulta aqui.
 */

export type BoardRefreshReason =
  | "stage_change"
  | "type_stage_change"
  | "reassign"
  | "proceed"
  | "card_saved"
  | "archive"
  | "unarchive"
  | "create"
  | "delete"
  | "bulk_allocation"
  | "release_queue";

export type BoardRefreshScope = "card" | "full";

const FULL_REFRESH_REASONS: ReadonlySet<BoardRefreshReason> = new Set<BoardRefreshReason>([
  "archive",
  "unarchive",
  "create",
  "delete",
  "bulk_allocation",
  "release_queue",
]);

export function refreshScopeFor(reason: BoardRefreshReason): BoardRefreshScope {
  return FULL_REFRESH_REASONS.has(reason) ? "full" : "card";
}

/** Recarga pontual NUNCA liga o loading global do quadro. */
export function showsGlobalLoading(reason: BoardRefreshReason): boolean {
  return refreshScopeFor(reason) === "full";
}

/**
 * Campos voláteis de uma troca de etapa/responsável. Só eles são mesclados na
 * recarga pontual — o resto do card permanece como está em memória.
 */
export const STAGE_PATCH_COLUMNS = [
  "id",
  "status_id",
  "current_function_key",
  "demand_type",
  "demand_type_key",
  "assigned_to",
  "additional_assignees",
  "work_area",
  "origin",
  "released_at",
  "client_wait_started_at",
  "updated_at",
] as const;
