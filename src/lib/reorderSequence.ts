/**
 * Reordena a sequência de produção de um colaborador.
 * Estima duração por (tipo de demanda × etapa do fluxo), respeita janela
 * de expediente e intervalo configurados na agência, pula finais de
 * semana/feriados e usa fuso America/Sao_Paulo por padrão.
 */
import { fetchHolidaysInRange } from "@/lib/dailyCards";

export interface WorkHoursConfig {
  start: string; // "09:00"
  end: string; // "18:00"
  lunchStart: string; // "12:00"
  lunchEnd: string; // "13:30"
  tz: string; // "America/Sao_Paulo"
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
  startISO: string; // YYYY-MM-DD (BRT wallclock)
  startTime: string; // HH:mm
  endISO: string;
  endTime: string;
  publishDeadline?: string | null;
  warning?: string;
  changed: boolean;
  skipped?: boolean; // aguardando_cliente
}

// ------------------------------------------------------------------
// Matriz duração (minutos) por [function_key][typeGroup]
// ------------------------------------------------------------------

export type DurationTypeGroup =
  | "estatico"
  | "carrossel"
  | "video_curto"
  | "video_longo"
  | "default";

export const DURATION_MATRIX: Record<string, Record<DurationTypeGroup, number>> = {
  avaliar:            { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, default:  5 },
  planejar:           { estatico: 10, carrossel: 15, video_curto: 15, video_longo: 20, default: 10 },
  criar_roteiro:      { estatico: 10, carrossel: 20, video_curto: 25, video_longo: 40, default: 15 },
  criar_arte:         { estatico: 20, carrossel: 40, video_curto: 20, video_longo: 20, default: 20 },
  captar:             { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 120, default: 30 },
  gerar_video:        { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 90,  default: 30 },
  editar_video:       { estatico: 20, carrossel: 20, video_curto: 60, video_longo: 120, default: 30 },
  revisar:            { estatico:  5, carrossel: 10, video_curto: 15, video_longo: 20, default: 10 },
  enviar_cliente:     { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, default:  5 },
  publicar:           { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, default:  5 },
  revisar_publicacao: { estatico:  5, carrossel:  5, video_curto:  5, video_longo:  5, default:  5 },
};

const FALLBACK_STAGE_DURATION: Record<DurationTypeGroup, number> = {
  estatico: 20,
  carrossel: 40,
  video_curto: 120,
  video_longo: 180,
  default: 30,
};

function typeGroup(card: ReorderCardInput): DurationTypeGroup {
  const key = (card.demand_type_key || "").toLowerCase();
  if (key === "criativo_estatico") return "estatico";
  if (key === "carrossel") return "carrossel";
  if (key === "video_gerado" || key === "video_curto") return "video_curto";
  if (key === "video_longo") return "video_longo";
  const t = (card.demand_type || "").toLowerCase();
  if (t.includes("carross")) return "carrossel";
  if (t.includes("longo")) return "video_longo";
  if (t.includes("vídeo") || t.includes("video") || t.includes("reels") || t.includes("short")) return "video_curto";
  if (t.includes("estát") || t.includes("estat") || t.includes("post")) return "estatico";
  return "default";
}

export function estimateDurationMinutes(card: ReorderCardInput): number {
  if (card.is_daily_card) return 20;
  const stage = (card.current_function_key || "").toLowerCase();
  const group = typeGroup(card);
  const stageRow = DURATION_MATRIX[stage];
  if (stageRow) return stageRow[group] ?? stageRow.default;
  return FALLBACK_STAGE_DURATION[group];
}

// ------------------------------------------------------------------
// Utilitários de wallclock BRT (representa horário de SP como "UTC virtual").
// Isso evita depender do fuso do navegador. Nunca convertemos essas Dates
// de volta por métodos locais — sempre com getUTC*.
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
  const y = +parts.year;
  const m = +parts.month;
  const d = +parts.day;
  let h = +parts.hour;
  if (h === 24) h = 0;
  const mm = +parts.minute;
  return new Date(Date.UTC(y, m - 1, d, h, mm));
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

function advanceToNextValidDay(d: Date, holidays: Set<string>, workStart: { h: number; m: number }): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(workStart.h, workStart.m, 0, 0);
  while (isWeekend(next) || holidays.has(isoDate(next))) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function ensureWorkingCursor(
  d: Date,
  holidays: Set<string>,
  workStart: { h: number; m: number },
  workEnd: { h: number; m: number },
): Date {
  let c = new Date(d);
  // Se antes do início, saltar para início.
  const startToday = setTimeOfDay(c, workStart.h, workStart.m);
  if (c < startToday) c = startToday;
  // Se depois do fim, próximo dia útil.
  const endToday = setTimeOfDay(c, workEnd.h, workEnd.m);
  if (c >= endToday) c = advanceToNextValidDay(c, holidays, workStart);
  while (isWeekend(c) || holidays.has(isoDate(c))) {
    c.setUTCDate(c.getUTCDate() + 1);
    c.setUTCHours(workStart.h, workStart.m, 0, 0);
  }
  return c;
}

/**
 * Ordena cards: com publish_date crescente primeiro, depois preserva a ordem
 * atual (que reflete a preferência do usuário) para os sem data de publicação.
 */
export function sortForReorder(cards: ReorderCardInput[]): ReorderCardInput[] {
  const withDate = cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !!c.publish_date);
  const withoutDate = cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.publish_date);

  withDate.sort((a, b) => {
    const da = `${a.c.publish_date}T${a.c.publish_time || "23:59"}`;
    const db = `${b.c.publish_date}T${b.c.publish_time || "23:59"}`;
    if (da === db) return a.i - b.i;
    return da.localeCompare(db);
  });

  return [...withDate.map((x) => x.c), ...withoutDate.map((x) => x.c)];
}

