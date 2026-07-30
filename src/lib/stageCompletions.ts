import { supabase } from "@/integrations/supabase/client";

/**
 * Etapas já concluídas de um card, derivadas de `demand_flow_history`.
 *
 * Uma etapa é considerada concluída por um usuário quando ele:
 *  - prosseguiu a partir dela (`proceeded`),
 *  - entregou sua parte nela (`partial_delivered`), ou
 *  - entregou o card a partir dela (`delivered` / `partial_delivered`).
 *
 * Usado para:
 *  - impedir que a troca de responsável devolva o card a uma etapa que a
 *    pessoa já entregou;
 *  - sugerir a etapa correta no "Voltar demanda";
 *  - mostrar no card quem já entregou sua parte da captação.
 */
export interface StageCompletion {
  functionKey: string;
  userIds: string[];
  /** ISO da conclusão mais recente da etapa. */
  lastAt: string;
  /** Data da conclusão mais recente por usuário. */
  byUser: Record<string, string>;
}

const COMPLETION_ACTIONS = new Set(["proceeded", "partial_delivered", "delivered"]);

export async function getStageCompletions(
  tenantId: string,
  demandId: string,
): Promise<Map<string, StageCompletion>> {
  const map = new Map<string, StageCompletion>();
  if (!tenantId || !demandId) return map;
  try {
    const { data, error } = await supabase
      .from("demand_flow_history")
      .select("action, from_user_id, from_function_key, created_at")
      .eq("tenant_id", tenantId)
      .eq("demand_id", demandId)
      .order("created_at", { ascending: true });
    if (error) return map;

    for (const row of (data as any[]) || []) {
      const key = row.from_function_key as string | null;
      if (!key || !COMPLETION_ACTIONS.has(row.action)) continue;
      const entry = map.get(key) || { functionKey: key, userIds: [], lastAt: row.created_at, byUser: {} };
      const uid = row.from_user_id as string | null;
      if (uid) {
        if (!entry.userIds.includes(uid)) entry.userIds.push(uid);
        entry.byUser[uid] = row.created_at;
      }
      entry.lastAt = row.created_at;
      map.set(key, entry);
    }
  } catch (e) {
    console.warn("[stageCompletions] error:", e);
  }
  return map;
}

/** true quando o usuário já concluiu (ou entregou sua parte) naquela etapa. */
export function hasUserCompletedStage(
  completions: Map<string, StageCompletion>,
  functionKey: string,
  userId?: string | null,
): boolean {
  if (!userId) return false;
  return !!completions.get(functionKey)?.userIds.includes(userId);
}

/** Último usuário que concluiu a etapa (para sugerir responsável ao voltar). */
export function lastUserOfStage(
  completions: Map<string, StageCompletion>,
  functionKey: string,
): string | null {
  const entry = completions.get(functionKey);
  if (!entry || entry.userIds.length === 0) return null;
  let best: string | null = null;
  let bestAt = "";
  for (const uid of entry.userIds) {
    const at = entry.byUser[uid] || "";
    if (!best || at > bestAt) {
      best = uid;
      bestAt = at;
    }
  }
  return best;
}
