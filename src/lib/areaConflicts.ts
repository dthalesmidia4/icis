import { supabase } from "@/integrations/supabase/client";
import { estimateDurationMinutes } from "@/lib/reorderSequence";

export type WorkArea = "midia" | "sistemas";

export const AREA_LABEL: Record<WorkArea, string> = {
  midia: "Mídia",
  sistemas: "Sistemas",
};

export interface AreaConflictInfo {
  id: string;
  title: string;
  work_area: WorkArea;
  delivery_time: string | null;
  time: string | null;
  hard: boolean;
}

/**
 * Retorna a primeira demanda do mesmo responsável em ÁREA DIFERENTE, no mesmo dia.
 * Retrocompatível — usado como "warn" leve.
 */
export async function checkAreaConflict(params: {
  tenantId: string;
  userId: string;
  area: WorkArea;
  date: string;
  time?: string | null;
  excludeDemandId?: string;
}): Promise<AreaConflictInfo | null> {
  const list = await findAreaConflicts(params);
  return list[0] || null;
}

/**
 * Retorna TODOS os conflitos entre áreas para o mesmo responsável no mesmo dia.
 * `hard = true` quando as janelas se sobrepõem (mesma hora exata ou overlap
 * calculado por duração estimada do card em conflito).
 */
export async function findAreaConflicts(params: {
  tenantId: string;
  userId: string;
  area: WorkArea;
  date: string;
  time?: string | null;
  durationMin?: number;
  excludeDemandId?: string;
}): Promise<AreaConflictInfo[]> {
  const { tenantId, userId, area, date, time, durationMin, excludeDemandId } = params;
  if (!tenantId || !userId || !date) return [];

  const { data, error } = await supabase
    .from("demands")
    .select(
      "id, title, work_area, delivery_time, delivery_date, publish_date, publish_time, due_date, due_time, demand_type, demand_type_key, current_function_key, is_daily_card",
    )
    .eq("tenant_id", tenantId)
    .eq("assigned_to", userId)
    .or(`delivery_date.eq.${date},publish_date.eq.${date}`);
  if (error || !data) return [];

  const normTime = (t?: string | null) => (t ? t.slice(0, 5) : null);
  const target = normTime(time);
  const targetMin = target ? parseMin(target) : null;
  const targetEndMin =
    targetMin !== null && typeof durationMin === "number"
      ? targetMin + Math.max(5, durationMin)
      : null;

  const out: AreaConflictInfo[] = [];
  for (const d of data as any[]) {
    if (excludeDemandId && d.id === excludeDemandId) continue;
    if (d.work_area === area) continue;

    const dTime =
      d.delivery_date === date ? normTime(d.delivery_time) : normTime(d.publish_time);
    const dStart = dTime ? parseMin(dTime) : null;
    // Duração do outro card
    const dDur = estimateDurationMinutes({
      id: d.id,
      title: d.title,
      demand_type: d.demand_type,
      demand_type_key: d.demand_type_key,
      is_daily_card: d.is_daily_card,
      current_function_key: d.current_function_key,
    });
    const dEnd = dStart !== null ? dStart + Math.max(5, dDur) : null;

    let hard = false;
    if (!target || !dTime) {
      // Sem horário no card avaliado ou no outro → dia inteiro do outro → conflito duro.
      hard = true;
    } else if (dStart !== null && targetMin !== null) {
      const aEnd = targetEndMin ?? targetMin + 5;
      const bEnd = dEnd ?? dStart + 5;
      hard = targetMin < bEnd && dStart < aEnd;
    }

    out.push({
      id: d.id,
      title: d.title,
      work_area: d.work_area,
      delivery_time: d.delivery_time,
      time: dTime,
      hard,
    });
  }
  // Hard primeiro
  out.sort((a, b) => (a.hard === b.hard ? 0 : a.hard ? -1 : 1));
  return out;
}

