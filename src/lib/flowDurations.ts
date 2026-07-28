import { supabase } from "@/integrations/supabase/client";
import { DURATION_MATRIX, type DurationTypeGroup } from "@/lib/reorderSequence";

export type StageDurations = Record<string, Partial<Record<DurationTypeGroup, number>>>;

/**
 * Carrega overrides de duração por etapa a partir de `flow_functions.config.durations`.
 * Retorna um mapa `{ function_key: { grupo: minutos } }`. Etapas sem override não
 * aparecem no mapa — o consumidor deve cair no `DURATION_MATRIX` hardcoded.
 */
export async function loadDurationsForTenant(tenantId: string): Promise<StageDurations> {
  const { data, error } = await supabase
    .from("flow_functions")
    .select("function_key, config")
    .eq("tenant_id", tenantId);
  if (error || !data) return {};
  const out: StageDurations = {};
  for (const row of data as any[]) {
    const dur = row?.config?.durations;
    if (dur && typeof dur === "object") {
      out[row.function_key] = { ...dur };
    }
  }
  return out;
}

/** Resolve minutos priorizando override do banco, caindo no hardcoded. */
export function resolveDurationMinutes(
  overrides: StageDurations | undefined,
  stage: string,
  group: DurationTypeGroup,
): number | null {
  const s = (stage || "").toLowerCase();
  const overrideRow = overrides?.[s];
  if (overrideRow) {
    const v = overrideRow[group] ?? overrideRow.default;
    if (typeof v === "number" && v > 0) return v;
  }
  const hardRow = DURATION_MATRIX[s];
  if (hardRow) {
    const v = hardRow[group] ?? hardRow.default;
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

/** Valor default (hardcoded) para exibir na UI antes do usuário editar. */
export function defaultDurationFor(stage: string, group: DurationTypeGroup): number {
  const row = DURATION_MATRIX[stage.toLowerCase()];
  if (row) return row[group] ?? row.default ?? 15;
  return 15;
}
