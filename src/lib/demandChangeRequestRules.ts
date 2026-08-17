/**
 * Regras puras das solicitações de alteração (sem dependência de rede).
 */

export type ChangeRequestStatus = "active" | "resolved" | "superseded";

export interface ChangeRequestItem {
  id: string;
  request_id: string;
  tenant_id: string;
  text: string;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ChangeRequest {
  id: string;
  tenant_id: string;
  demand_id: string;
  requested_by: string | null;
  source_function_key: string | null;
  target_function_key: string | null;
  notes: string | null;
  status: ChangeRequestStatus;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export interface ChangeRequestWithItems extends ChangeRequest {
  items: ChangeRequestItem[];
}

/* ============================ LÓGICA PURA ============================ */

/** Itens ativos ainda não concluídos da solicitação ATIVA. */
export function countPendingItems(request: ChangeRequestWithItems | null | undefined): number {
  if (!request || request.status !== "active") return 0;
  return request.items.filter((i) => !i.is_completed).length;
}

/** Progresso "X de Y concluídos". */
export function computeProgress(request: ChangeRequestWithItems | null | undefined): {
  done: number;
  total: number;
} {
  const items = request?.items ?? [];
  return { done: items.filter((i) => i.is_completed).length, total: items.length };
}

/**
 * A aba "Alterações" só sequestra a abertura do card quando existe solicitação
 * ativa COM checklist pendente. Texto puro não sequestra.
 */
export function shouldOpenAlterationsTab(
  request: ChangeRequestWithItems | null | undefined,
  opts: { isDraft?: boolean } = {},
): boolean {
  if (opts.isDraft) return false;
  return countPendingItems(request) > 0;
}

/** A aba existe se houver qualquer solicitação (ativa ou histórica). */
export function hasAnyChangeRequest(
  active: ChangeRequestWithItems | null | undefined,
  history: ChangeRequest[] | null | undefined,
): boolean {
  return !!active || (history?.length ?? 0) > 0;
}

/** Uma solicitação com itens e todos concluídos deve ser resolvida. */
export function shouldAutoResolve(request: ChangeRequestWithItems | null | undefined): boolean {
  if (!request || request.status !== "active") return false;
  if (request.items.length === 0) return false;
  return request.items.every((i) => i.is_completed);
}

/** Normaliza itens digitados no modal: remove vazios e reindexa posições. */
export function normalizeDraftItems(texts: string[]): { text: string; position: number }[] {
  return texts
    .map((t) => (t ?? "").trim())
    .filter((t) => t.length > 0)
    .map((text, position) => ({ text, position }));
}

/** Uma solicitação vazia (sem texto e sem itens) não deve ser criada. */
export function isEmptyChangeRequestDraft(notes: string, itemTexts: string[]): boolean {
  return (notes ?? "").trim().length === 0 && normalizeDraftItems(itemTexts).length === 0;
}


/* ===================== MODO DO MODAL / VISIBILIDADE ===================== */

/** Contexto de criação da solicitação. */
export type ChangeRequestMode = "regress" | "standalone";

/**
 * A aba "Alterações" é SEMPRE visível em card já salvo — independente de
 * existir solicitação, de a demanda ter voltado de etapa ou da etapa atual.
 * Rascunho não salvo é a única exceção.
 */
export function shouldShowAlterationsTab(opts: { isDraft?: boolean } = {}): boolean {
  return !opts.isDraft;
}

/**
 * Regressão pode ser confirmada vazia (só volta o card, sem criar request).
 * Solicitação avulsa exige texto OU pelo menos um item válido.
 */
export function canConfirmChangeRequest(
  mode: ChangeRequestMode,
  notes: string,
  itemTexts: string[],
): boolean {
  if (mode === "regress") return true;
  return !isEmptyChangeRequestDraft(notes, itemTexts);
}