function parseMin(hm: string): number {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

export type ScheduleConflictReason =
  | "inside_other_area"
  | "crosses_other_area"
  | "outside_any_window";

export interface ScheduleAreaConflictResult {
  hard: boolean;
  reason: ScheduleConflictReason;
  offendingArea: WorkArea | null;
  offendingWindow: { start: string; end: string } | null;
  message: string;
}

/**
 * Verifica se a janela [startTime..endTime] de uma demanda (para um usuário,
 * numa data específica) respeita a configuração de `user_area_schedules`
 * daquele usuário. Retorna `null` quando o usuário não tem configuração
 * para o dia da semana (nenhuma opinião — mantém comportamento neutro).
 *
 * - Se a janela cai INTEIRA dentro de uma faixa configurada da MESMA área → null (ok).
 * - Se cai INTEIRA dentro de uma faixa configurada de OUTRA área → hard=true (bloqueio duro).
 * - Se CRUZA fronteira com outra área → hard=false (aviso soft).
 * - Se está fora de qualquer faixa configurada → hard=false (aviso soft).
 */
export async function findScheduleAreaConflict(params: {
  tenantId: string;
  userId: string;
  area: WorkArea;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}): Promise<ScheduleAreaConflictResult | null> {
  const { tenantId, userId, area, date, startTime, endTime } = params;
  if (!tenantId || !userId || !date) return null;

  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const weekday = new Date(y, m - 1, d).getDay(); // 0..6

  const { data, error } = await (supabase as any)
    .from("user_area_schedules")
    .select("work_area, start_time, end_time")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("weekday", weekday);
  if (error || !data || data.length === 0) return null;

  const norm = (t?: string | null) => (t ? t.slice(0, 5) : null);
  const s = norm(startTime);
  const e = norm(endTime) || s;
  if (!s) return null; // sem horário, não há como opinar sobre janela

  const sMin = parseMin(s);
  const eMin = e ? parseMin(e) : sMin + 5;
  const targetStart = Math.min(sMin, eMin);
  const targetEnd = Math.max(sMin, eMin, targetStart + 5);

  type Slot = { area: WorkArea; start: number; end: number; raw: { start: string; end: string } };
  const slots: Slot[] = (data as any[])
    .map((r) => {
      const st = norm(r.start_time);
      const en = norm(r.end_time);
      if (!st || !en) return null;
      return {
        area: r.work_area as WorkArea,
        start: parseMin(st),
        end: parseMin(en),
        raw: { start: st, end: en },
      } as Slot;
    })
    .filter(Boolean) as Slot[];

  if (slots.length === 0) return null;

  const overlapsWith = (slot: Slot) => targetStart < slot.end && slot.start < targetEnd;
  const fullyInside = (slot: Slot) => targetStart >= slot.start && targetEnd <= slot.end;

  const overlappingOther = slots.filter((sl) => sl.area !== area && overlapsWith(sl));
  const overlappingSame = slots.filter((sl) => sl.area === area && overlapsWith(sl));

  // Fully inside a slot of another area → hard block
  const insideOther = slots.find((sl) => sl.area !== area && fullyInside(sl));
  if (insideOther) {
    return {
      hard: true,
      reason: "inside_other_area",
      offendingArea: insideOther.area,
      offendingWindow: insideOther.raw,
      message: `Este horário está dentro da janela configurada de ${AREA_LABEL[insideOther.area]} para este responsável (${insideOther.raw.start}–${insideOther.raw.end}).`,
    };
  }

  // Fully inside a slot of same area → OK
  if (slots.some((sl) => sl.area === area && fullyInside(sl))) return null;

  // Crosses into other area's slot → soft warn
  if (overlappingOther.length > 0) {
    const off = overlappingOther[0];
    return {
      hard: false,
      reason: "crosses_other_area",
      offendingArea: off.area,
      offendingWindow: off.raw,
      message: `Este horário cruza a janela configurada de ${AREA_LABEL[off.area]} para este responsável (${off.raw.start}–${off.raw.end}).`,
    };
  }

  // No overlap with any slot → outside any configured window
  if (overlappingSame.length === 0) {
    return {
      hard: false,
      reason: "outside_any_window",
      offendingArea: null,
      offendingWindow: null,
      message: `Este horário está fora das janelas de trabalho configuradas para este responsável.`,
    };
  }

  return null;
}
