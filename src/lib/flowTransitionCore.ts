/**
 * Parte PURA do compare-and-set das transições de fluxo (sem cliente Supabase,
 * para poder ser testada isoladamente).
 */
export const STALE_TRANSITION_MESSAGE =
  "A demanda foi alterada por outra ação enquanto você transferia. O estado atual foi recarregado; tente novamente se necessário.";

/** Colunas que definem onde (e se) o card aparece após a transição. */
export const FLOW_STATE_COLUMNS =
  "id, assigned_to, current_function_key, archived_at, status_id, released_at, due_date, due_time, delivery_date, delivery_time, additional_assignees, client_wait_started_at, client_resend_count, client_last_resend_at";

export interface FlowState {
  assigned_to: string | null;
  current_function_key: string | null;
  archived_at: string | null;
  status_id: string | null;
  released_at: string | null;
  due_date: string | null;
  due_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  additional_assignees: string[];
  client_wait_started_at: string | null;
  client_resend_count: number | null;
  client_last_resend_at: string | null;
}

export function buildFlowState(row: Record<string, any> | null | undefined): FlowState | undefined {
  if (!row) return undefined;
  return {
    assigned_to: row.assigned_to ?? null,
    current_function_key: row.current_function_key ?? null,
    archived_at: row.archived_at ?? null,
    status_id: row.status_id ?? null,
    released_at: row.released_at ?? null,
    due_date: row.due_date ?? null,
    due_time: row.due_time ?? null,
    delivery_date: row.delivery_date ?? null,
    delivery_time: row.delivery_time ?? null,
    additional_assignees: Array.isArray(row.additional_assignees)
      ? (row.additional_assignees.filter(Boolean) as string[])
      : [],
    client_wait_started_at: row.client_wait_started_at ?? null,
    client_resend_count: row.client_resend_count ?? null,
    client_last_resend_at: row.client_last_resend_at ?? null,
  };
}

export interface FlowCasExpectation {
  /** Etapa que o chamador leu antes de calcular o destino. */
  expectedFunctionKey?: string | null;
  /** Responsável esperado. `undefined` = não verificar. */
  expectedAssignee?: string | null | undefined;
}

/** Interface mínima de um query builder do supabase-js (facilita os testes). */
export interface CasQuery<T> {
  eq(column: string, value: any): T;
  is(column: string, value: any): T;
}

/**
 * Aplica os filtros de compare-and-set. Extraído para ser testável sem rede.
 */
export function applyFlowCasFilters<T extends CasQuery<T>>(
  query: T,
  expectation: FlowCasExpectation,
): T {
  let q = query;
  if ("expectedFunctionKey" in expectation) {
    const key = expectation.expectedFunctionKey;
    q = typeof key === "string" && key.length > 0
      ? q.eq("current_function_key", key)
      : q.is("current_function_key", null);
  }
  if ("expectedAssignee" in expectation && expectation.expectedAssignee !== undefined) {
    const user = expectation.expectedAssignee;
    q = typeof user === "string" && user.length > 0
      ? q.eq("assigned_to", user)
      : q.is("assigned_to", null);
  }
  return q;
}

