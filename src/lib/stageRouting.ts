import { supabase } from "@/integrations/supabase/client";
import { normalizeWorkArea, type WorkArea } from "@/lib/flowFunctions";

/**
 * ROTEAMENTO DE ETAPA
 *
 * Duas coisas diferentes, deliberadamente separadas:
 *  - `collaborator_function_assignments` = PERMISSÃO (quem PODE executar a etapa).
 *  - `client_stage_routing_preferences`  = PREFERÊNCIA (quem DEVE receber, por cliente).
 *
 * A preferência nunca concede função. Se o preferencial perdeu a permissão,
 * ele simplesmente deixa de ser candidato e o fluxo cai no fallback normal.
 */

export type StageRoutingCandidate = {
  userId: string;
  fullName: string;
  preferred: boolean;
  priority: number | null;
  loadCount?: number;
};

/** Origem da decisão do responsável — gravada em `demand_flow_history.metadata.routing`. */
export type RoutingSource =
  | "manual_choice"
  | "client_preference"
  | "sticky"
  | "automatic_load"
  | "historic_return";



interface BaseArgs {
  tenantId: string;
  clientId?: string | null;
  workArea: WorkArea | string | null | undefined;
  functionKey: string;
  excludeUserIds?: Array<string | null | undefined>;
}

/**
 * Preferências ativas de um cliente para uma etapa/área, em ordem de prioridade.
 * Não filtra elegibilidade — quem filtra é `getEligibleStageCandidates`.
 */
export async function fetchStagePreferences(args: {
  tenantId: string;
  clientId: string;
  workArea: WorkArea | string | null | undefined;
  functionKey: string;
}): Promise<Array<{ userId: string; priority: number }>> {
  const area = normalizeWorkArea(typeof args.workArea === "string" ? args.workArea : undefined);
  const { data } = await (supabase.from("client_stage_routing_preferences") as any)
    .select("user_id, priority")
    .eq("tenant_id", args.tenantId)
    .eq("client_id", args.clientId)
    .eq("work_area", area)
    .eq("function_key", args.functionKey)
    .eq("active", true)
    .order("priority", { ascending: true });
  return ((data || []) as any[])
    .map((r) => ({ userId: String(r.user_id), priority: Number(r.priority) || 1 }))
    .filter((r) => !!r.userId);
}

/**
 * Candidatos elegíveis (permissão real) para uma etapa, já ordenados pelo BANCO:
 *  1. preferenciais do cliente por `priority` ASC;
 *  2. demais por carga ASC;
 *  3. nome como desempate.
 *
 * UMA única chamada (`get_stage_routing_candidates_v1`) substitui as consultas
 * separadas de permissões, papéis, perfis, carga e preferências.
 */
export async function getEligibleStageCandidates(args: BaseArgs): Promise<StageRoutingCandidate[]> {
  const { tenantId, functionKey } = args;
  if (!tenantId || !functionKey) return [];
  const area = normalizeWorkArea(typeof args.workArea === "string" ? args.workArea : undefined);
  const excludes = Array.from(
    new Set((args.excludeUserIds || []).filter(Boolean) as string[]),
  );

  const { data, error } = await (supabase as any).rpc("get_stage_routing_candidates_v1", {
    p_tenant_id: tenantId,
    p_client_id: args.clientId || null,
    p_work_area: area,
    p_function_key: functionKey,
    p_exclude_user_ids: excludes,
  });
  if (error) {
    console.error("[stageRouting] get_stage_routing_candidates_v1", error);
    return [];
  }

  return ((data || []) as any[])
    .map((r) => ({
      userId: String(r.user_id),
      fullName: String(r.full_name || "Colaborador"),
      preferred: !!r.preferred,
      priority: r.priority === null || r.priority === undefined ? null : Number(r.priority),
      loadCount: Number(r.load_count) || 0,
    }))
    .filter((c) => !!c.userId);
}


/**
 * Preferencial VÁLIDO (com permissão e não excluído) de menor `priority`.
 * `null` quando não há preferência aplicável — nunca trava o fluxo.
 */
export async function getPreferredStageAssignee(
  args: BaseArgs,
): Promise<StageRoutingCandidate | null> {
  if (!args.clientId) return null;
  const candidates = await getEligibleStageCandidates(args);
  const preferred = candidates.filter((c) => c.preferred);
  if (preferred.length === 0) return null;
  return preferred[0];
}
