/**
 * RESOLUÇÃO DE ETAPA POR RESPONSÁVEL — NÚCLEO PURO + CARGA EM LOTE.
 *
 * As regras de fluxo continuam EXATAMENTE as de `resolveFunctionForAssignee`;
 * aqui elas só ficam separadas do acesso a rede, para que:
 *  - a resolução individual continue funcionando igual;
 *  - o dropdown de responsável resolva N colaboradores com um conjunto ÚNICO de
 *    consultas compartilhadas (sem N+1).
 *
 * Nada é gravado neste arquivo.
 */
import { supabase } from "@/integrations/supabase/client";
import { isClientFacingFunction, isReviewFunction, type WorkArea } from "@/lib/flowFunctions";
import { pickAdministrativeStage } from "@/lib/flowSegments";
import { getStageCompletions, hasUserCompletedStage, type StageCompletion } from "@/lib/stageCompletions";

export interface FlowFunctionRow {
  function_key: string;
  requires_client_origin?: boolean | null;
}

export interface FlowRuleRow {
  function_key: string;
  requirement?: string | null;
}

/** Sequência real do fluxo (mesma regra de `required` + origem de cliente). */
export function buildFlowSequence(
  fns: FlowFunctionRow[],
  rules: FlowRuleRow[],
  clientOrigin: boolean,
): string[] {
  const required = new Set(
    (rules || []).filter((r) => r.requirement === "required").map((r) => r.function_key),
  );
  return (required.size > 0 ? (fns || []).filter((f) => required.has(f.function_key)) : fns || [])
    .filter((f) => (f.requires_client_origin ? clientOrigin : true))
    .map((f) => f.function_key);
}

export interface PickFunctionParams {
  sequence: string[];
  allowedKeys: Set<string>;
  /** Conclusões do card (`null` quando não há demanda salva). */
  completions: Map<string, StageCompletion> | null;
  assigneeUserId: string;
  currentFunctionKey?: string | null;
  administrative: boolean;
}

/**
 * Mesma decisão de `resolveFunctionForAssignee`, sem I/O:
 * mantém a etapa atual quando usável, senão frente, senão trás; modo
 * administrativo nunca atravessa barreira de cliente.
 */
export function pickFunctionForAssignee(params: PickFunctionParams): string | null {
  const { sequence, allowedKeys, completions, assigneeUserId, administrative } = params;
  const currentFunctionKey = params.currentFunctionKey ?? null;
  const allowedSeq = sequence.filter((k) => allowedKeys.has(k));
  if (sequence.length === 0 || allowedSeq.length === 0) return null;

  const usable = (k: string) => {
    if (!allowedKeys.has(k)) return false;
    if (administrative && k !== currentFunctionKey && isClientFacingFunction(k)) return false;
    if (completions && hasUserCompletedStage(completions, k, assigneeUserId)) return false;
    if (completions && isReviewFunction(k)) {
      const prev = sequence[sequence.indexOf(k) - 1];
      if (prev && hasUserCompletedStage(completions, prev, assigneeUserId)) return false;
    }
    return true;
  };

  if (administrative) {
    return pickAdministrativeStage({ sequence, currentKey: currentFunctionKey, usable });
  }

  if (currentFunctionKey && sequence.includes(currentFunctionKey)) {
    if (usable(currentFunctionKey)) return currentFunctionKey;
    const idx = sequence.indexOf(currentFunctionKey);
    const next = sequence.slice(idx + 1).find(usable);
    if (next) return next;
    const prev = sequence.slice(0, idx).reverse().find(usable);
    if (prev) return prev;
    return null;
  }

  const firstUsable = allowedSeq.find(usable);
  if (firstUsable) return firstUsable;
  return allowedSeq[0];
}

export interface SharedFlowContext {
  sequence: string[];
  /** Funções permitidas por usuário na área do card. */
  allowedByUser: Map<string, Set<string>>;
  completions: Map<string, StageCompletion> | null;
}

/**
 * Carga COMPARTILHADA para vários colaboradores: uma consulta de
 * `flow_functions`, uma de `demand_type_flow_rules`, uma de
 * `collaborator_function_assignments` (`in user_id`) e, no máximo, uma de
 * histórico do card.
 */
export async function loadSharedFlowContext(params: {
  tenantId: string;
  area: WorkArea;
  clientOrigin: boolean;
  demandTypeKey?: string | null;
  demandId?: string | null;
  userIds: string[];
}): Promise<SharedFlowContext> {
  const { tenantId, area, clientOrigin, demandTypeKey, demandId, userIds } = params;

  const [{ data: fns }, { data: rules }, { data: allowedRows }, completions] = await Promise.all([
    (supabase.from("flow_functions") as any)
      .select("function_key, position, active, requires_client_origin")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("work_area", area)
      .neq("function_key", "avaliar")
      .order("position"),
    demandTypeKey
      ? (supabase.from("demand_type_flow_rules") as any)
          .select("function_key, requirement")
          .eq("tenant_id", tenantId)
          .eq("work_area", area)
          .eq("demand_type_key", demandTypeKey)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length > 0
      ? (supabase.from("collaborator_function_assignments") as any)
          .select("user_id, function_key, allowed")
          .eq("tenant_id", tenantId)
          .in("user_id", userIds)
          .eq("work_area", area)
          .eq("allowed", true)
          .neq("function_key", "avaliar")
      : Promise.resolve({ data: [] as any[] }),
    demandId ? getStageCompletions(tenantId, demandId) : Promise.resolve(null),
  ]);

  const allowedByUser = new Map<string, Set<string>>();
  userIds.forEach((id) => allowedByUser.set(id, new Set<string>()));
  for (const row of ((allowedRows as any[]) || [])) {
    const uid = row.user_id as string;
    if (!allowedByUser.has(uid)) allowedByUser.set(uid, new Set<string>());
    allowedByUser.get(uid)!.add(row.function_key as string);
  }

  return {
    sequence: buildFlowSequence(((fns as any[]) || []) as FlowFunctionRow[], ((rules as any[]) || []) as FlowRuleRow[], clientOrigin),
    allowedByUser,
    completions: (completions as Map<string, StageCompletion> | null) ?? null,
  };
}

/** Resolve a etapa de TODOS os colaboradores a partir de uma carga única. */
export function resolveFunctionsFromContext(params: {
  context: SharedFlowContext;
  userIds: string[];
  currentFunctionKey?: string | null;
  administrative: boolean;
}): Record<string, string | null> {
  const { context, userIds, administrative } = params;
  const out: Record<string, string | null> = {};
  for (const userId of userIds) {
    out[userId] = pickFunctionForAssignee({
      sequence: context.sequence,
      allowedKeys: context.allowedByUser.get(userId) || new Set<string>(),
      completions: context.completions,
      assigneeUserId: userId,
      currentFunctionKey: params.currentFunctionKey ?? null,
      administrative,
    });
  }
  return out;
}
