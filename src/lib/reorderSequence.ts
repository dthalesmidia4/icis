/**
 * Reordena a sequência de produção de um colaborador.
 * - Duração por (tipo × etapa) via matriz; "Outros" usa o intervalo agendado.
 * - Divide cards longos em fatias que respeitam expediente + almoço.
 * - Aplica folga proporcional (30%) + atraso acumulado no primeiro card atrasado.
 * - Pula finais de semana e feriados (br_calendar_events).
 * - Usa fuso America/Sao_Paulo por padrão como "UTC virtual".
 * - Respeita `user_area_schedules` por área (mídia/sistemas) quando fornecido.
 */
import { fetchHolidaysInRange } from "@/lib/dailyCards";
import { isReviewFunction, isEvaluationFunction, isClientWaitingFunction } from "@/lib/flowFunctions";

export type ReorderWorkArea = "midia" | "sistemas";

export interface WorkHoursConfig {
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
  tz: string;
}

export const DEFAULT_WORK_HOURS: WorkHoursConfig = {
  start: "09:00",
  end: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:30",
  tz: "America/Sao_Paulo",
};

/**
 * Mapa de blocos por área × weekday (0..6, dom..sáb).
 * Cada bloco em minutos desde meia-noite.
 */
export type AreaScheduleMap = {
  midia: Record<number, Array<{ s: number; e: number }>>;
  sistemas: Record<number, Array<{ s: number; e: number }>>;
};

export interface ReorderCardInput {
  id: string;
  title: string;
  demand_type?: string | null;
  demand_type_key?: string | null;
  is_daily_card?: boolean;
  publish_date?: string | null;
  publish_time?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  current_function_key?: string | null;
  work_area?: ReorderWorkArea | null;
  updated_at?: string | null;
  /** Instante (ISO) em que o card entrou na etapa atual — base do cálculo de atraso. */
  stage_started_at?: string | null;
}


export interface ReorderProposal {
  id: string;
  title: string;
  durationMin: number;
  startISO: string;
  startTime: string;
  endISO: string;
  endTime: string;
  publishDeadline?: string | null;
  warning?: string;
  changed: boolean;
  skipped?: boolean;
  spansDays?: number;
  slackApplied?: boolean;
  pinned?: boolean;
  /** Indica se o ajuste manual fixou o início ou o término. */
  pinnedKind?: "start" | "end" | "both" | null;
  /** Card atrasado em execução: início histórico preservado, só o término é recalculado. */
  keepStart?: boolean;
  stageStartISO?: string | null;
  stageStartTime?: string | null;
  stagePlannedMin?: number | null;
  extensionMin?: number | null;
  pausedByCaptar?: {
    atISO: string;
    atTime: string;
    captarId: string;
    captarTitle: string;
  } | null;
}

// ------------------------------------------------------------------
// Matriz duração
// ------------------------------------------------------------------

export type DurationTypeGroup =
  | "estatico"
  | "carrossel"
  | "video_curto"
  | "video_longo"
  | "outro"
  | "default";

export const DURATION_MATRIX: Record<string, Record<DurationTypeGroup, number>> = {
  avaliar:            { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },
  planejar:           { estatico: 10, carrossel: 15, video_curto: 15, video_longo: 20, outro: 15, default: 10 },
  criar_roteiro:      { estatico: 10, carrossel: 20, video_curto: 25, video_longo: 40, outro: 20, default: 15 },
  revisar_roteiro:    { estatico:  5, carrossel: 10, video_curto: 10, video_longo: 15, outro: 10, default: 10 },
  descarregar_captacao: { estatico:  5, carrossel: 10, video_curto: 15, video_longo: 20, outro: 10, default: 10 },
  revisar_captacao:   { estatico:  5, carrossel: 10, video_curto: 15, video_longo: 20, outro: 10, default: 10 },

  criar_arte:         { estatico: 20, carrossel: 40, video_curto: 20, video_longo: 20, outro: 30, default: 20 },
  captar:             { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 120, outro: 30, default: 30 },
  gerar_video:        { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 90,  outro: 30, default: 30 },
  editar_video:       { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 120, outro: 30, default: 30 },
  revisar:            { estatico:  5, carrossel: 10, video_curto: 15, video_longo: 20, outro: 10, default: 10 },
  enviar_cliente:     { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },
  publicar:           { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },
  revisar_publicacao: { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },

  // ---- Sistemas ----
  especificar:        { estatico: 20, carrossel: 20, video_curto: 20, video_longo: 20, outro: 20, default: 20 },
  desenvolver:        { estatico: 120, carrossel: 120, video_curto: 120, video_longo: 120, outro: 120, default: 120 },
  corrigir_bug_n1:    { estatico: 30, carrossel: 30, video_curto: 30, video_longo: 30, outro: 30, default: 30 },
  corrigir_bug_n2:    { estatico: 120, carrossel: 120, video_curto: 120, video_longo: 120, outro: 120, default: 120 },
  corrigir_bug_n3:    { estatico: 240, carrossel: 240, video_curto: 240, video_longo: 240, outro: 240, default: 240 },
  testar:             { estatico: 20, carrossel: 20, video_curto: 20, video_longo: 20, outro: 20, default: 20 },
  ajustar:            { estatico: 45, carrossel: 45, video_curto: 45, video_longo: 45, outro: 45, default: 45 },
  entregar_cliente:   { estatico: 10, carrossel: 10, video_curto: 10, video_longo: 10, outro: 10, default: 10 },
  feedback_cliente:   { estatico: 15, carrossel: 15, video_curto: 15, video_longo: 15, outro: 15, default: 15 },
};

