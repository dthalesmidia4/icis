import { supabase } from "@/integrations/supabase/client";

/**
 * SOLICITAÇÕES DE ALTERAÇÃO (aba "Alterações" do card)
 *
 * Estrutura dedicada e auditável: `demand_change_requests` +
 * `demand_change_request_items`. Nunca usa `demands.observations`.
 */

export * from "./demandChangeRequestRules";
import { normalizeChangeRequestDraft, type ChangeRequest, type ChangeRequestItem, type ChangeRequestWithItems } from "./demandChangeRequestRules";

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

  let active = withItems.find((r) => r.status === "active") ?? null;
  // Correção de dados legados: request ATIVA com notes e sem checklist fica
  // impossível de concluir. Cria 1 item pendente derivado de notes.
  if (active && active.items.length === 0 && (active.notes ?? "").trim().length > 0) {
    active = (await ensureActiveRequestChecklist(active)) ?? active;
  }
  const history = withItems.filter((r) => r.id !== active?.id);
  return { active, history };
}

/** Backfill idempotente de 1 item derivado de `notes` (apenas request ativa). */
async function ensureActiveRequestChecklist(
  request: ChangeRequestWithItems,
): Promise<ChangeRequestWithItems | null> {
  const text = (request.notes ?? "").trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from(ITEMS)
    .insert({
      request_id: request.id,
      tenant_id: request.tenant_id,
      text,
      position: 0,
    } as any)
    .select("*")
    .single();
  if (error || !data) {
    console.warn("[changeRequests] backfill item error", error);
    return null;
  }
  return { ...request, items: [data as unknown as ChangeRequestItem] };
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
  const { notes, items } = normalizeChangeRequestDraft(input.notes, input.itemTexts);
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
      notes,
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

/**
 * Exclui uma solicitação (ativa ou histórica). Os itens de checklist saem por
 * ON DELETE CASCADE. Não toca em `demands` nem em outras solicitações.
 */
export async function deleteChangeRequest(requestId: string): Promise<void> {
  const { error } = await supabase.from(REQ).delete().eq("id", requestId);
  if (error) throw error;
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
