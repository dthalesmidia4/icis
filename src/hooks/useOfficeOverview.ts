import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCollaborators, type Collaborator } from "@/hooks/useCollaborators";
import { useActiveDispatchIds } from "@/hooks/useActiveDispatchIds";
import { useRealtimeDemands } from "@/hooks/realtime/useRealtimeDemands";
import { useNowTick } from "@/hooks/useNowTick";
import { useWorkHoursConfig } from "@/hooks/useWorkHoursConfig";
import { resolveCurrentAndNext } from "@/lib/currentWorkCard";
import { resolvePresence, type PresenceResult } from "@/lib/officePresence";
import {
  cardAreaMismatch,
  groupSchedulesByUser,
  resolvePresenceArea,
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
  /**
   * Etapa exibida: nome da função operacional quando existe e, quando o card
   * ainda não tem função (ex.: "Planejamento"), o nome da COLUNA/status que a
   * Visão Geral já mostra. Nunca "Sem etapa" havendo etapa reconhecível.
   */
  stageLabel: string;
  /** Nome da coluna (pipeline_statuses) — fallback canônico da etapa. */
  statusName: string | null;
  demandType: string | null;
  demandTypeKey: string | null;
  origin: string | null;
  workArea: WorkArea;
  dueDate: string | null;
  dueTime: string | null;
  deliveryDate: string | null;
  deliveryTime: string | null;
  publishDate: string | null;
  publishTime: string | null;
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
  /** Diagnóstico: card atual é de área sem janela ativa agora (não afeta presença). */
  cardAreaMismatch: boolean;
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
  demand_type_key: string | null;
  origin: string | null;
  work_area: string | null;
  due_date: string | null;
  due_time: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  publish_date: string | null;
  publish_time: string | null;
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

const DEMAND_COLUMNS =
  "id, title, client_id, assigned_to, additional_assignees, current_function_key, demand_type, demand_type_key, origin, work_area, due_date, due_time, delivery_date, delivery_time, publish_date, publish_time, released_at, status_id, is_daily_card";

/** Projeta uma linha realtime de `demands` no shape mínimo usado pelo escritório. */
const projectDemand = (row: Record<string, any>): RawDemand => ({
  id: row.id,
  title: row.title ?? null,
  client_id: row.client_id ?? null,
  assigned_to: row.assigned_to ?? null,
  additional_assignees: Array.isArray(row.additional_assignees) ? row.additional_assignees : null,
  current_function_key: row.current_function_key ?? null,
  demand_type: row.demand_type ?? null,
  demand_type_key: row.demand_type_key ?? null,
  origin: row.origin ?? null,
  work_area: row.work_area ?? null,
  due_date: row.due_date ?? null,
  due_time: row.due_time ?? null,
  delivery_date: row.delivery_date ?? null,
  delivery_time: row.delivery_time ?? null,
  publish_date: row.publish_date ?? null,
  publish_time: row.publish_time ?? null,
  released_at: row.released_at ?? null,
  status_id: row.status_id ?? null,
  is_daily_card: row.is_daily_card ?? null,
});


/** Elegibilidade idêntica ao filtro da carga inicial. */
const isEligible = (row: Record<string, any>) => !row.archived_at && row.is_draft === false;

export interface UseOfficeOverviewOptions {
  /**
   * Evento bruto de `demands` da ÚNICA assinatura realtime do escritório.
   * Usado pela animação de transferência sem abrir um segundo canal.
   */
  onDemandEvent?: (event: {
    type: "INSERT" | "UPDATE" | "DELETE";
    id: string;
    new: Record<string, any> | null;
    old: Record<string, any> | null;
  }) => void;
}

/**
 * Leitura agregada (READ-ONLY) das demandas ativas para a tela "Escritório".
 * Reaproveita a semântica da Visão Geral: dispatch ativo sai da fila,
 * `aguardando_cliente` é contado separado e o card corrente vem de
 * `resolveCurrentAndNext`.
 */
export function useOfficeOverview(
  tenantId: string | null | undefined,
  areaFilter: OfficeAreaFilter = "all",
  options: UseOfficeOverviewOptions = {},
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

  const onDemandEventRef = useRef(options.onDemandEvent);
  useEffect(() => {
    onDemandEventRef.current = options.onDemandEvent;
  }, [options.onDemandEvent]);

  // ---------- fontes independentes (nunca recarregadas juntas) ----------
  const loadDemands = useCallback(async () => {
    if (!tenantId) {
      setDemands([]);
      return;
    }
    const { data, error } = await supabase
      .from("demands")
      .select(DEMAND_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .eq("is_draft", false);
    if (error) console.error("[useOfficeOverview] demands error", error);
    setDemands(((data || []) as unknown as RawDemand[]) ?? []);
  }, [tenantId]);

  const loadCompanies = useCallback(async () => {
    if (!tenantId) return setClientNames({});
    const { data } = await supabase
      .from("tenant_companies")
      .select("id, name")
      .eq("tenant_id", tenantId);
    const names: Record<string, string> = {};
    ((data || []) as any[]).forEach((c) => {
      if (c?.id) names[c.id] = c.name || "";
    });
    setClientNames(names);
  }, [tenantId]);

  const loadFunctions = useCallback(async () => {
    if (!tenantId) return setStageLabels({});
    const { data } = await supabase
      .from("flow_functions")
      .select("function_key, name")
      .eq("tenant_id", tenantId);
    const labels: Record<string, string> = {};
    ((data || []) as any[]).forEach((f) => {
      if (f?.function_key) labels[f.function_key] = f.name || f.function_key;
    });
    setStageLabels(labels);
  }, [tenantId]);

  const loadSchedules = useCallback(async () => {
    if (!tenantId) return setScheduleRows([]);
    // Expediente REAL por usuário/área/dia — uma única query por tenant.
    const { data } = await supabase
      .from("user_area_schedules")
      .select("user_id, work_area, weekday, start_time, end_time")
      .eq("tenant_id", tenantId);
    setScheduleRows(((data || []) as unknown as AreaScheduleRow[]) ?? []);
  }, [tenantId]);

  /** Carga inicial (mount / troca de tenant): única vez que tudo é buscado. */
  const fetchAll = useCallback(async () => {
    if (!tenantId) {
      setDemands([]);
      setLoading(false);
      return;
    }
    await Promise.all([loadDemands(), loadCompanies(), loadFunctions(), loadSchedules()]);
    setLoading(false);
  }, [tenantId, loadDemands, loadCompanies, loadFunctions, loadSchedules]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  // ÚNICA assinatura de `demands` do escritório: alimenta dados + animação.
  useRealtimeDemands({
    tenantId: tenantId || null,
    enabled: !!tenantId,
    scopeKey: "office",
    onChange: (event) => {
      // 1) representação visual (transferência) recebe o evento cru primeiro.
      onDemandEventRef.current?.(event);

      // 2) patch incremental — nenhum refetch de companies/functions/schedules.
      const { type, id, new: rowNew } = event;
      if (!id) return;
      if (type === "DELETE") {
        setDemands((prev) => prev.filter((d) => d.id !== id));
        return;
      }
      if (!rowNew || !("title" in rowNew)) {
        // payload insuficiente: refaz SOMENTE demands.
        loadDemands();
        return;
      }
      if (!isEligible(rowNew)) {
        setDemands((prev) => prev.filter((d) => d.id !== id));
        return;
      }
      const projected = projectDemand(rowNew);
      setDemands((prev) => {
        const idx = prev.findIndex((d) => d.id === id);
        if (idx === -1) return [...prev, projected];
        const next = prev.slice();
        next[idx] = projected;
        return next;
      });
    },
  });

  // Mudanças de expediente (`Alocação por área`) refazem SOMENTE schedules.
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
        () => loadSchedules(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, loadSchedules]);



  const cards = useMemo<OfficeCard[]>(() => {
    return demands
      .map((d) => {
        const area = normalizeWorkArea(d.work_area);
        const startTs = toTs(d.due_date, d.due_time);
        const key = d.current_function_key || null;
        const statusName = d.status_id ? statusNames[d.status_id] || null : null;
        return {
          id: d.id,
          title: d.title || "Sem título",
          clientId: d.client_id,
          clientName: d.client_id ? clientNames[d.client_id] || null : null,
          assignedTo: d.assigned_to,
          additionalAssignees: Array.isArray(d.additional_assignees) ? d.additional_assignees : [],
          functionKey: key,
          // Etapa: função operacional > nome da coluna (Visão Geral) > nada.
          stageLabel: (key ? stageLabels[key] || key : statusName) || "Sem etapa",
          statusName,
          demandType: d.demand_type,
          demandTypeKey: d.demand_type_key,
          origin: d.origin,
          workArea: area,
          dueDate: d.due_date,
          dueTime: d.due_time,
          deliveryDate: d.delivery_date,
          deliveryTime: d.delivery_time,
          publishDate: d.publish_date,
          publishTime: d.publish_time,
          isDailyCard: !!d.is_daily_card,
          startTs,
          endTs: toTs(d.delivery_date, d.delivery_time),
          isLate: !!startTs && startTs < now && !isClientWaitingFunction(key),
        } satisfies OfficeCard;
      })
      .filter((c) => (areaFilter === "all" ? true : c.workArea === areaFilter));
  }, [demands, clientNames, stageLabels, statusNames, areaFilter, now]);


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

      // PRESENÇA HUMANA: na visão `Todas` é a UNIÃO das áreas alocadas no dia.
      // A área do card no monitor NUNCA torna alguém em expediente `off_shift`.
      const userRows = schedulesByUser[collaborator.userId] || [];
      const presenceArea: ScheduleAreaFilter = resolvePresenceArea(
        areaFilter as ScheduleAreaFilter,
      );

      const { windows } = resolveUserWindows({
        rows: userRows,
        weekday: clock.weekday,
        area: presenceArea,
        workHours,
      });

      // Sinal apenas diagnóstico (não altera presença).
      const areaMismatch = cardAreaMismatch({
        rows: userRows,
        weekday: clock.weekday,
        cardArea: current?.workArea ?? null,
        nowMinutes: clock.minutes,
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
        cardAreaMismatch: areaMismatch,
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
