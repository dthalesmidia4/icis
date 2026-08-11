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

const INTERNAL_ROLES = ["agency_admin", "agency_manager", "agency_user"] as const;

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
 * Candidatos elegíveis (permissão real) para uma etapa, já ordenados:
 *  1. preferenciais do cliente por `priority` ASC;
 *  2. demais por carga ASC;
 *  3. nome como desempate.
 */
export async function getEligibleStageCandidates(args: BaseArgs): Promise<StageRoutingCandidate[]> {
  const { tenantId, functionKey } = args;
  if (!tenantId || !functionKey) return [];
  const area = normalizeWorkArea(typeof args.workArea === "string" ? args.workArea : undefined);

  const { data: assigns } = await (supabase.from("collaborator_function_assignments") as any)
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("function_key", functionKey)
    .eq("work_area", area)
    .eq("allowed", true);

  let ids = Array.from(
    new Set(((assigns || []) as any[]).map((a) => String(a.user_id)).filter(Boolean)),
  );
  if (ids.length === 0) return [];

  const excluded = new Set((args.excludeUserIds || []).filter(Boolean) as string[]);
  ids = ids.filter((id) => !excluded.has(id));
  if (ids.length === 0) return [];

  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("user_id", ids)
    .in("role", INTERNAL_ROLES as any);
  ids = Array.from(new Set(((roles || []) as any[]).map((r) => String(r.user_id)))).filter((id) =>
    ids.includes(id),
  );
  if (ids.length === 0) return [];

  const [{ data: profiles }, { data: demands }, prefs] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", ids),
    supabase
      .from("demands")
      .select("assigned_to")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .in("assigned_to", ids),
    args.clientId
      ? fetchStagePreferences({
          tenantId,
          clientId: args.clientId,
          workArea: area,
          functionKey,
        })
      : Promise.resolve([] as Array<{ userId: string; priority: number }>),
  ]);

  const nameById = new Map<string, string>();
  ((profiles || []) as any[]).forEach((p) => nameById.set(p.id, p.full_name || "Colaborador"));
  const loadById = new Map<string, number>();
  ((demands || []) as any[]).forEach((d) => {
    if (d.assigned_to) loadById.set(d.assigned_to, (loadById.get(d.assigned_to) || 0) + 1);
  });
  const priorityById = new Map<string, number>();
  prefs.forEach((p) => priorityById.set(p.userId, p.priority));

  const candidates: StageRoutingCandidate[] = ids.map((id) => ({
    userId: id,
    fullName: nameById.get(id) || "Colaborador",
    preferred: priorityById.has(id),
    priority: priorityById.has(id) ? (priorityById.get(id) as number) : null,
    loadCount: loadById.get(id) || 0,
  }));

  candidates.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    if (a.preferred && b.preferred) {
      const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
      const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
    } else {
      const la = a.loadCount ?? 0;
      const lb = b.loadCount ?? 0;
      if (la !== lb) return la - lb;
    }
    return a.fullName.localeCompare(b.fullName, "pt-BR");
  });

  return candidates;
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
