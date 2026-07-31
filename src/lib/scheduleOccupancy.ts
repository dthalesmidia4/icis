/**
 * Motor único de OCUPAÇÃO DE AGENDA por responsável.
 *
 * Responde a uma pergunta só: "colocar este card com este responsável nesta
 * janela gera choque com o que ele já tem?" — independentemente da área
 * (Mídia × Sistemas ou dentro da mesma área).
 *
 * Regras:
 * - Janela do card = [due_date+due_time .. delivery_date+delivery_time].
 *   Faltando o término, deriva pela duração estimada da etapa/tipo.
 *   Faltando data de produção, cai para publish_date/publish_time.
 * - Card sem horário ocupa o dia inteiro (conflito duro com qualquer janela do dia).
 * - Etapas que não consomem tempo operacional (aguardando/enviar/entregar cliente,
 *   feedback) NÃO ocupam agenda e não sofrem conflito.
 * - Cards arquivados e rascunhos ficam fora.
 */
import { supabase } from "@/integrations/supabase/client";
import { estimateDurationMinutes } from "@/lib/reorderSequence";
import { isClientFacingFunction } from "@/lib/flowFunctions";
import { findScheduleAreaConflict, AREA_LABEL, type WorkArea } from "@/lib/areaConflicts";

export type { WorkArea };
export { AREA_LABEL };

export interface OccupancyCardInput {
  id: string;
  title?: string | null;
  tenant_id?: string | null;
  work_area?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  publish_date?: string | null;
  publish_time?: string | null;
  demand_type?: string | null;
  demand_type_key?: string | null;
  is_daily_card?: boolean | null;
  current_function_key?: string | null;
}

export interface BusyInterval {
  id: string;
  title: string;
  area: WorkArea;
  /** ms locais */
  start: number;
  end: number;
  allDay: boolean;
  date: string;
  startTime: string | null;
  endTime: string | null;
}

export interface AssignmentConflict extends BusyInterval {
  hard: boolean;
  reason: "overlap" | "all_day" | "area_window";
  message: string;
}

export interface AssignmentConflictResult {
  hard: AssignmentConflict[];
  soft: AssignmentConflict[];
  /** Mensagem soft/hard vinda de `user_area_schedules`. */
  scheduleMessage: string | null;
  scheduleHard: boolean;
  /** Janela avaliada do card (null quando não há data para avaliar). */
  window: { date: string; start: number; end: number; allDay: boolean } | null;
}

const norm = (t?: string | null) => (t ? t.slice(0, 5) : null);

const areaOf = (v?: string | null): WorkArea => (v === "sistemas" ? "sistemas" : "midia");

