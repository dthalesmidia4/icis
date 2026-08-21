/**
 * Janelas de expediente REAIS do colaborador para a tela `/escritorio`.
 *
 * Não existe agenda paralela aqui: as janelas vêm de `user_area_schedules`
 * (mesma fonte autoritativa de `scheduleOccupancy.suggestFreeSlot`) e caem no
 * `tenants.settings.work_hours` apenas quando o usuário não tem NENHUMA faixa
 * configurada. Os utilitários de span (`toMin`, `mergeSpans`, `buildDayWindows`)
 * são os mesmos do motor canônico (`freeSlot.ts`).
 */
import { mergeSpans, toMin, type Span } from "@/lib/freeSlot";
import type { WorkHoursConfig } from "@/lib/reorderSequence";

export interface AreaScheduleRow {
  user_id: string;
  work_area: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export type ScheduleAreaFilter = "midia" | "sistemas" | "all";

export interface ResolvedWindows {
  windows: Span[];
  /** `schedule` = veio de `user_area_schedules`; `fallback` = work_hours do tenant. */
  source: "schedule" | "fallback";
}

/** Janelas do expediente genérico do tenant (com o almoço oficial como gap). */
export function workHoursWindows(workHours?: WorkHoursConfig | null): Span[] {
  if (!workHours?.start || !workHours?.end) return [];
  const start = toMin(workHours.start);
  const end = toMin(workHours.end);
  if (end <= start) return [];
  const lunchStart = workHours.lunchStart ? toMin(workHours.lunchStart) : null;
  const lunchEnd = workHours.lunchEnd ? toMin(workHours.lunchEnd) : null;
  if (
    lunchStart !== null &&
    lunchEnd !== null &&
    lunchEnd > lunchStart &&
    lunchStart > start &&
    lunchEnd < end
  ) {
    return mergeSpans([
      { s: start, e: lunchStart },
      { s: lunchEnd, e: end },
    ]);
  }
  return [{ s: start, e: end }];
}

/**
 * Janelas do colaborador no dia da semana informado.
 * - com agenda específica: ela é autoritativa (dia sem faixa = dia sem expediente);
 * - área `all`: união das faixas de Mídia + Sistemas;
 * - sem nenhuma faixa: fallback do tenant, pulando sábado/domingo.
 */
export function resolveUserWindows(params: {
  rows: AreaScheduleRow[];
  weekday: number;
  area: ScheduleAreaFilter;
  workHours?: WorkHoursConfig | null;
}): ResolvedWindows {
  const { rows, weekday, area, workHours } = params;
  if (rows.length === 0) {
    const weekend = weekday === 0 || weekday === 6;
    return { windows: weekend ? [] : workHoursWindows(workHours), source: "fallback" };
  }

  const dayRows = rows.filter((r) => r.weekday === weekday);
  if (dayRows.length === 0) return { windows: [], source: "schedule" };

  const relevant = area === "all" ? dayRows : dayRows.filter((r) => r.work_area === area);
  return {
    windows: mergeSpans(relevant.map((r) => ({ s: toMin(r.start_time), e: toMin(r.end_time) }))),
    source: "schedule",
  };
}

/** Agrupa as linhas carregadas em lote por `user_id`. */
export function groupSchedulesByUser(rows: AreaScheduleRow[]): Record<string, AreaScheduleRow[]> {
  const out: Record<string, AreaScheduleRow[]> = {};
  rows.forEach((r) => {
    if (!r?.user_id) return;
    (out[r.user_id] ||= []).push(r);
  });
  return out;
}

/**
 * Área usada para resolver a PRESENÇA HUMANA.
 *
 * Regra: na visão `Todas` a presença é a UNIÃO das janelas de todas as áreas em
 * que o colaborador está alocado no dia — a área do card que está no monitor
 * NUNCA pode transformar alguém em expediente em `off_shift`. Com filtro de
 * área ativo, aí sim a alocação daquela área é a referência.
 */
export function resolvePresenceArea(areaFilter: ScheduleAreaFilter): ScheduleAreaFilter {
  return areaFilter === "all" ? "all" : areaFilter;
}

/** Sinal DIAGNÓSTICO: o card atual pertence a uma área sem janela ativa agora. */
export function cardAreaMismatch(params: {
  rows: AreaScheduleRow[];
  weekday: number;
  cardArea: "midia" | "sistemas" | null | undefined;
  nowMinutes: number;
  workHours?: WorkHoursConfig | null;
}): boolean {
  const { rows, weekday, cardArea, nowMinutes, workHours } = params;
  if (!cardArea) return false;
  const { windows } = resolveUserWindows({ rows, weekday, area: cardArea, workHours });
  return !windows.some((w) => nowMinutes >= w.s && nowMinutes < w.e);
}
