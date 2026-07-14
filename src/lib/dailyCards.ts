import { supabase } from "@/integrations/supabase/client";

/**
 * Utilitários de Card Diário (demandas recorrentes).
 * Regras aplicadas SOMENTE quando demand.is_daily_card === true.
 * Cards normais nunca são afetados.
 */

export interface DailyCardConfig {
  is_daily_card: boolean;
  daily_start_date: string | null;      // YYYY-MM-DD
  daily_end_date: string | null;        // YYYY-MM-DD
  daily_time: string | null;            // HH:MM
  daily_exclude_weekends: boolean;
  daily_exclude_holidays: boolean;
  daily_next_date: string | null;
  daily_completed_dates: string[];
  daily_completed_occurrences: number;
  daily_total_occurrences: number | null;
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Busca feriados brasileiros no intervalo. */
export async function fetchHolidaysInRange(start: string, end: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("br_calendar_events")
    .select("event_date, event_type")
    .eq("event_type", "holiday")
    .gte("event_date", start)
    .lte("event_date", end);
  return new Set((data || []).map((r: any) => r.event_date as string));
}

/** Gera todas as datas válidas do período respeitando as regras. */
export function computeValidDays(
  start: string,
  end: string,
  excludeWeekends: boolean,
  excludeHolidays: boolean,
  holidays: Set<string>,
): string[] {
  const out: string[] = [];
  const s = parseISODate(start);
  const e = parseISODate(end);
  const cur = new Date(s);
  while (cur <= e) {
    const iso = toDateOnly(cur);
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidays.has(iso);
    const skip = (excludeWeekends && isWeekend) || (excludeHolidays && isHoliday);
    if (!skip) out.push(iso);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Próxima data válida > `after` dentro do período. */
export function nextValidDate(
  after: string,
  end: string,
  excludeWeekends: boolean,
  excludeHolidays: boolean,
  holidays: Set<string>,
): string | null {
  const a = parseISODate(after);
  a.setDate(a.getDate() + 1);
  const e = parseISODate(end);
  while (a <= e) {
    const iso = toDateOnly(a);
    const dow = a.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidays.has(iso);
    const skip = (excludeWeekends && isWeekend) || (excludeHolidays && isHoliday);
    if (!skip) return iso;
    a.setDate(a.getDate() + 1);
  }
  return null;
}

/**
 * Deve o card diário aparecer AGORA no Kanban?
 * Aparece quando: hoje >= daily_next_date. O horário não esconde o card
 * (apenas indica quando é para ser feito).
 */
export function isDailyCardVisibleNow(card: {
  is_daily_card?: boolean | null;
  daily_next_date?: string | null;
  daily_time?: string | null;
}): boolean {
  if (!card?.is_daily_card) return true;
  if (!card.daily_next_date) return true;
  const now = new Date();
  const today = toDateOnly(now);
  if (card.daily_next_date > today) return false;
  if (card.daily_next_date < today) return true;
  // Mesma data — respeitar horário
  if (!card.daily_time) return true;
  const [hh, mm] = card.daily_time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hh || 0, mm || 0, 0, 0);
  return now >= scheduled;
}

/**
 * Entrega uma ocorrência de card diário (opção B: mantém colaborador e função).
 * Retorna:
 *  - { finished: true } quando era a última ocorrência (caller deve chamar deliverDemand normal)
 *  - { finished: false, nextDate } quando há próximas
 */
export async function completeDailyOccurrence(demandId: string): Promise<
  | { success: false; message: string }
  | { success: true; finished: true }
  | { success: true; finished: false; nextDate: string }
> {
  const { data: d, error } = await supabase
    .from("demands")
    .select(
      "id, is_daily_card, daily_start_date, daily_end_date, daily_time, daily_exclude_weekends, daily_exclude_holidays, daily_next_date, daily_completed_dates, daily_completed_occurrences, daily_total_occurrences",
    )
    .eq("id", demandId)
    .maybeSingle();
  if (error || !d) return { success: false, message: "Card não encontrado." };
  if (!(d as any).is_daily_card) return { success: true, finished: true };

  const today = toDateOnly(new Date());
  const currentOccurrence: string = (d as any).daily_next_date || today;
  const completed: string[] = Array.isArray((d as any).daily_completed_dates)
    ? ((d as any).daily_completed_dates as string[])
    : [];
  const newCompleted = completed.includes(currentOccurrence)
    ? completed
    : [...completed, currentOccurrence];

  const end = (d as any).daily_end_date as string | null;
  const excludeW = !!(d as any).daily_exclude_weekends;
  const excludeH = !!(d as any).daily_exclude_holidays;

  let holidays = new Set<string>();
  if (excludeH && end) {
    holidays = await fetchHolidaysInRange(currentOccurrence, end);
  }

  const next = end
    ? nextValidDate(currentOccurrence, end, excludeW, excludeH, holidays)
    : null;

  const newCount = ((d as any).daily_completed_occurrences || 0) + 1;

  if (!next) {
    // Última ocorrência — atualiza contadores e sinaliza para caller finalizar de vez
    await supabase
      .from("demands")
      .update({
        daily_completed_dates: newCompleted as any,
        daily_completed_occurrences: newCount,
      } as any)
      .eq("id", demandId);
    return { success: true, finished: true };
  }

  await supabase
    .from("demands")
    .update({
      daily_completed_dates: newCompleted as any,
      daily_completed_occurrences: newCount,
      daily_next_date: next,
    } as any)
    .eq("id", demandId);

  return { success: true, finished: false, nextDate: next };
}

export function formatBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