function toMs(date: string, time?: string | null): number | null {
  const [y, m, d] = date.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const hm = norm(time);
  const [h, mi] = hm ? hm.split(":").map((x) => parseInt(x, 10) || 0) : [0, 0];
  const ts = new Date(y, m - 1, d, h || 0, mi || 0, 0, 0).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function endOfDayMs(date: string): number {
  const [y, m, d] = date.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function isUntimedStage(key?: string | null): boolean {
  if (!key) return false;
  return isClientFacingFunction(key);
}

function durationMinutesOf(card: OccupancyCardInput): number {
  try {
    const min = estimateDurationMinutes({
      id: card.id,
      title: card.title || "",
      demand_type: card.demand_type ?? null,
      demand_type_key: card.demand_type_key ?? null,
      is_daily_card: !!card.is_daily_card,
      current_function_key: card.current_function_key ?? null,
      work_area: areaOf(card.work_area),
    } as any);
    return Math.max(5, min || 15);
  } catch {
    return 15;
  }
}

/**
 * Janela ocupada por um card. Retorna null quando o card não ocupa agenda
 * (etapa sem prazo, sem nenhuma data utilizável).
 */
export function cardWindow(card: OccupancyCardInput): BusyInterval | null {
  if (isUntimedStage(card.current_function_key)) return null;

  const startDate = card.due_date || card.publish_date || null;
  if (!startDate) return null;
  const startTime = card.due_date ? norm(card.due_time) : norm(card.publish_time);

  const allDay = !startTime;
  const start = toMs(startDate, startTime || "00:00");
  if (start === null) return null;

  let end: number | null = null;
  let endTime: string | null = null;
  if (!allDay) {
    if (card.delivery_date) {
      endTime = norm(card.delivery_time);
      end = toMs(card.delivery_date, endTime || startTime!);
    }
    if (end === null || end <= start) {
      end = start + durationMinutesOf(card) * 60_000;
      const d = new Date(end);
      endTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  } else {
    end = endOfDayMs(startDate);
  }

  return {
    id: card.id,
    title: card.title || "Sem título",
    area: areaOf(card.work_area),
    start,
    end: end as number,
    allDay,
    date: startDate,
    startTime,
    endTime,
  };
}

/** Todas as janelas ocupadas de um responsável que toquem o intervalo pedido. */
export async function getBusyIntervals(params: {
  tenantId: string;
  userId: string;
  fromDate: string;
  toDate: string;
  excludeDemandId?: string;
}): Promise<BusyInterval[]> {
  const { tenantId, userId, fromDate, toDate, excludeDemandId } = params;
  if (!tenantId || !userId) return [];

  const pad = (n: number) => String(n).padStart(2, "0");
  const shift = (date: string, days: number) => {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  // Margem para pegar cards que começam antes e terminam dentro da janela.
  const lo = shift(fromDate, -30);
  const hi = shift(toDate, 30);

  const { data, error } = await supabase
    .from("demands")
    .select(
      "id, title, work_area, due_date, due_time, delivery_date, delivery_time, publish_date, publish_time, demand_type, demand_type_key, is_daily_card, current_function_key, assigned_to, additional_assignees, archived_at, is_draft",
    )
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .or(`due_date.gte.${lo},publish_date.gte.${lo}`)
    .or(`due_date.lte.${hi},publish_date.lte.${hi}`);

  if (error || !data) return [];

  const winStart = toMs(fromDate, "00:00") ?? 0;
  const winEnd = endOfDayMs(toDate);

  const out: BusyInterval[] = [];
  for (const row of data as any[]) {
    if (excludeDemandId && row.id === excludeDemandId) continue;
    if (row.is_draft) continue;
    const owners = new Set<string>([
      ...(row.assigned_to ? [row.assigned_to] : []),
      ...(Array.isArray(row.additional_assignees) ? row.additional_assignees : []),
    ]);
    if (!owners.has(userId)) continue;
    const w = cardWindow(row as OccupancyCardInput);
    if (!w) continue;
    if (w.end <= winStart || w.start >= winEnd) continue;
    out.push(w);
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Verifica se atribuir `card` a `userId` (na etapa/área alvo) choca com a
 * agenda existente do responsável.
 */
export async function checkAssignmentConflicts(params: {
  tenantId: string;
  userId: string;
  card: OccupancyCardInput;
  targetStage?: string | null;
  area?: WorkArea | null;
}): Promise<AssignmentConflictResult> {
  const empty: AssignmentConflictResult = {
    hard: [],
    soft: [],
    scheduleMessage: null,
    scheduleHard: false,
    window: null,
  };
  const { tenantId, userId } = params;
  if (!tenantId || !userId) return empty;

  const stage = params.targetStage ?? params.card.current_function_key ?? null;
  const area = params.area ?? areaOf(params.card.work_area);

  // Etapa sem prazo não ocupa agenda → não há conflito possível.
  if (isUntimedStage(stage)) return empty;

  const probe: OccupancyCardInput = { ...params.card, current_function_key: stage, work_area: area };
  const w = cardWindow(probe);
  if (!w) return empty;

  const busy = await getBusyIntervals({
    tenantId,
    userId,
    fromDate: w.date,
    toDate: params.card.delivery_date || w.date,
    excludeDemandId: params.card.id,
  });

  const hard: AssignmentConflict[] = [];
  const soft: AssignmentConflict[] = [];

  for (const b of busy) {
    const overlaps = w.start < b.end && b.start < w.end;
    if (!overlaps) continue;
    const sameArea = b.area === area;
    const label = sameArea ? "" : ` (${AREA_LABEL[b.area]})`;
    if (b.allDay || w.allDay) {
      hard.push({
        ...b,
        hard: true,
        reason: "all_day",
        message: `"${b.title}"${label} ocupa o dia inteiro deste responsável (sem horário definido).`,
      });
    } else {
      hard.push({
        ...b,
        hard: true,
        reason: "overlap",
        message: `"${b.title}"${label} já ocupa ${b.startTime}–${b.endTime} deste responsável.`,
      });
    }
  }

  // Janelas de área configuradas (user_area_schedules).
  let scheduleMessage: string | null = null;
  let scheduleHard = false;
  try {
    const sc = await findScheduleAreaConflict({
      tenantId,
      userId,
      area,
      date: w.date,
      startTime: w.startTime,
      endTime: w.endTime ?? w.startTime,
    });
    if (sc) {
      scheduleMessage = sc.message;
      scheduleHard = sc.hard;
      if (sc.hard) {
        hard.push({
          id: `area-window-${userId}`,
          title: `Janela de ${sc.offendingArea ? AREA_LABEL[sc.offendingArea] : "outra área"}`,
          area: (sc.offendingArea || area) as WorkArea,
          start: w.start,
          end: w.end,
          allDay: false,
          date: w.date,
          startTime: sc.offendingWindow?.start ?? null,
          endTime: sc.offendingWindow?.end ?? null,
          hard: true,
          reason: "area_window",
          message: sc.message,
        });
      }
    }
  } catch {
    /* silencioso */
  }

  return {
    hard,
    soft,
    scheduleMessage,
    scheduleHard,
    window: { date: w.date, start: w.start, end: w.end, allDay: w.allDay },
  };
}

export interface FreeSlotSuggestion {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Primeiro slot livre do responsável, a partir da data/hora atual do card,
 * respeitando expediente simples (09:00–18:00, almoço 12:00–13:30) e pulando
 * fins de semana. Procura até 14 dias à frente.
 */
export async function suggestFreeSlot(params: {
  tenantId: string;
  userId: string;
  card: OccupancyCardInput;
  targetStage?: string | null;
  area?: WorkArea | null;
  workHours?: { start: string; end: string; lunchStart: string; lunchEnd: string };
}): Promise<FreeSlotSuggestion | null> {
  const wh = params.workHours || {
    start: "09:00",
    end: "18:00",
    lunchStart: "12:00",
    lunchEnd: "13:30",
  };
  const stage = params.targetStage ?? params.card.current_function_key ?? null;
  if (isUntimedStage(stage)) return null;
  const area = params.area ?? areaOf(params.card.work_area);
  const probe: OccupancyCardInput = { ...params.card, current_function_key: stage, work_area: area };
  const dur = durationMinutesOf(probe);

  const pad = (n: number) => String(n).padStart(2, "0");
  const toMin = (hm: string) => {
    const [h, m] = hm.split(":").map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };
  const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  const baseDate = params.card.due_date || params.card.publish_date;
  if (!baseDate) return null;
  const [by, bm, bd] = baseDate.split("-").map(Number);
  const cursor = new Date(by, (bm || 1) - 1, bd || 1);

  const dayStart = toMin(wh.start);
  const dayEnd = toMin(wh.end);
  const lunchS = toMin(wh.lunchStart);
  const lunchE = toMin(wh.lunchEnd);

  for (let i = 0; i < 14; i++) {
    const dateStr = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const busy = await getBusyIntervals({
        tenantId: params.tenantId,
        userId: params.userId,
        fromDate: dateStr,
        toDate: dateStr,
        excludeDemandId: params.card.id,
      });
      const dayZero = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()).getTime();
      const blocks = busy.map((b) => ({
        s: Math.max(0, Math.round((b.start - dayZero) / 60_000)),
        e: Math.min(24 * 60, Math.round((b.end - dayZero) / 60_000)),
      }));
      blocks.push({ s: lunchS, e: lunchE });
      blocks.sort((a, b) => a.s - b.s);

      let candidate = i === 0 && params.card.due_time ? Math.max(dayStart, toMin(params.card.due_time.slice(0, 5))) : dayStart;
      let guard = 0;
      while (candidate + dur <= dayEnd && guard++ < 300) {
        const clash = blocks.find((b) => candidate < b.e && b.s < candidate + dur);
        if (!clash) {
          return { date: dateStr, startTime: fromMin(candidate), endTime: fromMin(candidate + dur) };
        }
        candidate = clash.e;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}
