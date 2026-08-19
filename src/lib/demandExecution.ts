/**
 * EXECUÇÃO OPERACIONAL POR PASSAGEM — persistência.
 *
 * Tabelas: `demand_execution_runs` + `demand_execution_items`.
 * O banco garante no máximo UM run ativo por demanda (índice único parcial),
 * por isso a criação sempre fecha o run ativo anterior antes de inserir.
 */
import { supabase } from "@/integrations/supabase/client";

export * from "./demandExecutionRules";
import {
  closingStatusFor,
  countPendingExecutionItems,
  nextPassNumber,
  normalizeExecutionItemTexts,
  runMatchesContext,
  type ExecutionContext,
  type ExecutionItem,
  type ExecutionRun,
  type ExecutionRunWithItems,
} from "./demandExecutionRules";

const RUNS = "demand_execution_runs" as any;
const ITEMS = "demand_execution_items" as any;

export interface LoadExecutionResult {
  active: ExecutionRunWithItems | null;
  history: ExecutionRunWithItems[];
}

/** Carrega o run ativo (com itens) e o histórico das passagens anteriores. */
export async function loadExecutionRuns(demandId: string): Promise<LoadExecutionResult> {
  const { data, error } = await supabase
    .from(RUNS)
    .select("*")
    .eq("demand_id", demandId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[demandExecution] load error", error);
    return { active: null, history: [] };
  }
  const runs = ((data as any[]) || []) as ExecutionRun[];
  if (runs.length === 0) return { active: null, history: [] };

  const { data: itemRows } = await supabase
    .from(ITEMS)
    .select("*")
    .in("execution_run_id", runs.map((r) => r.id))
    .order("position", { ascending: true });
  const items = ((itemRows as any[]) || []) as ExecutionItem[];

  const withItems: ExecutionRunWithItems[] = runs.map((r) => ({
    ...r,
    metadata: (r.metadata as any) ?? {},
    items: items.filter((i) => i.execution_run_id === r.id),
  }));

  const active = withItems.find((r) => r.status === "active") ?? null;
  return { active, history: withItems.filter((r) => r.id !== active?.id) };
}

/**
 * Fecha o run ativo de uma demanda. `completed` quando tudo foi feito,
 * `completed_with_pending` quando o responsável passou o card com pendências.
 */
export async function closeActiveExecutionRun(params: {
  demandId: string;
  reason: string;
  /** Estado já carregado (evita reconsulta). */
  active?: ExecutionRunWithItems | null;
  status?: "completed" | "completed_with_pending" | "superseded" | "cancelled";
}): Promise<void> {
  try {
    const active =
      params.active !== undefined
        ? params.active
        : (await loadExecutionRuns(params.demandId)).active;
    if (!active) return;
    const status = params.status ?? closingStatusFor(active);
    const { error } = await supabase
      .from(RUNS)
      .update({
        status,
        completed_at: new Date().toISOString(),
        metadata: {
          ...(active.metadata ?? {}),
          close_reason: params.reason,
          pending_on_close: countPendingExecutionItems(active),
        },
      } as any)
      .eq("id", active.id)
      .eq("status", "active");
    if (error) console.warn("[demandExecution] close error", error);
  } catch (err) {
    console.warn("[demandExecution] close unexpected error", err);
  }
}

/**
 * Garante um run ativo para a passagem atual. Se o run ativo é de outra
 * passagem (etapa/tipo/responsável diferentes), ele é fechado e um novo nasce.
 */
export async function ensureExecutionRun(params: {
  tenantId: string;
  demandId: string;
  context: ExecutionContext;
  /** Itens iniciais (opcional) — normalmente vazio: o responsável escreve. */
  itemTexts?: string[];
  metadata?: Record<string, unknown>;
}): Promise<ExecutionRunWithItems | null> {
  const { tenantId, demandId, context } = params;
  const current = await loadExecutionRuns(demandId);

  if (current.active && runMatchesContext(current.active, context)) return current.active;

  if (current.active) {
    await closeActiveExecutionRun({
      demandId,
      reason: "context_changed",
      active: current.active,
      status: "superseded",
    });
  }

  const allRuns = [...(current.active ? [current.active] : []), ...current.history];
  const { data: userRes } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from(RUNS)
    .insert({
      tenant_id: tenantId,
      demand_id: demandId,
      function_key: context.functionKey,
      demand_type_key: context.demandTypeKey,
      assigned_to: context.assignedTo,
      pass_number: nextPassNumber(allRuns, context.functionKey),
      status: "active",
      created_by: userRes?.user?.id ?? null,
      metadata: params.metadata ?? {},
    } as any)
    .select("*")
    .single();

  if (error || !data) {
    console.warn("[demandExecution] create run error", error);
    // Corrida: outro cliente criou o run ativo primeiro — reaproveita.
    const retry = await loadExecutionRuns(demandId);
    return retry.active;
  }

  const run = { ...(data as any), metadata: (data as any).metadata ?? {}, items: [] } as ExecutionRunWithItems;

  const initial = normalizeExecutionItemTexts(params.itemTexts ?? []);
  if (initial.length > 0) {
    const { data: inserted, error: itemsError } = await supabase
      .from(ITEMS)
      .insert(
        initial.map((i) => ({
          execution_run_id: run.id,
          tenant_id: tenantId,
          text: i.text,
          position: i.position,
        })) as any,
      )
      .select("*");
    if (itemsError) console.warn("[demandExecution] initial items error", itemsError);
    else run.items = ((inserted as any[]) || []) as ExecutionItem[];
  }

  return run;
}

