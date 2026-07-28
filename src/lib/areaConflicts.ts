import { supabase } from "@/integrations/supabase/client";

export type WorkArea = "midia" | "sistemas";

export const AREA_LABEL: Record<WorkArea, string> = {
  midia: "Mídia",
  sistemas: "Sistemas",
};

/**
 * Verifica se, no mesmo instante (data + hora de entrega/publicação),
 * o responsável já tem outra demanda de área diferente.
 * Retorna a demanda em conflito (se houver) ou null.
 */
export async function checkAreaConflict(params: {
  tenantId: string;
  userId: string;
  area: WorkArea;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM
  excludeDemandId?: string;
}): Promise<{ id: string; title: string; work_area: WorkArea; delivery_time: string | null } | null> {
  const { tenantId, userId, area, date, time, excludeDemandId } = params;
  if (!tenantId || !userId || !date) return null;

  const { data, error } = await supabase
    .from("demands")
    .select("id, title, work_area, delivery_time, delivery_date, publish_date, publish_time")
    .eq("tenant_id", tenantId)
    .eq("assigned_to", userId)
    .or(`delivery_date.eq.${date},publish_date.eq.${date}`);
  if (error || !data) return null;

  const normTime = (t?: string | null) => (t ? t.slice(0, 5) : null);
  const target = normTime(time);

  for (const d of data as any[]) {
    if (excludeDemandId && d.id === excludeDemandId) continue;
    if (d.work_area === area) continue;
    const dTime =
      d.delivery_date === date ? normTime(d.delivery_time) : normTime(d.publish_time);
    // Sem horário: assume o dia todo — sempre conflita.
    if (!target || !dTime) {
      return { id: d.id, title: d.title, work_area: d.work_area, delivery_time: d.delivery_time };
    }
    // Conflito estrito: mesmo horário exato.
    if (target === dTime) {
      return { id: d.id, title: d.title, work_area: d.work_area, delivery_time: d.delivery_time };
    }
  }
  return null;
}