/**
 * Demandas de Sistemas: o esforço vem do TIPO (nível do bug, desenvolvimento),
 * não do formato de mídia. Estes valores substituem a matriz por etapa nas
 * etapas de execução técnica.
 */
const SYSTEMS_TYPE_MINUTES: Record<string, number> = {
  bug_n1: 30,
  bug_n2: 120,
  bug_n3: 240,
  desenvolvimento: 240,
  melhoria: 120,
  suporte: 30,
};

const SYSTEMS_WORK_STAGES = new Set([
  "desenvolver",
  "corrigir_bug_n1",
  "corrigir_bug_n2",
  "corrigir_bug_n3",
  "ajustar",
]);


const FALLBACK_STAGE_DURATION: Record<DurationTypeGroup, number> = {
  estatico: 20,
  carrossel: 40,
  video_curto: 120,
  video_longo: 180,
  outro: 30,
  default: 30,
};

function typeGroup(card: ReorderCardInput): DurationTypeGroup {
  const key = (card.demand_type_key || "").toLowerCase();
  if (key === "criativo_estatico") return "estatico";
  if (key === "carrossel") return "carrossel";
  if (key === "video_gerado" || key === "video_curto") return "video_curto";
  if (key === "video_longo") return "video_longo";
  if (key === "outro") return "outro";
  const t = (card.demand_type || "").toLowerCase();
  if (t.includes("carross")) return "carrossel";
  if (t.includes("longo")) return "video_longo";
  if (t.includes("vídeo") || t.includes("video") || t.includes("reels") || t.includes("short")) return "video_curto";
  if (t.includes("estát") || t.includes("estat") || t.includes("post")) return "estatico";
  if (t.includes("outro")) return "outro";
  return "default";
}

function isOtherType(card: ReorderCardInput): boolean {
  const key = (card.demand_type_key || "").toLowerCase();
  if (key === "outro" || key === "") return !key || key === "outro" || typeGroup(card) === "outro" || typeGroup(card) === "default";
  if (!card.demand_type_key && !card.demand_type) return true;
  return typeGroup(card) === "outro" || typeGroup(card) === "default";
}

// ------------------------------------------------------------------
// Utilitários wallclock BRT
// ------------------------------------------------------------------

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = (hm || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
  return { h, m };
}

function toZonedVirtualUtc(source: Date, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  fmt.formatToParts(source).forEach((p) => {
    if (p.type !== "literal") parts[p.type] = p.value;
  });
  let h = +parts.hour;
  if (h === 24) h = 0;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, h, +parts.minute));
}

function spNowVirtualUtc(tz: string): Date {
  return toZonedVirtualUtc(new Date(), tz);
}

