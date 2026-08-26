/**
 * PAINEL DA AGÊNCIA + XP coletivo do Escritório.
 *
 * Fontes reais e mínimas:
 *  - `demand_flow_history` com `action = 'delivered'`: um `count exact/head`
 *    para o XP acumulado e UMA janela curta (36h) para identificar as entregas
 *    do dia canônico do expediente;
 *  - realtime já existente (`useRealtimeDemandFlowHistory`) para incrementar
 *    localmente, sem polling e sem refazer a consulta;
 *  - cards agency-wide já projetados por `useOfficeOverview` (sem nova query).
 *
 * Os números NUNCA dependem do filtro Mídia/Sistemas: o painel é da agência.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNowTick } from "@/hooks/useNowTick";
import { useWorkHoursConfig } from "@/hooks/useWorkHoursConfig";
import { useRealtimeDemandFlowHistory } from "@/hooks/realtime/useRealtimeDemandFlowHistory";
import { operationalToday } from "@/lib/scheduledPublishStage";
import {
  buildOfficeMissions,
  countOverloadedDesks,
  deriveAgencyPulse,
  levelFromDeliveries,
  type AgencyLevel,
  type AgencyPulse,
  type OfficeMission,
  type PulseCard,
} from "@/lib/officeAgencyPulse";

/** Janela curta o suficiente para cobrir o dia canônico sem varrer o histórico. */
const RECENT_WINDOW_MS = 36 * 60 * 60 * 1000;

export interface UseOfficeAgencyPulseResult extends AgencyPulse {
  level: AgencyLevel;
  missions: OfficeMission[];
  missionsDone: number;
  missionsTotal: number;
  loading: boolean;
}

export function useOfficeAgencyPulse(
  tenantId: string | null | undefined,
  input: { cards: PulseCard[]; queueCounts: number[] },
): UseOfficeAgencyPulseResult {
  const now = useNowTick(60_000);
  const { config: workHours } = useWorkHoursConfig(tenantId);
  const today = operationalToday(new Date(now), workHours.tz);

  const [deliveredTotal, setDeliveredTotal] = useState(0);
  const [deliveredDays, setDeliveredDays] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) {
      setDeliveredTotal(0);
      setDeliveredDays({});
      setLoading(false);
      return;
    }
    const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
    const [total, recent] = await Promise.all([
      supabase
        .from("demand_flow_history")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("action", "delivered"),
      supabase
        .from("demand_flow_history")
        .select("id, created_at")
        .eq("tenant_id", tenantId)
        .eq("action", "delivered")
        .gte("created_at", since),
    ]);
    setDeliveredTotal(total.count ?? 0);
    const byDay: Record<string, number> = {};
    ((recent.data || []) as { created_at: string }[]).forEach((row) => {
      const day = operationalToday(new Date(row.created_at), workHours.tz);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    setDeliveredDays(byDay);
    setLoading(false);
  }, [tenantId, workHours.tz]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Realtime incremental: nada de refetch por evento.
  useRealtimeDemandFlowHistory({
    tenantId: tenantId || null,
    enabled: !!tenantId,
    onInsert: (row) => {
      if (row.action !== "delivered") return;
      const day = operationalToday(new Date(row.created_at || Date.now()), workHours.tz);
      setDeliveredTotal((prev) => prev + 1);
      setDeliveredDays((prev) => ({ ...prev, [day]: (prev[day] || 0) + 1 }));
    },
  });

  const deliveredToday = deliveredDays[today] || 0;

  const pulse = useMemo(
    () => deriveAgencyPulse({ cards: input.cards, now, today, deliveredToday }),
    [input.cards, now, today, deliveredToday],
  );

  const missions = useMemo(
    () =>
      buildOfficeMissions({
        atRisk: pulse.atRisk,
        inReview: pulse.inReview,
        overloadedDesks: countOverloadedDesks(input.queueCounts),
      }),
    [pulse.atRisk, pulse.inReview, input.queueCounts],
  );

  return {
    ...pulse,
    level: levelFromDeliveries(deliveredTotal),
    missions: missions.missions,
    missionsDone: missions.doneCount,
    missionsTotal: missions.total,
    loading,
  };
}

export default useOfficeAgencyPulse;
