/**
 * TEMPO OPERACIONAL PERSONALIZADO por (demanda, etapa).
 *
 * A duração padrão continua vindo de `flow_functions.config.durations` /
 * `durations_by_type` (ver `src/lib/flowDurations.ts`). Esta tabela é o ajuste
 * PONTUAL que o gestor faz para uma demanda específica — por exemplo na
 * alocação em massa, quando ele sabe que aquele card leva mais tempo.
 *
 * Regras:
 *  - 1 registro por (demand_id, function_key);
 *  - duração em minutos, sempre > 0 (valores inválidos são ignorados);
 *  - remover o override volta a demanda ao tempo padrão da etapa.
 */
import { supabase } from "@/integrations/supabase/client";

export interface StageDurationOverrideRow {
  demandId: string;
  functionKey: string;
  durationMin: number;
}

export const MIN_STAGE_DURATION = 5;
export const MAX_STAGE_DURATION = 60 * 24 * 5; // 5 dias úteis de trabalho

/** Normaliza a duração digitada (null quando inválida/vazia). */
export function normalizeDurationInput(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n / 5) * 5;
  if (rounded < MIN_STAGE_DURATION) return MIN_STAGE_DURATION;
  if (rounded > MAX_STAGE_DURATION) return MAX_STAGE_DURATION;
  return rounded;
}

/** "1h 30min" — rótulo curto para prévia/badges. */
export function formatDuration(min?: number | null): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Overrides gravados, indexados por `demandId::functionKey`. */
export function overrideKey(demandId: string, functionKey: string): string {
  return `${demandId}::${functionKey}`;
}

export async function loadStageDurationOverrides(
  tenantId: string,
  demandIds: string[],
): Promise<Record<string, number>> {
  const ids = Array.from(new Set(demandIds.filter(Boolean)));
  if (!tenantId || ids.length === 0) return {};
  const { data, error } = await (supabase.from("demand_stage_duration_overrides") as any)
    .select("demand_id, function_key, duration_min")
    .eq("tenant_id", tenantId)
    .in("demand_id", ids);
  if (error) {
    console.warn("[durationOverrides] load error:", error);
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of ((data || []) as any[])) {
    const dur = normalizeDurationInput(row.duration_min);
    if (dur) out[overrideKey(row.demand_id, row.function_key)] = dur;
  }
  return out;
}

/** Grava (upsert) e remove os overrides do lote. Nunca lança. */
export async function saveStageDurationOverrides(
  tenantId: string,
  rows: StageDurationOverrideRow[],
  removals: Array<{ demandId: string; functionKey: string }> = [],
): Promise<void> {
  try {
    const valid = rows
      .map((r) => ({ ...r, durationMin: normalizeDurationInput(r.durationMin) }))
      .filter((r) => !!r.durationMin && !!r.functionKey);

    if (valid.length > 0) {
      const { data: auth } = await supabase.auth.getUser();
      const payload = valid.map((r) => ({
        tenant_id: tenantId,
        demand_id: r.demandId,
        function_key: r.functionKey,
        duration_min: r.durationMin as number,
        created_by: auth?.user?.id ?? null,
      }));
      const { error } = await (supabase.from("demand_stage_duration_overrides") as any).upsert(payload, {
        onConflict: "demand_id,function_key",
      });
      if (error) console.warn("[durationOverrides] upsert error:", error);
    }

    for (const rem of removals) {
      if (!rem.functionKey) continue;
      await (supabase.from("demand_stage_duration_overrides") as any)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("demand_id", rem.demandId)
        .eq("function_key", rem.functionKey);
    }
  } catch (err) {
    console.warn("[durationOverrides] save failed:", err);
  }
}