function toVirtualUtc(dateISO: string, timeHM: string): Date {
  const [y, mo, d] = dateISO.split("-").map((x) => parseInt(x, 10));
  const { h, m } = parseHM(timeHM);
  return new Date(Date.UTC(y, mo - 1, d, h, m));
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function isWeekend(d: Date): boolean {
  const g = d.getUTCDay();
  return g === 0 || g === 6;
}
function setMinuteOfDay(d: Date, minute: number): Date {
  const n = new Date(d);
  n.setUTCHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return n;
}
function isNonWorkingDay(d: Date, holidays: Set<string>): boolean {
  return isWeekend(d) || holidays.has(isoDate(d));
}

// ------------------------------------------------------------------
// Contexto de expediente
// ------------------------------------------------------------------

interface WorkCtx {
  wsMin: number;
  weMin: number;
  lsMin: number;
  leMin: number;
  hasLunch: boolean;
  holidays: Set<string>;
  areaSchedule?: AreaScheduleMap;
}

function buildCtx(wh: WorkHoursConfig, holidays: Set<string>, areaSchedule?: AreaScheduleMap): WorkCtx {
  const workStart = parseHM(wh.start);
  const workEnd = parseHM(wh.end);
  const lunchStart = parseHM(wh.lunchStart);
  const lunchEnd = parseHM(wh.lunchEnd);
  const wsMin = workStart.h * 60 + workStart.m;
  const weMin = workEnd.h * 60 + workEnd.m;
  const lsMin = lunchStart.h * 60 + lunchStart.m;
  const leMin = lunchEnd.h * 60 + lunchEnd.m;
  const hasLunch = leMin > lsMin && lsMin > wsMin && leMin < weMin;
  return { wsMin, weMin, lsMin, leMin, hasLunch, holidays, areaSchedule };
}

/** Blocos [start,end] em minutos do dia, ordenados, respeitando área quando disponível. */
function dayBlocks(d: Date, area: ReorderWorkArea | null | undefined, ctx: WorkCtx): Array<{ s: number; e: number }> {
  if (area && ctx.areaSchedule) {
    const blocks = ctx.areaSchedule[area]?.[d.getUTCDay()];
    if (blocks && blocks.length) {
      return [...blocks].filter((b) => b.e > b.s).sort((a, b) => a.s - b.s);
    }
  }
  // Fallback: workHours + almoço genérico
  if (ctx.hasLunch) {
    return [
      { s: ctx.wsMin, e: ctx.lsMin },
      { s: ctx.leMin, e: ctx.weMin },
    ];
  }
  return [{ s: ctx.wsMin, e: ctx.weMin }];
}

/** Minutos úteis num dia (somando todos os blocos da área). */
function workingMinutesInDay(d: Date, area: ReorderWorkArea | null | undefined, ctx: WorkCtx): number {
  return dayBlocks(d, area, ctx).reduce((acc, b) => acc + Math.max(0, b.e - b.s), 0);
}

/** Ajusta um cursor para o próximo instante trabalhável na área dada. */
function normalizeCursor(d: Date, area: ReorderWorkArea | null | undefined, ctx: WorkCtx): Date {
  let c = new Date(d);
  for (let guard = 0; guard < 500; guard++) {
    if (isNonWorkingDay(c, ctx.holidays)) {
      c.setUTCDate(c.getUTCDate() + 1);
      c.setUTCHours(0, 0, 0, 0);
      continue;
    }
    const blocks = dayBlocks(c, area, ctx);
    if (blocks.length === 0) {
      c.setUTCDate(c.getUTCDate() + 1);
      c.setUTCHours(0, 0, 0, 0);
      continue;
    }
    const mod = c.getUTCHours() * 60 + c.getUTCMinutes();
    // Antes do primeiro bloco
    if (mod < blocks[0].s) return setMinuteOfDay(c, blocks[0].s);
    // Dentro de algum bloco
    for (const b of blocks) {
      if (mod >= b.s && mod < b.e) return c;
    }
    // Em gap entre blocos → próximo bloco
    for (const b of blocks) {
      if (mod < b.s) return setMinuteOfDay(c, b.s);
    }
    // Após último bloco → próximo dia
    c.setUTCDate(c.getUTCDate() + 1);
    c.setUTCHours(0, 0, 0, 0);
  }
  return c;
}

/**
 * Aloca `durationMin` a partir de `cursor`, fatiando entre blocos da área,
 * pulando gaps/fins de expediente, fins de semana e feriados.
 * Se `blocked` (intervalos ocupados por cards fixos: captar/daily/aguardando)
 * for fornecido, o alocador contorna esses intervalos.
 */
function allocateAcrossDays(
  cursor: Date,
  durationMin: number,
  area: ReorderWorkArea | null | undefined,
  ctx: WorkCtx,
  blocked?: Array<{ start: Date; end: Date }>,
): { start: Date; end: Date; daysSpanned: number } {
  let c = normalizeCursor(cursor, area, ctx);
  c = skipBlocked(c, blocked);
  c = normalizeCursor(c, area, ctx);
  const start = new Date(c);
  let remaining = Math.max(1, durationMin);
  let last = new Date(c);
  const daysSeen = new Set<string>();
  daysSeen.add(isoDate(c));

  for (let guard = 0; guard < 800 && remaining > 0; guard++) {
    c = normalizeCursor(c, area, ctx);
    c = skipBlocked(c, blocked);
    c = normalizeCursor(c, area, ctx);
    daysSeen.add(isoDate(c));
    const nowMin = c.getUTCHours() * 60 + c.getUTCMinutes();
    const blocks = dayBlocks(c, area, ctx);
    const currentBlock = blocks.find((b) => nowMin >= b.s && nowMin < b.e);
    if (!currentBlock) {
      c.setUTCDate(c.getUTCDate() + 1);
      c.setUTCHours(0, 0, 0, 0);
      continue;
    }
    // Limite do segmento contínuo: fim do bloco OU início do próximo intervalo bloqueado neste dia
    let segmentEndMin = currentBlock.e;
    const nextBlockedStart = nextBlockedStartInDay(c, currentBlock, blocked);
    if (nextBlockedStart !== null && nextBlockedStart > nowMin && nextBlockedStart < segmentEndMin) {
      segmentEndMin = nextBlockedStart;
    }
    const available = segmentEndMin - nowMin;
    if (available <= 0) {
      c = setMinuteOfDay(c, segmentEndMin);
      c = skipBlocked(c, blocked);
      continue;
    }
    if (remaining <= available) {
      last = new Date(c);
      last.setUTCMinutes(last.getUTCMinutes() + remaining);
      remaining = 0;
      break;
    }
    remaining -= available;
    c = setMinuteOfDay(c, segmentEndMin);
    if (segmentEndMin < currentBlock.e) {
      c = skipBlocked(c, blocked);
      continue;
    }
    const nextBlock = blocks.find((b) => b.s >= currentBlock.e);
    if (nextBlock) {
      c = setMinuteOfDay(c, nextBlock.s);
    } else {
      c.setUTCDate(c.getUTCDate() + 1);
      c.setUTCHours(0, 0, 0, 0);
    }
  }

  daysSeen.add(isoDate(last));
  return { start, end: last, daysSpanned: daysSeen.size };
}

/** Se `c` cai dentro de algum intervalo bloqueado, avança para o fim dele (encadeia). */
function skipBlocked(c: Date, blocked?: Array<{ start: Date; end: Date }>): Date {
  if (!blocked || blocked.length === 0) return c;
  let cur = new Date(c);
  for (let guard = 0; guard < 50; guard++) {
    const hit = blocked.find((b) => cur >= b.start && cur < b.end);
    if (!hit) return cur;
    cur = new Date(hit.end);
  }
  return cur;
}

/** Início (min do dia) do próximo bloqueio que cai dentro do bloco atual, ou null. */
function nextBlockedStartInDay(
  c: Date,
  currentBlock: { s: number; e: number },
  blocked?: Array<{ start: Date; end: Date }>,
): number | null {
  if (!blocked || blocked.length === 0) return null;
  const dayISO = isoDate(c);
  const nowMin = c.getUTCHours() * 60 + c.getUTCMinutes();
  let best: number | null = null;
  for (const b of blocked) {
    const bStartDay = isoDate(b.start);
    if (bStartDay !== dayISO) continue;
    const bStartMin = b.start.getUTCHours() * 60 + b.start.getUTCMinutes();
    if (bStartMin > nowMin && bStartMin >= currentBlock.s && bStartMin < currentBlock.e) {
      if (best === null || bStartMin < best) best = bStartMin;
    }
  }
  return best;
}

// ------------------------------------------------------------------
// Duração base do card
// ------------------------------------------------------------------

/**
 * Minutos ÚTEIS entre dois instantes: soma apenas a interseção com os blocos de
 * expediente de cada dia (respeita almoço, área mídia×sistemas), ignorando
 * noites, fins de semana e feriados.
 */
function businessMinutesBetween(
  from: Date,
  to: Date,
  area: ReorderWorkArea | null,
  ctx: WorkCtx,
): number {
  if (!(to > from)) return 0;
  let total = 0;
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setUTCHours(0, 0, 0, 0);

  for (let guard = 0; guard < 400 && cur <= endDay; guard++) {
    if (!isNonWorkingDay(cur, ctx.holidays)) {
      const dayStartMin = isoDate(cur) === isoDate(from) ? from.getUTCHours() * 60 + from.getUTCMinutes() : 0;
      const dayEndMin = isoDate(cur) === isoDate(to) ? to.getUTCHours() * 60 + to.getUTCMinutes() : 24 * 60;
      for (const b of dayBlocks(cur, area, ctx)) {
        const s = Math.max(b.s, dayStartMin);
        const e = Math.min(b.e, dayEndMin);
        if (e > s) total += e - s;
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return total;
}

function cardArea(card: ReorderCardInput): ReorderWorkArea | null {
  return card.work_area === "midia" || card.work_area === "sistemas" ? card.work_area : null;
}

/** Formata minutos como "4h20" / "45min" para os avisos do reorganizador. */
export function fmtMinutes(min: number): string {
  const total = Math.max(0, Math.round(min));
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}


function scheduledSpanMinutes(card: ReorderCardInput, ctx: WorkCtx): number | null {
  if (!card.due_date || !card.due_time || !card.delivery_date || !card.delivery_time) return null;
  const due = toVirtualUtc(card.due_date, card.due_time.slice(0, 5));
  const deliv = toVirtualUtc(card.delivery_date, card.delivery_time.slice(0, 5));
  if (!(deliv > due)) return null;
  const total = businessMinutesBetween(due, deliv, cardArea(card), ctx);
  if (total <= 0) return null;
  return Math.max(5, total);
}

/**
 * Instante em que o card entrou na etapa atual, no relógio virtual do expediente.
 * A base é o mais recente entre a entrada na etapa e o início registrado do card;
 * assim, ao trocar de etapa o acumulado das etapas anteriores deixa de contar.
 */
function stageBaseStart(card: ReorderCardInput, tz: string): Date | null {
  const origStart = card.due_date && card.due_time
    ? toVirtualUtc(card.due_date, card.due_time.slice(0, 5))
    : null;
  let stageStart: Date | null = null;
  if (card.stage_started_at) {
    const parsed = new Date(card.stage_started_at);
    if (!Number.isNaN(parsed.getTime())) stageStart = toZonedVirtualUtc(parsed, tz);
  }
  if (origStart && stageStart) return stageStart > origStart ? stageStart : origStart;
  return stageStart ?? origStart;
}

/**
 * Tempo útil já planejado DENTRO da etapa atual (entre a base da etapa e o
 * término previsto). Sem teto de jornada: uma etapa pode legitimamente ocupar
 * vários dias, e cortar isso reduziria 14h25 a poucos minutos.
 */
function stagePlannedMinutes(card: ReorderCardInput, ctx: WorkCtx, tz: string): number | null {
  const base = stageBaseStart(card, tz);
  const end = cardDeadline(card);
  if (!base || !end || !(end > base)) return null;
  const total = businessMinutesBetween(base, end, cardArea(card), ctx);
  return total > 0 ? total : null;
}



export type StageDurationOverrides = Record<string, Partial<Record<DurationTypeGroup, number>>>;

function pickFromOverrides(
  overrides: StageDurationOverrides | undefined,
  stage: string,
  group: DurationTypeGroup,
  area?: string | null,
): number | null {
  // Chaves são prefixadas por área (`sistemas:revisar`) para evitar colisão
  // entre etapas homônimas de Mídia e Sistemas. Fallback: chave sem prefixo.
  const areaKey = `${area === "sistemas" ? "sistemas" : "midia"}:${stage}`;
  const row = overrides?.[areaKey] ?? overrides?.[stage];
  if (!row) return null;
  const v = row[group] ?? row.default;
  return typeof v === "number" && v > 0 ? v : null;
}

function estimateDurationBase(
  card: ReorderCardInput,
  ctx: WorkCtx,
  overrides?: StageDurationOverrides,
): number {
  if (card.is_daily_card) return 20;
  const group = typeGroup(card);
  const stage = (card.current_function_key || "").toLowerCase();
  const area = card.work_area === "sistemas" ? "sistemas" : "midia";

  // Sistemas: o tipo (nível do bug / desenvolvimento) define o esforço.
  const systemsKey = (card.demand_type_key || "").toLowerCase();
  if (SYSTEMS_TYPE_MINUTES[systemsKey] !== undefined) {
    const overridden = pickFromOverrides(overrides, stage, "default", area);
    if (overridden !== null) return overridden;
    if (SYSTEMS_WORK_STAGES.has(stage)) return SYSTEMS_TYPE_MINUTES[systemsKey];
    const stageRow = DURATION_MATRIX[stage];
    if (stageRow) return stageRow.default;
    return SYSTEMS_TYPE_MINUTES[systemsKey];
  }

  if (isOtherType(card)) {
    const overridden = pickFromOverrides(overrides, stage, "outro", area);
    if (overridden !== null) return overridden;
    const span = scheduledSpanMinutes(card, ctx);
    // Teto de 1 jornada útil: spans maiores são resíduo de agendamentos antigos
    // (card arrastado por dias) e não representam esforço real.
    const cap = Math.max(60, workingMinutesInDay(new Date(), card.work_area, ctx));
    if (span && span > 0 && span <= cap) return span;
    const stageRow = DURATION_MATRIX[stage];
    if (stageRow) return stageRow.outro ?? stageRow.default;
    return FALLBACK_STAGE_DURATION.outro;
  }


  const overridden = pickFromOverrides(overrides, stage, group, area);
  if (overridden !== null) return overridden;
  const stageRow = DURATION_MATRIX[stage];
  if (stageRow) return stageRow[group] ?? stageRow.default;
  return FALLBACK_STAGE_DURATION[group];
}

/** Compatibilidade retroativa (usada em outros lugares) */
export function estimateDurationMinutes(card: ReorderCardInput): number {
  const ctx: WorkCtx = buildCtx(DEFAULT_WORK_HOURS, new Set());
  return estimateDurationBase(card, ctx);
}

// ------------------------------------------------------------------
// Atraso
// ------------------------------------------------------------------

function cardDeadline(card: ReorderCardInput): Date | null {
  if (card.delivery_date && card.delivery_time) {
    return toVirtualUtc(card.delivery_date, card.delivery_time.slice(0, 5));
  }
  if (card.publish_date) {
    return toVirtualUtc(card.publish_date, (card.publish_time || "18:00").slice(0, 5));
  }
  return null;
}

// ------------------------------------------------------------------
// Ordenação
// ------------------------------------------------------------------

function dueKey(c: ReorderCardInput): string {
  return `${c.due_date || "9999-12-31"}T${(c.due_time || "23:59").slice(0, 5)}`;
}
function pubKey(c: ReorderCardInput): string {
  if (!c.publish_date) return "9999-12-31T23:59";
  return `${c.publish_date}T${(c.publish_time || "23:59").slice(0, 5)}`;
}

export function hasPublishDateCandidates(cards: ReorderCardInput[]): boolean {
  const active = cards.filter((c) => !isClientWaitingFunction(c.current_function_key));
  if (active.length <= 1) return false;
  const byDue = [...active].sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
  const rest = byDue.slice(1);
  return rest.some((c) => !!c.publish_date);
}

/**
 * Prioridade de alocação: Produção (0) → Em revisão (1) → Avaliar (2).
 */
export function reorderTier(c: ReorderCardInput): 0 | 1 | 2 {
  const k = (c.current_function_key || "").toLowerCase();
  if (isEvaluationFunction(k)) return 2;
  if (isReviewFunction(k)) return 1;
  return 0;
}

export function sortForReorder(
  cards: ReorderCardInput[],
  opts?: { prioritizePublishDate?: boolean },
): ReorderCardInput[] {
  if (cards.length === 0) return [];

  const sortTier = (tierCards: { c: ReorderCardInput; i: number }[]) => {
    if (tierCards.length === 0) return [];
    const byDue = [...tierCards].sort((a, b) => {
      const cmp = dueKey(a.c).localeCompare(dueKey(b.c));
      return cmp !== 0 ? cmp : a.i - b.i;
    });
    const inProgress = byDue[0];
    const rest = byDue.slice(1);
    if (opts?.prioritizePublishDate) {
      rest.sort((a, b) => {
        const cmp = pubKey(a.c).localeCompare(pubKey(b.c));
        if (cmp !== 0) return cmp;
        return dueKey(a.c).localeCompare(dueKey(b.c));
      });
    }
    return [inProgress, ...rest];
  };

  const indexed = cards.map((c, i) => ({ c, i }));
  const t0 = indexed.filter((x) => reorderTier(x.c) === 0);
  const t1 = indexed.filter((x) => reorderTier(x.c) === 1);
  const t2 = indexed.filter((x) => reorderTier(x.c) === 2);

  return [...sortTier(t0), ...sortTier(t1), ...sortTier(t2)].map((x) => x.c);
}

// ------------------------------------------------------------------
// Reorganização principal
// ------------------------------------------------------------------

export interface ReorderManualOverride {
  startISO?: string;
  startTime?: string;
  /** Término fixado manualmente (usado em cards em execução, cujo início não deve mudar). */
  endISO?: string;
  endTime?: string;
  durationMin?: number;
}

export async function computeReorder(
  cards: ReorderCardInput[],
  opts?: {
    startFrom?: Date;
    workHours?: WorkHoursConfig;
    prioritizePublishDate?: boolean;
    durations?: StageDurationOverrides;
    areaSchedule?: AreaScheduleMap;
    scheduledPublishIds?: Set<string>;
    manualOverrides?: Record<string, ReorderManualOverride>;
  },



): Promise<ReorderProposal[]> {
  if (cards.length === 0) return [];
  const scheduledIds = opts?.scheduledPublishIds || new Set<string>();
  // Cards com publicação agendada (dispatch ativo) não ocupam alocação — tratados como externos à fila operacional.
  // Isso vale para qualquer etapa: se já existe dispatch ativo, o card não deve empurrar a próxima tarefa real.
  cards = cards.filter((c) => {
    return !scheduledIds.has(c.id);
  });
  if (cards.length === 0) return [];

  const wh = { ...DEFAULT_WORK_HOURS, ...(opts?.workHours || {}) };

  // Todo o motor trabalha com um "UTC virtual": os campos UTC representam o
  // relógio local do expediente. `startFrom`, porém, é um Date real (instante
  // UTC). Convertê-lo diretamente mantinha 16:57 nos campos UTC quando o modal
  // mostrava 13:57 em São Paulo, deslocando a proposta em três horas.
  const now = opts?.startFrom
    ? toZonedVirtualUtc(new Date(opts.startFrom), wh.tz)
    : spNowVirtualUtc(wh.tz);
  const rangeStart = isoDate(now);
  const rangeEndDate = new Date(now);
  rangeEndDate.setUTCDate(rangeEndDate.getUTCDate() + 180);
  let holidays: Set<string> = new Set();
  try {
    holidays = await fetchHolidaysInRange(rangeStart, isoDate(rangeEndDate));
  } catch {
    holidays = new Set();
  }

  const ctx = buildCtx(wh, holidays, opts?.areaSchedule);

  // Cards que estão aguardando resposta do cliente não consomem tempo do colaborador
  // nem recebem horário novo — ficam totalmente fora do cálculo.
  const captarFixed = cards.filter((c) => (c.current_function_key || "").toLowerCase() === "captar");
  const dailyFixed = cards.filter((c) => !!c.is_daily_card && !isClientWaitingFunction(c.current_function_key) && (c.current_function_key || "").toLowerCase() !== "captar");
  const active = cards.filter((c) => {
    const k = (c.current_function_key || "").toLowerCase();
    if (isClientWaitingFunction(k) || k === "captar") return false;
    if (c.is_daily_card) return false;
    return true;
  });

  const ordered = sortForReorder(active, { prioritizePublishDate: opts?.prioritizePublishDate });

  // Intervalos ocupados por cards fixos (captar, daily).
  // O alocador contornará esses intervalos em vez de agendar por cima.
  type BlockedInterval = { start: Date; end: Date; kind?: "captar" | "daily" | "awaiting"; cardId?: string; title?: string };
  const blocked: BlockedInterval[] = [];
  const tagFor = (c: ReorderCardInput): "captar" | "daily" | "awaiting" => {
    const k = (c.current_function_key || "").toLowerCase();
    if (k === "captar") return "captar";
    return "daily";
  };
  for (const c of [...captarFixed, ...dailyFixed]) {
    if (!c.due_date || !c.due_time || !c.delivery_date || !c.delivery_time) continue;
    const rawStart = toVirtualUtc(c.due_date, c.due_time.slice(0, 5));
    const e = toVirtualUtc(c.delivery_date, c.delivery_time.slice(0, 5));
    // Descartar bloqueios totalmente no passado — não devem empurrar o cursor.
    if (e <= now) continue;
    // Truncar início ao agora: bloqueios que começaram no passado só valem daqui pra frente.
    const s = rawStart < now ? new Date(now) : rawStart;
    if (e > s) blocked.push({ start: s, end: e, kind: tagFor(c), cardId: c.id, title: c.title });
  }
  blocked.sort((a, b) => a.start.getTime() - b.start.getTime());


  // Cursor ÚNICO por responsável (não mais separado por área).
  // A área do card só influencia quais BLOCOS de expediente estão disponíveis.
  const initialCursor = normalizeCursor(new Date(now), null, ctx);
  const bumped = new Date(initialCursor);
  const bump = bumped.getUTCMinutes() % 5;
  if (bump !== 0) bumped.setUTCMinutes(bumped.getUTCMinutes() + (5 - bump), 0, 0);
  let cursor = bumped;

  const proposals: ReorderProposal[] = [];
  let isFirstActive = true;

  for (const card of ordered) {
    const area: ReorderWorkArea | null = (card.work_area === "midia" || card.work_area === "sistemas")
      ? card.work_area
      : null;

    const manual = opts?.manualOverrides?.[card.id];
    const manualStart = manual?.startISO && manual?.startTime
      ? toVirtualUtc(manual.startISO, manual.startTime.slice(0, 5))
      : null;
    const manualEnd = manual?.endISO && manual?.endTime
      ? toVirtualUtc(manual.endISO, manual.endTime.slice(0, 5))
      : null;
    const baseDur = manual?.durationMin && manual.durationMin > 0
      ? manual.durationMin
      : estimateDurationBase(card, ctx, opts?.durations);
    let dur = baseDur;
    let slackApplied = false;
    let start: Date;
    let end: Date;
    let daysSpanned = 1;
    let clampWarning: string | undefined;

    // Card em execução no topo da fila: começou no passado.
    const origStart = card.due_date && card.due_time ? toVirtualUtc(card.due_date, card.due_time.slice(0, 5)) : null;
    const origEnd = cardDeadline(card);
    // O primeiro card também é considerado em andamento quando um dado antigo
    // ficou invertido (início posterior ao fim), mas o término ainda está no
    // futuro. Isso evita descartar o prazo vigente e reiniciar toda a duração.
    const hasInvertedActiveWindow = !!origStart && !!origEnd && origStart >= origEnd && origEnd > now;
    // Fixar o TÉRMINO não descaracteriza o card em execução — apenas fixar o início.
    const inProgressFirst = isFirstActive && !manualStart && !!origStart && (origStart <= now || hasInvertedActiveWindow);

    let treatAsStuck = false;
    if (inProgressFirst && origEnd && origEnd < now) treatAsStuck = true;

    // Card atrasado em execução: o esforço da ETAPA ATUAL é a base da extensão.
    // A folga de 30% incide sobre o tempo útil já planejado dentro da etapa
    // (não sobre a estimativa genérica, nem sobre a vida inteira do card).
    const stageBase = treatAsStuck ? stageBaseStart(card, wh.tz) : null;
    const stagePlanned = treatAsStuck ? stagePlannedMinutes(card, ctx, wh.tz) : null;
    let extensionMin: number | null = null;
    let keepStart = false;

    if (treatAsStuck) {
      if (stagePlanned && stagePlanned > baseDur) {
        extensionMin = Math.max(5, Math.round((stagePlanned * 0.30) / 5) * 5);
        dur = extensionMin;
        keepStart = true;
      } else {
        const slack = Math.round(baseDur * 0.30);
        dur = baseDur + slack;
        extensionMin = slack;
      }
      slackApplied = true;
    }

    // Término fixado manualmente: mantém o início (histórico ou o do cursor) e
    // deriva a duração pelo tempo útil até o término escolhido.
    const usableManualEnd = manualEnd && manualEnd > now ? manualEnd : null;
    let pinnedKind: "start" | "end" | "both" | null = null;

    if (manualStart && usableManualEnd) {
      // Início E término fixados manualmente: a duração é o tempo útil entre eles.
      pinnedKind = "both";
      let effectiveStart = manualStart;
      if (manualStart < now) {
        effectiveStart = normalizeCursor(new Date(now), area, ctx);
        clampWarning = "Ajuste anterior ao horário atual — movido para o próximo horário útil.";
      }
      if (usableManualEnd <= effectiveStart) {
        // Término inválido depois do clamp: cai no cálculo automático a partir do início.
        ({ start, end, daysSpanned } = allocateAcrossDays(effectiveStart, dur, area, ctx, undefined));
        clampWarning = clampWarning
          ? `${clampWarning} Término informado é anterior ao início — recalculado.`
          : "Término informado é anterior ao início — recalculado.";
      } else {
        start = effectiveStart;
        end = usableManualEnd;
        dur = Math.max(5, businessMinutesBetween(effectiveStart, usableManualEnd, area, ctx) || 5);
        daysSpanned = isoDate(end) === isoDate(start) ? 1 : 2;
      }
      keepStart = false;
    } else if (manualStart) {
      pinnedKind = "start";
      // Início fixado manualmente nunca pode cair no passado.
      let effectiveStart = manualStart;
      if (manualStart < now) {
        effectiveStart = normalizeCursor(new Date(now), area, ctx);
        clampWarning = "Ajuste anterior ao horário atual — movido para o próximo horário útil.";
      }
      ({ start, end, daysSpanned } = allocateAcrossDays(effectiveStart, dur, area, ctx, undefined));
      keepStart = false;
    } else if (usableManualEnd) {
      pinnedKind = "end";
      const allocBase = normalizeCursor(new Date(now > cursor ? now : cursor), area, ctx);
      start = allocBase;
      end = usableManualEnd;
      dur = Math.max(5, businessMinutesBetween(allocBase, usableManualEnd, area, ctx) || 5);
      daysSpanned = 1;
      if (treatAsStuck) {
        keepStart = true;
        extensionMin = dur;
      }
    } else {
      if (manualEnd && !usableManualEnd) {
        clampWarning = "Término informado já passou — recalculado automaticamente.";
      }
      ({ start, end, daysSpanned } = allocateAcrossDays(cursor, dur, area, ctx, blocked));
    }

    // Atrasado em execução: preserva o início histórico apenas na exibição/gravação.
    // O intervalo realmente ocupado na agenda é o da extensão (allocStart → end).
    const allocStart = new Date(start);
    if (keepStart && origStart) {
      start = new Date(origStart);
    }


    // Um card em andamento com término futuro já consumiu parte do esforço.
    // Preserva o término vigente e agenda somente o tempo restante desde agora,
    // inclusive para intervalos antigos invertidos (como 14:35 → 14:00).
    if (!manualEnd && !treatAsStuck && inProgressFirst && origEnd && origEnd > now && isoDate(origEnd) === isoDate(now)) {
      start = new Date(now);
      end = origEnd;
      dur = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
      daysSpanned = 1;
    }





    let warning: string | undefined;
    let publishDeadline: string | null = null;
    if (card.publish_date) {
      const pt = (card.publish_time || "18:00").slice(0, 5);
      publishDeadline = `${card.publish_date}T${pt}`;
      const deadline = toVirtualUtc(card.publish_date, pt);
      const reserve = new Date(deadline);
      reserve.setUTCHours(reserve.getUTCHours() - 1);
      if (end > reserve) warning = "Termina após o prazo de publicação recomendado.";
    }
    if (daysSpanned > 1 && !keepStart) {
      const extra = `Se estende por ${daysSpanned} dias úteis.`;
      warning = warning ? `${warning} ${extra}` : extra;
    }
    if (slackApplied) {
      const extra = keepStart
        ? `Atrasado: extensão de 30% do tempo da etapa (+${fmtMinutes(extensionMin || 0)}).`
        : "Tempo extra aplicado (atraso + folga).";
      warning = warning ? `${warning} ${extra}` : extra;
    }
    if (clampWarning) {
      warning = warning ? `${warning} ${clampWarning}` : clampWarning;
    }


    const startISO = isoDate(start);
    const startTime = hhmm(start);
    const endISO = isoDate(end);
    const endTime = hhmm(end);

    const changed =
      card.due_date !== startISO ||
      (card.due_time || "").slice(0, 5) !== startTime ||
      card.delivery_date !== endISO ||
      (card.delivery_time || "").slice(0, 5) !== endTime;

    // Detecta se algum intervalo bloqueado do tipo "captar" cai dentro deste card,
    // sinalizando visualmente que a produção foi pausada para captação.
    let pausedByCaptar: ReorderProposal["pausedByCaptar"] = null;
    for (const b of blocked) {
      if (b.kind !== "captar" || !b.cardId) continue;
      if (b.start >= allocStart && b.start < end) {
        pausedByCaptar = {
          atISO: isoDate(b.start),
          atTime: hhmm(b.start),
          captarId: b.cardId,
          captarTitle: b.title || "Captar",
        };
        break;
      }
    }

    proposals.push({
      id: card.id,
      title: card.title,
      durationMin: dur,
      startISO,
      startTime,
      endISO,
      endTime,
      publishDeadline,
      warning,
      changed,
      spansDays: daysSpanned,
      slackApplied,
      pinned: !!pinnedKind,
      pinnedKind,
      keepStart,
      stageStartISO: stageBase ? isoDate(stageBase) : null,
      stageStartTime: stageBase ? hhmm(stageBase) : null,
      stagePlannedMin: stagePlanned ?? null,
      extensionMin,
      pausedByCaptar,
    });


    // Adiciona intervalo recém-alocado à lista de bloqueados para o próximo card.
    blocked.push({ start: allocStart, end });
    blocked.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Próximo cursor: 5min após o fim do card (o skipBlocked cuidará de intervalos futuros).
    // O cursor nunca retrocede antes do instante-base: um ajuste manual antigo não
    // pode jogar os cards seguintes para datas já vencidas.
    const nextCursor = new Date(end > now ? end : now);
    nextCursor.setUTCMinutes(nextCursor.getUTCMinutes() + 5);
    cursor = normalizeCursor(nextCursor, null, ctx);

    isFirstActive = false;
  }


  const awaiting = cards.filter((c) => isClientWaitingFunction(c.current_function_key));
  for (const c of awaiting) {
    proposals.push({
      id: c.id,
      title: c.title,
      durationMin: 0,
      startISO: c.due_date || "",
      startTime: (c.due_time || "").slice(0, 5),
      endISO: c.delivery_date || "",
      endTime: (c.delivery_time || "").slice(0, 5),
      publishDeadline: null,
      changed: false,
      skipped: true,
      warning: "Cliente — não reagendado.",
    });
  }

  for (const c of captarFixed) {
    proposals.push({
      id: c.id,
      title: c.title,
      durationMin: 0,
      startISO: c.due_date || "",
      startTime: (c.due_time || "").slice(0, 5),
      endISO: c.delivery_date || "",
      endTime: (c.delivery_time || "").slice(0, 5),
      publishDeadline: null,
      changed: false,
      skipped: true,
      warning: "Captar — horário fixo, não reagendado.",
    });
  }

  for (const c of dailyFixed) {
    proposals.push({
      id: c.id,
      title: c.title,
      durationMin: 0,
      startISO: c.due_date || "",
      startTime: (c.due_time || "").slice(0, 5),
      endISO: c.delivery_date || "",
      endTime: (c.delivery_time || "").slice(0, 5),
      publishDeadline: null,
      changed: false,
      skipped: true,
      warning: "Card diário — ciclo próprio, não reagendado.",
    });
  }

  return proposals;
}

