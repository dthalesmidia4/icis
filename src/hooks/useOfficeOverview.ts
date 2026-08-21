import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCollaborators, type Collaborator } from "@/hooks/useCollaborators";
import { useActiveDispatchIds } from "@/hooks/useActiveDispatchIds";
import { useRealtimeDemands } from "@/hooks/realtime/useRealtimeDemands";
import { useNowTick } from "@/hooks/useNowTick";
import { useWorkHoursConfig } from "@/hooks/useWorkHoursConfig";
import { resolveCurrentAndNext } from "@/lib/currentWorkCard";
import { resolvePresence, type PresenceResult } from "@/lib/officePresence";
import {
  groupSchedulesByUser,
  resolveUserWindows,
  type AreaScheduleRow,
  type ScheduleAreaFilter,
} from "@/lib/officeSchedule";
import { zonedClockParts } from "@/lib/reorderSequence";
import { isClientWaitingFunction, normalizeWorkArea, type WorkArea } from "@/lib/flowFunctions";


export type OfficeAreaFilter = "all" | WorkArea;

export interface OfficeCard {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  assignedTo: string | null;
  additionalAssignees: string[];
  functionKey: string | null;
  stageLabel: string;
  demandType: string | null;
  workArea: WorkArea;
  dueDate: string | null;
  dueTime: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  isDailyCard: boolean;
  /** Timestamp de início (due_date + due_time) ou null. */
  startTs: number | null;
  /** Timestamp de fim previsto (delivery_date + delivery_time) ou null. */
  endTs: number | null;
  isLate: boolean;
}

export interface OfficeStationData {
  collaborator: Collaborator;
  current: OfficeCard | null;
  next: OfficeCard | null;
  /** Fila operacional completa em ordem cronológica (inclui o card atual). */
  queue: OfficeCard[];
  queueCount: number;
  awaitingClientCount: number;
  /** Carga relativa (0..1) ao maior volume da tela — NÃO é progresso. */
  loadRatio: number;
  /** Presença derivada (mesa, cafeteria, almoço oficial, disponível). */
  presence: PresenceResult;
}

export interface OfficeOverview {
  stations: OfficeStationData[];
  /** Cards do tenant já filtrados por área (usado pelo detector de transferência). */
  cards: OfficeCard[];
  totals: {
    people: number;
    working: number;
    queued: number;
    awaitingClient: number;
  };
  loading: boolean;
  refetch: () => void;
}


interface RawDemand {
  id: string;
  title: string | null;
  client_id: string | null;
  assigned_to: string | null;
  additional_assignees: string[] | null;
  current_function_key: string | null;
  demand_type: string | null;
  work_area: string | null;
  due_date: string | null;
  due_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  released_at: string | null;
  status_id: string | null;
  is_daily_card?: boolean | null;
}

const toTs = (date?: string | null, time?: string | null): number | null => {
  if (!date) return null;
  const [y, mo, d] = date.split("-").map((n) => parseInt(n, 10));
  const [h, mi] = (time || "00:00").slice(0, 5).split(":").map((n) => parseInt(n, 10));
  const ts = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0).getTime();
  return Number.isFinite(ts) ? ts : null;
};

/**
 * Leitura agregada (READ-ONLY) das demandas ativas para a tela "Escritório".
 * Reaproveita a semântica da Visão Geral: dispatch ativo sai da fila,
 * `aguardando_cliente` é contado separado e o card corrente vem de
 * `resolveCurrentAndNext`.
 */
