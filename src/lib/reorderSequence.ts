/**
 * Reordena a sequência de produção de um colaborador.
 * - Duração por (tipo × etapa) via matriz; "Outros" usa o intervalo agendado.
 * - Divide cards longos em fatias que respeitam expediente + almoço.
 * - Aplica folga proporcional (30%) + atraso acumulado no primeiro card atrasado.
 * - Pula finais de semana e feriados (br_calendar_events).
 * - Usa fuso America/Sao_Paulo por padrão como "UTC virtual".
 */
import { fetchHolidaysInRange } from "@/lib/dailyCards";

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

function spNowVirtualUtc(tz: string): Date {
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
  fmt.formatToParts(new Date()).forEach((p) => {
    if (p.type !== "literal") parts[p.type] = p.value;
  });
  let h = +parts.hour;
  if (h === 24) h = 0;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, h, +parts.minute));
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
function setTimeOfDay(d: Date, h: number, m: number): Date {
  const n = new Date(d);
  n.setUTCHours(h, m, 0, 0);
  return n;
}
function isNonWorkingDay(d: Date, holidays: Set<string>): boolean {
  return isWeekend(d) || holidays.has(isoDate(d));
}

// ------------------------------------------------------------------
// Contexto de expediente (minutos por dia disponíveis)
// ------------------------------------------------------------------

interface WorkCtx {
  wsMin: number; // work start minutes of day
  weMin: number;
  lsMin: number; // lunch start
  leMin: number;
  hasLunch: boolean;
  workStart: { h: number; m: number };
  workEnd: { h: number; m: number };
  lunchStart: { h: number; m: number };
  lunchEnd: { h: number; m: number };
  holidays: Set<string>;
}

/** Minutos úteis num dia (sem contar almoço). */
function workingMinutesPerDay(ctx: WorkCtx): number {
  const raw = ctx.weMin - ctx.wsMin;
  return ctx.hasLunch ? raw - (ctx.leMin - ctx.lsMin) : raw;
}

/** Ajusta um cursor para o próximo instante trabalhável (skip almoço/fim de dia/feriados). */
function normalizeCursor(d: Date, ctx: WorkCtx): Date {
  let c = new Date(d);
  // Pula fim de semana / feriado
  while (isNonWorkingDay(c, ctx.holidays)) {
    c.setUTCDate(c.getUTCDate() + 1);
    c = setTimeOfDay(c, ctx.workStart.h, ctx.workStart.m);
  }
  const mod = c.getUTCHours() * 60 + c.getUTCMinutes();
  // Antes do início → início
  if (mod < ctx.wsMin) return setTimeOfDay(c, ctx.workStart.h, ctx.workStart.m);
  // Durante almoço → fim do almoço
  if (ctx.hasLunch && mod >= ctx.lsMin && mod < ctx.leMin) {
    return setTimeOfDay(c, ctx.lunchEnd.h, ctx.lunchEnd.m);
  }
  // No/após fim → próximo dia útil
  if (mod >= ctx.weMin) {
    let next = new Date(c);
    next.setUTCDate(next.getUTCDate() + 1);
    next = setTimeOfDay(next, ctx.workStart.h, ctx.workStart.m);
    while (isNonWorkingDay(next, ctx.holidays)) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }
  return c;
}

/**
 * Aloca `durationMin` a partir de `cursor`, fatiando entre janelas de expediente,
 * pulando almoço, fim de dia, fins de semana e feriados. Retorna o instante inicial
 * (do primeiro bloco), final (do último bloco) e o número de dias úteis atravessados.
 */
function allocateAcrossDays(
  cursor: Date,
  durationMin: number,
  ctx: WorkCtx,
): { start: Date; end: Date; daysSpanned: number } {
  let c = normalizeCursor(cursor, ctx);
  const start = new Date(c);
  let remaining = Math.max(1, durationMin);
  let last = new Date(c);
  const daysSeen = new Set<string>();
  daysSeen.add(isoDate(c));

  // Segurança: no máximo ~120 dias
  for (let guard = 0; guard < 500 && remaining > 0; guard++) {
    c = normalizeCursor(c, ctx);
    daysSeen.add(isoDate(c));
    const nowMin = c.getUTCHours() * 60 + c.getUTCMinutes();

    // Bloco corrente: até início do almoço OU até fim do expediente
    let blockEndMin: number;
    if (ctx.hasLunch && nowMin < ctx.lsMin) {
      blockEndMin = ctx.lsMin;
    } else {
      blockEndMin = ctx.weMin;
    }
    const available = blockEndMin - nowMin;
    if (available <= 0) {
      // Empurra pra próxima janela
      if (ctx.hasLunch && nowMin < ctx.leMin) {
        c = setTimeOfDay(c, ctx.lunchEnd.h, ctx.lunchEnd.m);
      } else {
        c.setUTCDate(c.getUTCDate() + 1);
        c = setTimeOfDay(c, ctx.workStart.h, ctx.workStart.m);
      }
      continue;
    }

    if (remaining <= available) {
      last = new Date(c);
      last.setUTCMinutes(last.getUTCMinutes() + remaining);
      remaining = 0;
      break;
    }

    // Consome bloco inteiro e avança
    remaining -= available;
    c = setTimeOfDay(c, Math.floor(blockEndMin / 60), blockEndMin % 60);
    if (ctx.hasLunch && blockEndMin === ctx.lsMin) {
      // Pula almoço
      c = setTimeOfDay(c, ctx.lunchEnd.h, ctx.lunchEnd.m);
    } else {
      // Fim de expediente → próximo dia útil
      c.setUTCDate(c.getUTCDate() + 1);
      c = setTimeOfDay(c, ctx.workStart.h, ctx.workStart.m);
    }
  }

  daysSeen.add(isoDate(last));
  return { start, end: last, daysSpanned: daysSeen.size };
}

