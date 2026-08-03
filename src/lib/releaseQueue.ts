import { supabase } from "@/integrations/supabase/client";

/**
 * Fila de liberação de demandas.
 *
 * Uma demanda pode estar ALOCADA (tem responsável e datas) mas ainda não
 * LIBERADA (`released_at IS NULL`). Enquanto não liberada, ela existe para o
 * planejamento (Evolução, Cronograma, reorganização, conflito de agenda), mas
 * não aparece na coluna do colaborador na Visão Geral.
 *
 * Liberar/devolver é ação de gestor — a gravação de `released_at` é protegida
 * por trigger no banco (`guard_demand_release`).
 */

export interface ReleaseQueueConfig {
  /** Liberar automaticamente a próxima demanda da fila quando o colaborador entrega uma. */
  enabled: boolean;
  /** Quantidade máxima de demandas visíveis por colaborador. */
  limit: number;
}

export const DEFAULT_RELEASE_QUEUE: ReleaseQueueConfig = {
  enabled: false,
  limit: 6,
};

function sanitize(raw: any): ReleaseQueueConfig {
  const limit = Number(raw?.limit);
  return {
    enabled: raw?.enabled === true,
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(Math.round(limit), 50) : DEFAULT_RELEASE_QUEUE.limit,
  };
}

export async function loadReleaseQueueConfig(tenantId: string): Promise<ReleaseQueueConfig> {
  try {
    const { data } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
    return sanitize(((data as any)?.settings || {}).release_queue);
  } catch {
    return { ...DEFAULT_RELEASE_QUEUE };
  }
}

export async function saveReleaseQueueConfig(tenantId: string, config: ReleaseQueueConfig): Promise<void> {
  const { data } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const settings = ((data as any)?.settings || {}) as Record<string, any>;
  const next = { ...settings, release_queue: sanitize(config) };
  const { data: updated, error } = await supabase
    .from("tenants")
    .update({ settings: next } as any)
    .eq("id", tenantId)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new Error("Sem permissão para salvar as configurações desta agência.");
  }
}

async function logRelease(
  tenantId: string,
  ids: string[],
  action: "released" | "unreleased",
  toUserId?: string | null,
) {
  if (ids.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const rows = ids.map((demand_id) => ({
    tenant_id: tenantId,
    demand_id,
    to_user_id: toUserId ?? null,
    action,
    created_by: auth?.user?.id ?? null,
    metadata: { auto: false },
  }));
  await supabase.from("demand_flow_history").insert(rows as any);
}

/** Libera uma ou mais demandas (passam a aparecer na coluna do responsável). */
export async function releaseDemands(
  tenantId: string,
  ids: string[],
  toUserId?: string | null,
): Promise<void> {
  if (ids.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("demands")
    .update({ released_at: new Date().toISOString(), released_by: auth?.user?.id ?? null } as any)
    .in("id", ids);
  if (error) throw error;
  await logRelease(tenantId, ids, "released", toUserId);
}

/** Devolve uma demanda para a fila (deixa de aparecer para o colaborador). */
export async function unreleaseDemand(
  tenantId: string,
  id: string,
  toUserId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("demands")
    .update({ released_at: null, released_by: null } as any)
    .eq("id", id);
  if (error) throw error;
  await logRelease(tenantId, [id], "unreleased", toUserId);
}

export function isReleased(card: { released_at?: string | null } | null | undefined): boolean {
  return !!card && card.released_at != null;
}
