import { supabase } from "@/integrations/supabase/client";
import { DURATION_MATRIX, type DurationTypeGroup } from "@/lib/reorderSequence";
import type { WorkArea } from "@/lib/flowFunctions";

export type StageDurations = Record<string, Partial<Record<DurationTypeGroup, number>>>;

/**
 * Carrega overrides de duração por etapa a partir de `flow_functions.config.durations`.
 * Retorna um mapa `{ function_key: { grupo: minutos } }`. Etapas sem override não
 * aparecem no mapa — o consumidor deve cair no `DURATION_MATRIX` hardcoded.
 */
export async function loadDurationsForTenant(
  tenantId: string,
  workArea: WorkArea = "midia",
): Promise<StageDurations> {
  const { data, error } = await supabase
    .from("flow_functions")
    .select("function_key, config")
    .eq("tenant_id", tenantId)
    .eq("work_area", workArea);
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

/**
 * Carrega overrides de TODAS as áreas, com chaves prefixadas por área
 * (`midia:revisar`, `sistemas:revisar`). Evita que etapas homônimas de áreas
 * diferentes sobrescrevam uma à outra.
 */
export async function loadDurationsByArea(tenantId: string): Promise<StageDurations> {
  const { data, error } = await (supabase.from("flow_functions") as any)
    .select("function_key, config, work_area")
    .eq("tenant_id", tenantId);
  if (error || !data) return {};
  const out: StageDurations = {};
  for (const row of data as any[]) {
    const dur = row?.config?.durations;
    if (dur && typeof dur === "object") {
      out[`${row.work_area || "midia"}:${row.function_key}`] = { ...dur };
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

/** Mapeia a key oficial de tipo de demanda para o grupo de duração. */
export function groupForDemandTypeKey(key?: string | null): DurationTypeGroup {
  const k = (key || "").toLowerCase();
  if (k === "criativo_estatico") return "estatico";
  if (k === "carrossel") return "carrossel";
  if (k === "video_gerado" || k === "video_captado") return "video_curto";
  if (k === "outro") return "outro";
  // Sistemas: o esforço é definido pelo tipo (bug N1/N2/N3, dev, etc.),
  // tratado no motor de reorganização — aqui cai no grupo default.
  return "default";
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Datas de reentrada no fluxo operacional após a volta do cliente.
 * O tempo parado no cliente não é responsabilidade do colaborador, então o card
 * recomeça "agora" (arredondado para o próximo múltiplo de 5 min) com a duração
 * configurada da etapa de destino.
 */
export async function buildReturnFromClientDates(
  tenantId: string,
  targetStage: string,
  demandTypeKey?: string | null,
  fallbackMinutes?: number | null,
  workArea: WorkArea = "midia",
): Promise<{ due_date: string; due_time: string; delivery_date: string; delivery_time: string }> {
  let overrides: StageDurations = {};
  try {
    overrides = await loadDurationsForTenant(tenantId, workArea);
  } catch {
    overrides = {};
  }
  const minutes =
    resolveDurationMinutes(overrides, targetStage, groupForDemandTypeKey(demandTypeKey)) ??
    (fallbackMinutes && fallbackMinutes > 0 ? fallbackMinutes : 15);

  const start = new Date();
  start.setSeconds(0, 0);
  const rem = start.getMinutes() % 5;
  if (rem !== 0) start.setMinutes(start.getMinutes() + (5 - rem));

  let end = new Date(start.getTime() + minutes * 60_000);
  // Não estoura o dia: no limite, encerra às 23:59 da mesma data.
  if (end.getDate() !== start.getDate() || end.getMonth() !== start.getMonth()) {
    end = new Date(start);
    end.setHours(23, 59, 0, 0);
  }

  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return {
    due_date: iso(start),
    due_time: hm(start),
    delivery_date: iso(end),
    delivery_time: hm(end),
  };
}
