import { supabase } from "@/integrations/supabase/client";

export type PriorityWorkArea = "midia" | "sistemas";

export interface ReorderPriorityConfig {
  /** Multiplicador da janela de risco: prazo - agora <= fator × ciclo restante → prioriza. */
  riskFactor: number;
  /** Carência (min) para cards que acabaram de entrar na coluna: vão para o fim se não houver risco. */
  entryGraceMin: number;
}

export const DEFAULT_REORDER_PRIORITY: ReorderPriorityConfig = {
  riskFactor: 3,
  entryGraceMin: 60,
};

export type ReorderPriorityByArea = Record<PriorityWorkArea, ReorderPriorityConfig>;

export const DEFAULT_REORDER_PRIORITY_BY_AREA: ReorderPriorityByArea = {
  midia: { ...DEFAULT_REORDER_PRIORITY },
  sistemas: { ...DEFAULT_REORDER_PRIORITY },
};

function sanitize(raw: any): ReorderPriorityConfig {
  const factor = Number(raw?.riskFactor);
  const grace = Number(raw?.entryGraceMin);
  return {
    riskFactor: Number.isFinite(factor) && factor > 0 ? Math.min(factor, 20) : DEFAULT_REORDER_PRIORITY.riskFactor,
    entryGraceMin: Number.isFinite(grace) && grace >= 0 ? Math.min(grace, 24 * 60) : DEFAULT_REORDER_PRIORITY.entryGraceMin,
  };
}

/** Lê a configuração de prioridade/risco (persistida em tenants.settings.reorder_priority). */
export async function loadReorderPriority(tenantId: string): Promise<ReorderPriorityByArea> {
  try {
    const { data } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
    const raw = ((data as any)?.settings || {}).reorder_priority || {};
    return {
      midia: sanitize(raw.midia),
      sistemas: sanitize(raw.sistemas),
    };
  } catch {
    return { ...DEFAULT_REORDER_PRIORITY_BY_AREA };
  }
}

export async function saveReorderPriority(
  tenantId: string,
  area: PriorityWorkArea,
  config: ReorderPriorityConfig,
): Promise<void> {
  const { data } = await supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const settings = ((data as any)?.settings || {}) as Record<string, any>;
  const current = (settings.reorder_priority || {}) as Record<string, any>;
  const next = {
    ...settings,
    reorder_priority: { ...current, [area]: sanitize(config) },
  };
  const { error } = await supabase.from("tenants").update({ settings: next } as any).eq("id", tenantId);
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

