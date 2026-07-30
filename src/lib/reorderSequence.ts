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
  criar_arte:         { estatico: 20, carrossel: 40, video_curto: 20, video_longo: 20, outro: 30, default: 20 },
  captar:             { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 120, outro: 30, default: 30 },
  gerar_video:        { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 90,  outro: 30, default: 30 },
  editar_video:       { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 120, outro: 30, default: 30 },
  revisar:            { estatico:  5, carrossel: 10, video_curto: 15, video_longo: 20, outro: 10, default: 10 },
  enviar_cliente:     { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },
  publicar:           { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },
  revisar_publicacao: { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, outro:  5, default:  5 },
};

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
 * Minutos ÚTEIS entre due e delivery: soma apenas a interseção com os blocos
 * de expediente de cada dia (respeita almoço, área mídia×sistemas), ignorando
 * noites, fins de semana e feriados.
 */
function scheduledSpanMinutes(card: ReorderCardInput, ctx: WorkCtx): number | null {
  if (!card.due_date || !card.due_time || !card.delivery_date || !card.delivery_time) return null;
  const due = toVirtualUtc(card.due_date, card.due_time.slice(0, 5));
  const deliv = toVirtualUtc(card.delivery_date, card.delivery_time.slice(0, 5));
  if (!(deliv > due)) return null;

  const area = card.work_area === "midia" || card.work_area === "sistemas" ? card.work_area : null;
  let total = 0;
  const cur = new Date(due);
  cur.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(deliv);
  endDay.setUTCHours(0, 0, 0, 0);

  for (let guard = 0; guard < 400 && cur <= endDay; guard++) {
    if (!isNonWorkingDay(cur, ctx.holidays)) {
      const dayStartMin = isoDate(cur) === isoDate(due) ? due.getUTCHours() * 60 + due.getUTCMinutes() : 0;
      const dayEndMin = isoDate(cur) === isoDate(deliv) ? deliv.getUTCHours() * 60 + deliv.getUTCMinutes() : 24 * 60;
      for (const b of dayBlocks(cur, area, ctx)) {
        const s = Math.max(b.s, dayStartMin);
        const e = Math.min(b.e, dayEndMin);
        if (e > s) total += e - s;
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  if (total <= 0) return null;
  return Math.max(5, total);
}


export type StageDurationOverrides = Record<string, Partial<Record<DurationTypeGroup, number>>>;

function pickFromOverrides(
  overrides: StageDurationOverrides | undefined,
  stage: string,
  group: DurationTypeGroup,
): number | null {
  const row = overrides?.[stage];
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

  if (isOtherType(card)) {
    const overridden = pickFromOverrides(overrides, stage, "outro");
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


  const overridden = pickFromOverrides(overrides, stage, group);
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
    const baseDur = manual?.durationMin && manual.durationMin > 0
      ? manual.durationMin
      : estimateDurationBase(card, ctx, opts?.durations);
    let dur = baseDur;
    let slackApplied = false;
    let start: Date;
    let end: Date;
    let daysSpanned = 1;

    // Card em execução no topo da fila: começou no passado.
    const origStart = card.due_date && card.due_time ? toVirtualUtc(card.due_date, card.due_time.slice(0, 5)) : null;
    const origEnd = cardDeadline(card);
    // O primeiro card também é considerado em andamento quando um dado antigo
    // ficou invertido (início posterior ao fim), mas o término ainda está no
    // futuro. Isso evita descartar o prazo vigente e reiniciar toda a duração.
    const hasInvertedActiveWindow = !!origStart && !!origEnd && origStart >= origEnd && origEnd > now;
    const inProgressFirst = isFirstActive && !manual && !!origStart && (origStart <= now || hasInvertedActiveWindow);

    let treatAsStuck = false;
    if (inProgressFirst && origEnd && origEnd < now) treatAsStuck = true;

    if (treatAsStuck) {
      const slack = Math.round(baseDur * 0.30);
      dur = baseDur + slack;
      slackApplied = true;
    }

    const pinnedStart = manual?.startISO && manual?.startTime
      ? toVirtualUtc(manual.startISO, manual.startTime.slice(0, 5))
      : null;

    if (pinnedStart) {
      // Início fixado manualmente: aloca exatamente ali (ainda fatiando entre blocos de expediente).
      ({ start, end, daysSpanned } = allocateAcrossDays(pinnedStart, dur, area, ctx, undefined));
    } else {
      ({ start, end, daysSpanned } = allocateAcrossDays(cursor, dur, area, ctx, blocked));
    }

    // Um card em andamento com término futuro já consumiu parte do esforço.
    // Preserva o término vigente e agenda somente o tempo restante desde agora,
    // inclusive para intervalos antigos invertidos (como 14:35 → 14:00).
    if (inProgressFirst && origEnd && origEnd > now && isoDate(origEnd) === isoDate(now)) {
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
    if (daysSpanned > 1) {
      const extra = `Se estende por ${daysSpanned} dias úteis.`;
      warning = warning ? `${warning} ${extra}` : extra;
    }
    if (slackApplied) {
      const extra = "Tempo extra aplicado (atraso + folga).";
      warning = warning ? `${warning} ${extra}` : extra;
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
      if (b.start >= start && b.start < end) {
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
      pinned: !!pinnedStart,
      pausedByCaptar,
    });

    // Adiciona intervalo recém-alocado à lista de bloqueados para o próximo card.
    blocked.push({ start, end });
    blocked.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Próximo cursor: 5min após o fim do card (o skipBlocked cuidará de intervalos futuros).
    const nextCursor = new Date(end);
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

