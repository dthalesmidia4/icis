import { supabase } from "@/integrations/supabase/client";

/**
 * SOLICITAÇÕES DE ALTERAÇÃO (aba "Alterações" do card)
 *
 * Estrutura dedicada e auditável: `demand_change_requests` +
 * `demand_change_request_items`. Nunca usa `demands.observations`.
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

/* ============================ PERSISTÊNCIA ============================ */

const REQ = "demand_change_requests" as any;
const ITEMS = "demand_change_request_items" as any;

/** Carrega a solicitação ativa (com itens) + histórico resumido. */
export async function loadChangeRequests(demandId: string): Promise<{
  active: ChangeRequestWithItems | null;
  history: ChangeRequestWithItems[];
}> {
  const { data, error } = await supabase
    .from(REQ)
    .select("*")
    .eq("demand_id", demandId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[changeRequests] load error", error);
    return { active: null, history: [] };
  }
  const requests = ((data as any[]) || []) as ChangeRequest[];
  if (requests.length === 0) return { active: null, history: [] };

  const { data: itemRows } = await supabase
    .from(ITEMS)
    .select("*")
    .in("request_id", requests.map((r) => r.id))
    .order("position", { ascending: true });
  const items = ((itemRows as any[]) || []) as ChangeRequestItem[];

  const withItems: ChangeRequestWithItems[] = requests.map((r) => ({
    ...r,
    items: items.filter((i) => i.request_id === r.id),
  }));

  const active = withItems.find((r) => r.status === "active") ?? null;
  const history = withItems.filter((r) => r.id !== active?.id);
  return { active, history };
}

/**
 * Cria uma solicitação de alteração. A anterior ativa vira 'superseded'
 * para preservar histórico (nunca apaga dados).
 */
export async function createChangeRequest(input: {
  tenantId: string;
  demandId: string;
  notes: string;
  itemTexts: string[];
  sourceFunctionKey?: string | null;
  targetFunctionKey?: string | null;
}): Promise<{ requestId: string; itemCount: number }> {
  const items = normalizeDraftItems(input.itemTexts);
  const { data: userRes } = await supabase.auth.getUser();
  const requestedBy = userRes?.user?.id ?? null;

  await supabase
    .from(REQ)
    .update({ status: "superseded", updated_at: new Date().toISOString() } as any)
    .eq("demand_id", input.demandId)
    .eq("status", "active");

  const { data, error } = await supabase
    .from(REQ)
    .insert({
      tenant_id: input.tenantId,
      demand_id: input.demandId,
      requested_by: requestedBy,
      source_function_key: input.sourceFunctionKey ?? null,
      target_function_key: input.targetFunctionKey ?? null,
      notes: (input.notes ?? "").trim() || null,
      status: "active",
    } as any)
    .select("id")
    .single();
  if (error || !data) throw error || new Error("Falha ao criar solicitação de alteração.");

  const requestId = (data as any).id as string;

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from(ITEMS).insert(
      items.map((i) => ({
        request_id: requestId,
        tenant_id: input.tenantId,
        text: i.text,
        position: i.position,
      })) as any,
    );
    if (itemsError) {
      // Rollback lógico: não deixa solicitação ativa incoerente.
      await supabase.from(REQ).delete().eq("id", requestId);
      throw itemsError;
    }
  }

  return { requestId, itemCount: items.length };
}

/** Rollback lógico usado quando o movimento do card falha após criar a request. */
export async function deleteChangeRequest(requestId: string): Promise<void> {
  await supabase.from(REQ).delete().eq("id", requestId);
}

/** Marca/desmarca um item. */
export async function setItemCompleted(
  itemId: string,
  completed: boolean,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from(ITEMS)
    .update({
      is_completed: completed,
      completed_by: completed ? userId : null,
      completed_at: completed ? new Date().toISOString() : null,
    } as any)
    .eq("id", itemId);
  if (error) throw error;
}

/** Marca TODOS os itens pendentes de uma solicitação como concluídos. */
export async function completeAllPendingItems(
  requestId: string,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from(ITEMS)
    .update({
      is_completed: true,
      completed_by: userId,
      completed_at: new Date().toISOString(),
    } as any)
    .eq("request_id", requestId)
    .eq("is_completed", false);
  if (error) throw error;
}

/** Resolve a solicitação (status='resolved'). */
export async function resolveChangeRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from(REQ)
    .update({ status: "resolved", resolved_at: new Date().toISOString() } as any)
    .eq("id", requestId)
    .eq("status", "active");
  if (error) console.warn("[changeRequests] resolve error", error);
}
