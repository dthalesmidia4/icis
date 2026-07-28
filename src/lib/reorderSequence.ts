/**
 * Reordena a sequência de produção de um colaborador.
 * Estima duração por tipo, respeita janela 09:00–18:00, pula finais de
 * semana/feriados e nunca ultrapassa a data de publicação de cada card.
 */
import { fetchHolidaysInRange } from "@/lib/dailyCards";

export interface ReorderCardInput {
  id: string;
  title: string;
  demand_type?: string | null;
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
  startISO: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endISO: string;
  endTime: string;
  publishDeadline?: string | null;
  warning?: string;
  changed: boolean;
}

const DURATION_STATIC = 20;
const DURATION_CAROUSEL = 40;
const DURATION_SHORT_VIDEO = 120;
const DURATION_LONG_VIDEO = 180;
const DURATION_DEFAULT = 30;

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

export function estimateDurationMinutes(card: ReorderCardInput): number {
  if (card.is_daily_card) return DURATION_STATIC;
  const t = (card.demand_type || "").toLowerCase();
  if (t.includes("carross")) return DURATION_CAROUSEL;
  if (t.includes("estát") || t.includes("estat")) return DURATION_STATIC;
  if (t.includes("longo")) return DURATION_LONG_VIDEO;
  if (t.includes("vídeo") || t.includes("video") || t.includes("reels") || t.includes("short")) {
    return DURATION_SHORT_VIDEO;
  }
  if (t.includes("post")) return DURATION_STATIC;
  return DURATION_DEFAULT;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}
function advanceToNextValidDay(d: Date, holidays: Set<string>): Date {
  const next = new Date(d);
  next.setHours(WORK_START_HOUR, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  while (isWeekend(next) || holidays.has(isoDate(next))) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}
function ensureWorkingCursor(d: Date, holidays: Set<string>): Date {
  let c = new Date(d);
  if (c.getHours() < WORK_START_HOUR) c.setHours(WORK_START_HOUR, 0, 0, 0);
  while (isWeekend(c) || holidays.has(isoDate(c))) {
    c.setDate(c.getDate() + 1);
    c.setHours(WORK_START_HOUR, 0, 0, 0);
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
  opts?: { startFrom?: Date }
): Promise<ReorderProposal[]> {
  if (cards.length === 0) return [];

  // Buscar feriados no range plausível (hoje até +90d)
  const now = opts?.startFrom ? new Date(opts.startFrom) : new Date();
  const rangeStart = isoDate(now);
  const rangeEndDate = new Date(now);
  rangeEndDate.setDate(rangeEndDate.getDate() + 120);
  let holidays: Set<string> = new Set();
  try {
    holidays = await fetchHolidaysInRange(rangeStart, isoDate(rangeEndDate));
  } catch {
    holidays = new Set();
  }

  const ordered = sortForReorder(cards);

  // Cursor inicia no próximo horário útil disponível a partir de agora.
  let cursor = new Date(now);
  if (cursor.getHours() >= WORK_END_HOUR - 1) {
    cursor = advanceToNextValidDay(cursor, holidays);
  } else {
    cursor = ensureWorkingCursor(cursor, holidays);
  }
  // Arredondar para múltiplo de 5 minutos para ficar organizado
  const rounded = new Date(cursor);
  const mins = rounded.getMinutes();
  const bump = mins % 5 === 0 ? 0 : 5 - (mins % 5);
  rounded.setMinutes(mins + bump, 0, 0);
  cursor = rounded;

  const proposals: ReorderProposal[] = [];

  for (const card of ordered) {
    const dur = estimateDurationMinutes(card);
    // Se não cabe no dia, avança para o próximo dia útil
    const endToday = new Date(cursor);
    endToday.setMinutes(endToday.getMinutes() + dur);
    if (endToday.getHours() >= WORK_END_HOUR || (endToday.getHours() === WORK_END_HOUR && endToday.getMinutes() > 0)) {
      cursor = advanceToNextValidDay(cursor, holidays);
    }
    const start = new Date(cursor);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + dur);

    let warning: string | undefined;
    let publishDeadline: string | null = null;
    if (card.publish_date) {
      const pt = card.publish_time || "18:00";
      const deadlineIso = `${card.publish_date}T${pt.length === 5 ? pt : pt.slice(0, 5)}:00`;
      publishDeadline = deadlineIso;
      const deadline = new Date(deadlineIso);
      // reserva de 1h antes da publicação
      deadline.setHours(deadline.getHours() - 1);
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
    // gap de 5min entre cards
    cursor.setMinutes(cursor.getMinutes() + 5);
  }

  return proposals;
}
