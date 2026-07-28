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