// ------------------------------------------------------------------
// Duração base do card
// ------------------------------------------------------------------

/** Minutos entre due e delivery, considerando expediente (subtrai almoço se cruzar). */
function scheduledSpanMinutes(card: ReorderCardInput, ctx: WorkCtx): number | null {
  if (!card.due_date || !card.due_time || !card.delivery_date || !card.delivery_time) return null;
  const due = toVirtualUtc(card.due_date, card.due_time.slice(0, 5));
  const deliv = toVirtualUtc(card.delivery_date, card.delivery_time.slice(0, 5));
  if (!(deliv > due)) return null;
  const rawMin = Math.round((deliv.getTime() - due.getTime()) / 60000);
  // Aproximação: se cruzou dias, ignora fins de semana/feriados; para "Outros" o intervalo é curto.
  // Descontamos almoços atravessados.
  let lunchDeductions = 0;
  if (ctx.hasLunch) {
    const cur = new Date(due);
    cur.setUTCHours(0, 0, 0, 0);
    const endDay = new Date(deliv);
    endDay.setUTCHours(0, 0, 0, 0);
    while (cur <= endDay) {
      const lunchStart = setTimeOfDay(cur, ctx.lunchStart.h, ctx.lunchStart.m);
      const lunchEnd = setTimeOfDay(cur, ctx.lunchEnd.h, ctx.lunchEnd.m);
      if (lunchEnd > due && lunchStart < deliv) {
        lunchDeductions += ctx.leMin - ctx.lsMin;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return Math.max(5, rawMin - lunchDeductions);
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

  // "Outros": prioriza intervalo agendado no próprio card
  if (isOtherType(card)) {
    const span = scheduledSpanMinutes(card, ctx);
    if (span && span > 0) return Math.min(span, workingMinutesPerDay(ctx) * 5); // teto 5 jornadas
    const overridden = pickFromOverrides(overrides, stage, "outro");
    if (overridden !== null) return overridden;
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

function buildCtx(wh: WorkHoursConfig, holidays: Set<string>): WorkCtx {
  const workStart = parseHM(wh.start);
  const workEnd = parseHM(wh.end);
  const lunchStart = parseHM(wh.lunchStart);
  const lunchEnd = parseHM(wh.lunchEnd);
  const wsMin = workStart.h * 60 + workStart.m;
  const weMin = workEnd.h * 60 + workEnd.m;
  const lsMin = lunchStart.h * 60 + lunchStart.m;
  const leMin = lunchEnd.h * 60 + lunchEnd.m;
  const hasLunch = leMin > lsMin && lsMin > wsMin && leMin < weMin;
  return { wsMin, weMin, lsMin, leMin, hasLunch, workStart, workEnd, lunchStart, lunchEnd, holidays };
}

// ------------------------------------------------------------------
// Atraso
// ------------------------------------------------------------------

/** Minutos úteis (dentro do expediente) entre `from` e `to`. */
function workingMinutesBetween(from: Date, to: Date, ctx: WorkCtx): number {
  if (!(to > from)) return 0;
  let total = 0;
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(to);
  endDay.setUTCHours(0, 0, 0, 0);
  while (cur <= endDay) {
    if (!isNonWorkingDay(cur, ctx.holidays)) {
      const dayStart = setTimeOfDay(cur, ctx.workStart.h, ctx.workStart.m);
      const dayEnd = setTimeOfDay(cur, ctx.workEnd.h, ctx.workEnd.m);
      const segStart = from > dayStart ? from : dayStart;
      const segEnd = to < dayEnd ? to : dayEnd;
      if (segEnd > segStart) {
        let mins = Math.round((segEnd.getTime() - segStart.getTime()) / 60000);
        if (ctx.hasLunch) {
          const lStart = setTimeOfDay(cur, ctx.lunchStart.h, ctx.lunchStart.m);
          const lEnd = setTimeOfDay(cur, ctx.lunchEnd.h, ctx.lunchEnd.m);
          const overlapStart = segStart > lStart ? segStart : lStart;
          const overlapEnd = segEnd < lEnd ? segEnd : lEnd;
          if (overlapEnd > overlapStart) {
            mins -= Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60000);
          }
        }
        total += Math.max(0, mins);
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return total;
}

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

/** True se houver ≥ 1 card ativo (fora o em execução) com publish_date. */
export function hasPublishDateCandidates(cards: ReorderCardInput[]): boolean {
  const active = cards.filter((c) => (c.current_function_key || "").toLowerCase() !== "aguardando_cliente");
  if (active.length <= 1) return false;
  const byDue = [...active].sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
  const rest = byDue.slice(1);
  return rest.some((c) => !!c.publish_date);
}

export function sortForReorder(
  cards: ReorderCardInput[],
  opts?: { prioritizePublishDate?: boolean },
): ReorderCardInput[] {
  if (cards.length === 0) return [];
  const indexed = cards.map((c, i) => ({ c, i }));
  // Ordem atual da coluna: due_date/due_time asc (nulos ao fim), estável.
  const byDue = [...indexed].sort((a, b) => {
    const cmp = dueKey(a.c).localeCompare(dueKey(b.c));
    return cmp !== 0 ? cmp : a.i - b.i;
  });
  const inProgress = byDue[0];
  const rest = byDue.slice(1);

  if (opts?.prioritizePublishDate) {
    rest.sort((a, b) => {
      const cmp = pubKey(a.c).localeCompare(pubKey(b.c));
      if (cmp !== 0) return cmp;
      // Empate: preserva ordem atual da coluna (due asc).
      return dueKey(a.c).localeCompare(dueKey(b.c));
    });
  }
  // Modo padrão: rest já está na ordem da coluna (due asc).

  return [inProgress, ...rest].map((x) => x.c);
}

// ------------------------------------------------------------------
// Reorganização principal
// ------------------------------------------------------------------

export async function computeReorder(
  cards: ReorderCardInput[],
  opts?: { startFrom?: Date; workHours?: WorkHoursConfig; prioritizePublishDate?: boolean },
): Promise<ReorderProposal[]> {
  if (cards.length === 0) return [];

  const wh = { ...DEFAULT_WORK_HOURS, ...(opts?.workHours || {}) };

  const now = opts?.startFrom ? new Date(opts.startFrom) : spNowVirtualUtc(wh.tz);
  const rangeStart = isoDate(now);
  const rangeEndDate = new Date(now);
  rangeEndDate.setUTCDate(rangeEndDate.getUTCDate() + 180);
  let holidays: Set<string> = new Set();
  try {
    holidays = await fetchHolidaysInRange(rangeStart, isoDate(rangeEndDate));
  } catch {
    holidays = new Set();
  }

  const ctx = buildCtx(wh, holidays);

  const awaiting = cards.filter((c) => (c.current_function_key || "").toLowerCase() === "aguardando_cliente");
  const active = cards.filter((c) => (c.current_function_key || "").toLowerCase() !== "aguardando_cliente");
  const ordered = sortForReorder(active, { prioritizePublishDate: opts?.prioritizePublishDate });

  // Cursor inicial (arredondado a 5min)
  let cursor = normalizeCursor(new Date(now), ctx);
  const bump = cursor.getUTCMinutes() % 5;
  if (bump !== 0) cursor.setUTCMinutes(cursor.getUTCMinutes() + (5 - bump), 0, 0);

  const proposals: ReorderProposal[] = [];
  let isFirstActive = true;

  for (const card of ordered) {
    const baseDur = estimateDurationBase(card, ctx);
    let dur = baseDur;
    let slackApplied = false;
    let start: Date;
    let end: Date;
    let daysSpanned = 1;

    // Regra do "primeiro card em atraso": preserva start original + folga
    let treatAsStuck = false;
    if (isFirstActive) {
      const deadline = cardDeadline(card);
      if (deadline && deadline < now) treatAsStuck = true;
    }

    if (treatAsStuck && card.due_date && card.due_time) {
      const originalStart = toVirtualUtc(card.due_date, card.due_time.slice(0, 5));
      const delayMin = workingMinutesBetween(originalStart, now, ctx);
      const slack = Math.round(baseDur * 0.30);
      dur = baseDur + Math.max(0, delayMin) + slack;
      slackApplied = true;
      // Aloca a partir do start original preservado; se estava fora do expediente,
      // normalizeCursor cuidará dentro de allocateAcrossDays.
      ({ start, end, daysSpanned } = allocateAcrossDays(originalStart, dur, ctx));
      // Se end < now (não deveria com dur > delay), força cursor pós-now
      if (end < now) {
        ({ start, end, daysSpanned } = allocateAcrossDays(now, baseDur + slack, ctx));
      }
    } else {
      ({ start, end, daysSpanned } = allocateAcrossDays(cursor, dur, ctx));
    }

    // Avisos
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
      const extra = "Tempo extra aplicado (atraso + 30%).";
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
    });

    // Próximo cursor: 5min após o fim
    cursor = new Date(end);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 5);
    cursor = normalizeCursor(cursor, ctx);

    isFirstActive = false;
  }

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
      warning: "Aguardando cliente — não reagendado.",
    });
  }

  return proposals;
}