export async function computeReorder(
  cards: ReorderCardInput[],
  opts?: { startFrom?: Date; workHours?: WorkHoursConfig },
): Promise<ReorderProposal[]> {
  if (cards.length === 0) return [];

  const wh = { ...DEFAULT_WORK_HOURS, ...(opts?.workHours || {}) };
  const workStart = parseHM(wh.start);
  const workEnd = parseHM(wh.end);
  const lunchStart = parseHM(wh.lunchStart);
  const lunchEnd = parseHM(wh.lunchEnd);

  const wsMin = workStart.h * 60 + workStart.m;
  const weMin = workEnd.h * 60 + workEnd.m;
  const lsMin = lunchStart.h * 60 + lunchEnd.m > 0 ? lunchStart.h * 60 + lunchStart.m : 0;
  const leMin = lunchEnd.h * 60 + lunchEnd.m;
  const hasLunch = leMin > lsMin && lsMin > 0;

  // Feriados (BRT) para os próximos 120 dias
  const now = opts?.startFrom ? new Date(opts.startFrom) : spNowVirtualUtc(wh.tz);
  const rangeStart = isoDate(now);
  const rangeEndDate = new Date(now);
  rangeEndDate.setUTCDate(rangeEndDate.getUTCDate() + 120);
  let holidays: Set<string> = new Set();
  try {
    holidays = await fetchHolidaysInRange(rangeStart, isoDate(rangeEndDate));
  } catch {
    holidays = new Set();
  }

  // Separar aguardando_cliente — não reagendamos, mas devolvemos flag.
  const awaiting = cards.filter((c) => (c.current_function_key || "").toLowerCase() === "aguardando_cliente");
  const active = cards.filter((c) => (c.current_function_key || "").toLowerCase() !== "aguardando_cliente");

  const ordered = sortForReorder(active);

  // Cursor inicial
  let cursor = new Date(now);
  cursor = ensureWorkingCursor(cursor, holidays, workStart, workEnd);
  // arredonda para múltiplo de 5min
  const bump = cursor.getUTCMinutes() % 5;
  if (bump !== 0) cursor.setUTCMinutes(cursor.getUTCMinutes() + (5 - bump), 0, 0);

  const proposals: ReorderProposal[] = [];

  for (const card of ordered) {
    const dur = estimateDurationMinutes(card);
    let start = new Date(cursor);
    // Ajustar para janela de trabalho
    start = ensureWorkingCursor(start, holidays, workStart, workEnd);

    // Intervalo de almoço: se start dentro, empurra pro fim do almoço.
    if (hasLunch) {
      const startMinOfDay = start.getUTCHours() * 60 + start.getUTCMinutes();
      if (startMinOfDay >= lsMin && startMinOfDay < leMin) {
        start = setTimeOfDay(start, lunchEnd.h, lunchEnd.m);
      }
    }

    // Se a duração ultrapassa o fim do dia, próximo dia útil
    let end = new Date(start);
    end.setUTCMinutes(end.getUTCMinutes() + dur);
    const endMinOfDay = end.getUTCHours() * 60 + end.getUTCMinutes();
    const startMinOfDay = start.getUTCHours() * 60 + start.getUTCMinutes();

    // Cruza almoço?
    if (hasLunch && startMinOfDay < lsMin && endMinOfDay > lsMin) {
      // empurra pra depois do almoço e recalcula
      start = setTimeOfDay(start, lunchEnd.h, lunchEnd.m);
      end = new Date(start);
      end.setUTCMinutes(end.getUTCMinutes() + dur);
    }

    // Ultrapassa fim do expediente?
    const endMinOfDay2 = end.getUTCHours() * 60 + end.getUTCMinutes();
    if (endMinOfDay2 > weMin || (end.getUTCDate() !== start.getUTCDate())) {
      // Não cabe hoje — vai pro próximo dia útil
      start = advanceToNextValidDay(start, holidays, workStart);
      // recheca almoço no novo dia
      const s2 = start.getUTCHours() * 60 + start.getUTCMinutes();
      if (hasLunch && s2 >= lsMin && s2 < leMin) {
        start = setTimeOfDay(start, lunchEnd.h, lunchEnd.m);
      }
      end = new Date(start);
      end.setUTCMinutes(end.getUTCMinutes() + dur);
      if (hasLunch) {
        const s3 = start.getUTCHours() * 60 + start.getUTCMinutes();
        const e3 = end.getUTCHours() * 60 + end.getUTCMinutes();
        if (s3 < lsMin && e3 > lsMin) {
          start = setTimeOfDay(start, lunchEnd.h, lunchEnd.m);
          end = new Date(start);
          end.setUTCMinutes(end.getUTCMinutes() + dur);
        }
      }
    }

    let warning: string | undefined;
    let publishDeadline: string | null = null;
    if (card.publish_date) {
      const pt = (card.publish_time || "18:00").slice(0, 5);
      publishDeadline = `${card.publish_date}T${pt}`;
      const deadline = toVirtualUtc(card.publish_date, pt);
      deadline.setUTCHours(deadline.getUTCHours() - 1); // reserva de 1h
      if (end > deadline) {
        warning = "Termina após o prazo de publicação recomendado.";
      }
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
    });

    cursor = new Date(end);
    // gap 5min
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 5);
  }

  // Anexa awaiting como skipped no final para transparência
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