export function useOfficeOverview(
  tenantId: string | null | undefined,
  areaFilter: OfficeAreaFilter = "all",
): OfficeOverview {
  const now = useNowTick(60_000);
  const { collaborators, loading: loadingCollaborators } = useCollaborators(tenantId);
  const { activeDispatchIds } = useActiveDispatchIds(tenantId);
  const { config: workHours } = useWorkHoursConfig(tenantId);

  const [demands, setDemands] = useState<RawDemand[]>([]);
  const [scheduleRows, setScheduleRows] = useState<AreaScheduleRow[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) {
      setDemands([]);
      setLoading(false);
      return;
    }
    const [{ data: rows, error }, { data: companies }, { data: functions }, { data: schedules }] =
      await Promise.all([
        supabase
          .from("demands")
          .select(
            "id, title, client_id, assigned_to, additional_assignees, current_function_key, demand_type, work_area, due_date, due_time, delivery_date, delivery_time, released_at, status_id, is_daily_card",
          )
          .eq("tenant_id", tenantId)
          .is("archived_at", null)
          .eq("is_draft", false),
        supabase.from("tenant_companies").select("id, name").eq("tenant_id", tenantId),
        supabase.from("flow_functions").select("function_key, name").eq("tenant_id", tenantId),
        // Expediente REAL por usuário/área/dia — uma única query por tenant.
        supabase
          .from("user_area_schedules")
          .select("user_id, work_area, weekday, start_time, end_time")
          .eq("tenant_id", tenantId),
      ]);

    if (error) console.error("[useOfficeOverview] demands error", error);

    setDemands(((rows || []) as unknown as RawDemand[]) ?? []);
    setScheduleRows(((schedules || []) as unknown as AreaScheduleRow[]) ?? []);

    const names: Record<string, string> = {};
    ((companies || []) as any[]).forEach((c) => {
      if (c?.id) names[c.id] = c.name || "";
    });
    setClientNames(names);

    const labels: Record<string, string> = {};
    ((functions || []) as any[]).forEach((f) => {
      if (f?.function_key) labels[f.function_key] = f.name || f.function_key;
    });
    setStageLabels(labels);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  useRealtimeDemands({
    tenantId: tenantId || null,
    enabled: !!tenantId,
    onChange: () => fetchAll(),
  });

  // Mudanças de expediente (`Alocação por área`) refletem no escritório sem reload.
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`rt-user-area-schedules-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_area_schedules",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, fetchAll]);


  const cards = useMemo<OfficeCard[]>(() => {
    return demands
      .map((d) => {
        const area = normalizeWorkArea(d.work_area);
        const startTs = toTs(d.due_date, d.due_time);
        const key = d.current_function_key || null;
        return {
          id: d.id,
          title: d.title || "Sem título",
          clientId: d.client_id,
          clientName: d.client_id ? clientNames[d.client_id] || null : null,
          assignedTo: d.assigned_to,
          additionalAssignees: Array.isArray(d.additional_assignees) ? d.additional_assignees : [],
          functionKey: key,
          stageLabel: key ? stageLabels[key] || key : "Sem etapa",
          demandType: d.demand_type,
          workArea: area,
          dueDate: d.due_date,
          dueTime: d.due_time,
          deliveryDate: d.delivery_date,
          deliveryTime: d.delivery_time,
          isDailyCard: !!d.is_daily_card,
          startTs,
          endTs: toTs(d.delivery_date, d.delivery_time),
          isLate: !!startTs && startTs < now && !isClientWaitingFunction(key),
        } satisfies OfficeCard;
      })
      .filter((c) => (areaFilter === "all" ? true : c.workArea === areaFilter));
  }, [demands, clientNames, stageLabels, areaFilter, now]);

  const schedulesByUser = useMemo(() => groupSchedulesByUser(scheduleRows), [scheduleRows]);

  const stations = useMemo<OfficeStationData[]>(() => {
    // Relógio de parede canônico do expediente (nunca o timezone do browser).
    const clock = zonedClockParts(new Date(now), workHours.tz);
    const byUser = new Map<string, OfficeCard[]>();
    const push = (uid: string | null | undefined, card: OfficeCard) => {
      if (!uid) return;
      const list = byUser.get(uid) || [];
      if (!list.some((c) => c.id === card.id)) list.push(card);
      byUser.set(uid, list);
    };
    cards.forEach((c) => {
      push(c.assignedTo, c);
      c.additionalAssignees.forEach((uid) => push(uid, c));
    });

    const raw = collaborators.map((collaborator) => {
      const all = byUser.get(collaborator.userId) || [];
      const awaitingClientCount = all.filter((c) => isClientWaitingFunction(c.functionKey)).length;

      const operational = all
        .filter((c) => !isClientWaitingFunction(c.functionKey) && !activeDispatchIds.has(c.id))
        .sort((a, b) => (a.startTs ?? Infinity) - (b.startTs ?? Infinity));

      const { currentId, nextId } = resolveCurrentAndNext(
        operational.map((c) => ({
          id: c.id,
          current_function_key: c.functionKey,
          due_date: c.dueDate,
          due_time: c.dueTime,
          is_daily_card: c.isDailyCard,
        })),
        { now, activeDispatchIds },
      );

      // Captação cujo horário já chegou tem prioridade visual no monitor.
      const startedCapture = operational.find(
        (c) => c.functionKey === "captar" && c.startTs !== null && c.startTs <= now,
      );

      const current =
        startedCapture ||
        operational.find((c) => c.id === currentId) ||
        null;
      const next =
        operational.find((c) => c.id === nextId && c.id !== current?.id) ||
        operational.find((c) => c.id !== current?.id) ||
        null;

      // Área usada para validar a janela: card no monitor > próximo > filtro da tela.
      const presenceArea: ScheduleAreaFilter =
        areaFilter !== "all"
          ? areaFilter
          : ((current?.workArea || next?.workArea || "all") as ScheduleAreaFilter);

      const { windows } = resolveUserWindows({
        rows: schedulesByUser[collaborator.userId] || [],
        weekday: clock.weekday,
        area: presenceArea,
        workHours,
      });

      const presence = resolvePresence({
        now,
        windows,
        tz: workHours.tz,
        queue: operational.map((c) => ({ id: c.id, startTs: c.startTs, endTs: c.endTs })),
      });

      return {
        collaborator,
        current,
        next,
        queue: operational,
        queueCount: operational.length,
        awaitingClientCount,
        loadRatio: 0,
        presence,
      } satisfies OfficeStationData;
    });

    const max = raw.reduce((m, s) => Math.max(m, s.queueCount), 0);
    return raw.map((s) => ({ ...s, loadRatio: max > 0 ? s.queueCount / max : 0 }));
  }, [cards, collaborators, activeDispatchIds, now, workHours, schedulesByUser, areaFilter]);

  const totals = useMemo(() => {
    const queued = new Set<string>();
    const awaiting = new Set<string>();
    let working = 0;
    stations.forEach((s) => {
      if (s.presence.state === "working_now") working += 1;
      s.queue.forEach((c) => queued.add(c.id));
    });
    cards.forEach((c) => {
      if (isClientWaitingFunction(c.functionKey)) awaiting.add(c.id);
    });
    return {
      people: stations.length,
      working,
      queued: queued.size,
      awaitingClient: awaiting.size,
    };
  }, [stations, cards]);

  return {
    stations,
    cards,
    totals,
    loading: loading || loadingCollaborators,
    refetch: fetchAll,
  };

}

export default useOfficeOverview;