/** Acrescenta um item ao final do checklist da passagem. */
export async function addExecutionItem(params: {
  runId: string;
  tenantId: string;
  text: string;
  position: number;
}): Promise<ExecutionItem | null> {
  const text = (params.text ?? "").trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from(ITEMS)
    .insert({
      execution_run_id: params.runId,
      tenant_id: params.tenantId,
      text,
      position: params.position,
    } as any)
    .select("*")
    .single();
  if (error) throw error;
  return (data as any) as ExecutionItem;
}

export async function updateExecutionItemText(itemId: string, text: string): Promise<void> {
  const value = (text ?? "").trim();
  if (!value) return;
  const { error } = await supabase.from(ITEMS).update({ text: value } as any).eq("id", itemId);
  if (error) throw error;
}

export async function deleteExecutionItem(itemId: string): Promise<void> {
  const { error } = await supabase.from(ITEMS).delete().eq("id", itemId);
  if (error) throw error;
}

export async function setExecutionItemCompleted(
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

export async function completeAllPendingExecutionItems(
  runId: string,
  userId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from(ITEMS)
    .update({
      is_completed: true,
      completed_by: userId,
      completed_at: new Date().toISOString(),
    } as any)
    .eq("execution_run_id", runId)
    .eq("is_completed", false);
  if (error) throw error;
}

/** Exclui uma passagem inteira (itens saem por CASCADE). */
export async function deleteExecutionRun(runId: string): Promise<void> {
  const { error } = await supabase.from(RUNS).delete().eq("id", runId);
  if (error) throw error;
}

/**
 * Fecha UM run específico por id, com compare-and-set em `status = 'active'`.
 * Retorna `true` só quando este chamador realmente fechou o run — assim a
 * operação é idempotente e nunca fecha um run criado depois da mutação.
 */
export async function closeExecutionRunById(params: {
  runId: string;
  status: "completed" | "completed_with_pending";
  reason: string;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from(RUNS)
    .update({
      status: params.status,
      completed_at: new Date().toISOString(),
      metadata: { close_reason: params.reason },
    } as any)
    .eq("id", params.runId)
    .eq("status", "active")
    .select("id");
  if (error) {
    console.warn("[demandExecution] closeById error", error);
    return false;
  }
  return ((data as any[]) || []).length > 0;
}

/** Runs ATIVOS (com itens) de várias demandas — usado pelas ações em lote. */
export async function loadActiveExecutionRuns(
  demandIds: string[],
): Promise<Record<string, ExecutionRunWithItems>> {
  const ids = Array.from(new Set(demandIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from(RUNS)
    .select("*")
    .in("demand_id", ids)
    .eq("status", "active");
  if (error) {
    console.warn("[demandExecution] loadActive error", error);
    return {};
  }
  const runs = ((data as any[]) || []) as ExecutionRun[];
  if (runs.length === 0) return {};
  const { data: itemRows } = await supabase
    .from(ITEMS)
    .select("*")
    .in("execution_run_id", runs.map((r) => r.id))
    .order("position", { ascending: true });
  const items = ((itemRows as any[]) || []) as ExecutionItem[];
  const out: Record<string, ExecutionRunWithItems> = {};
  for (const r of runs) {
    out[r.demand_id] = {
      ...r,
      metadata: (r.metadata as any) ?? {},
      items: items.filter((i) => i.execution_run_id === r.id),
    };
  }
  return out;
}

/** Dependências reais do orquestrador de saída de passagem. */
export const executionExitDeps = {
  completeAllPending: async (runId: string) => {
    const { data } = await supabase.auth.getUser();
    await completeAllPendingExecutionItems(runId, data?.user?.id ?? null);
  },
  closeRun: closeExecutionRunById,
};

