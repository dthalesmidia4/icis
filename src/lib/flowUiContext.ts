/**
 * CONTEXTO DE FLUXO DA ABERTURA DO CARD — UMA ÚNICA REQUEST.
 *
 * `get_flow_ui_context_v1` devolve, de uma vez: a demanda, as etapas ativas da
 * área, as regras por tipo, as permissões dos colaboradores, os perfis
 * relevantes e o histórico do card.
 *
 * Aqui NÃO existe autoridade de transição: isto é leitura para a UI. A decisão
 * real continua no motor (`proceedDemand`), que revalida contra o banco.
 *
 * Cache curto em memória (10s) por `tenant:demand:area`, invalidado
 * explicitamente após qualquer transição.
 */
import { supabase } from "@/integrations/supabase/client";

export interface FlowUiFunction {
  function_key: string;
  name: string;
  position: number | null;
  active: boolean;
  requires_client_origin: boolean | null;
  work_area: string;
}

export interface FlowUiContext {
  demand: Record<string, any>;
  functions: FlowUiFunction[];
  rules: Array<{
    demand_type_key: string;
    demand_type_name: string | null;
    function_key: string;
    requirement: string;
  }>;
  assignments: Array<{ user_id: string; function_key: string; allowed: boolean }>;
  profiles: Array<{ id: string; full_name: string | null }>;
  history: Array<Record<string, any>>;
  /** Chave → nome da etapa, pronto para textos auxiliares. */
  functionNames: Record<string, string>;
}

const TTL_MS = 10_000;
const cache = new Map<string, { at: number; value: FlowUiContext }>();

const keyOf = (tenantId: string, demandId: string | null, area: string) =>
  `${tenantId}:${demandId ?? "none"}:${area}`;

export function invalidateFlowUiContext(tenantId?: string, demandId?: string | null) {
  if (!tenantId) {
    cache.clear();
    return;
  }
  Array.from(cache.keys()).forEach((k) => {
    if (k.startsWith(`${tenantId}:${demandId ?? ""}`) || !demandId) cache.delete(k);
  });
}

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function mapFlowUiContext(payload: any): FlowUiContext {
  const functions = arr(payload?.flow_functions) as FlowUiFunction[];
  const functionNames: Record<string, string> = {};
  functions.forEach((f) => {
    if (f?.function_key) functionNames[f.function_key] = f.name;
  });
  return {
    demand: (payload?.demand as Record<string, any>) || {},
    functions,
    rules: arr(payload?.rules) as FlowUiContext["rules"],
    assignments: arr(payload?.assignments) as FlowUiContext["assignments"],
    profiles: arr(payload?.profiles) as FlowUiContext["profiles"],
    history: arr(payload?.history),
    functionNames,
  };
}

export async function loadFlowUiContext(params: {
  tenantId: string;
  demandId?: string | null;
  workArea?: string | null;
}): Promise<FlowUiContext | null> {
  const { tenantId } = params;
  if (!tenantId) return null;
  const area = params.workArea === "sistemas" ? "sistemas" : "midia";
  const demandId = params.demandId ?? null;
  const key = keyOf(tenantId, demandId, area);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { data, error } = await (supabase as any).rpc("get_flow_ui_context_v1", {
    p_tenant_id: tenantId,
    p_demand_id: demandId,
    p_work_area: area,
  });
  if (error) {
    console.error("[flowUiContext] get_flow_ui_context_v1", error);
    return null;
  }
  const value = mapFlowUiContext(data);
  cache.set(key, { at: Date.now(), value });
  return value;
}
