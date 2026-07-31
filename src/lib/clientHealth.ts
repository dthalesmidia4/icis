import { supabase } from "@/integrations/supabase/client";

export type HealthLevel = "ok" | "atencao" | "risco";

export interface ClientHealth {
  clientId: string;
  clientName: string;
  cadenceDays: number;
  lastTouchAt: string | null;
  lastTouchType: string | null;
  daysSinceTouch: number | null;
  openDemands: number;
  overdueDemands: number;
  touchpoints30d: number;
  score: number;
  level: HealthLevel;
  reasons: string[];
}

const dayDiff = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export function levelFromScore(score: number): HealthLevel {
  if (score >= 75) return "ok";
  if (score >= 50) return "atencao";
  return "risco";
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  ok: "Saudável",
  atencao: "Atenção",
  risco: "Risco",
};

/**
 * Health score de Customer Success (Sistemas).
 * Penaliza cadência de contato estourada, demandas atrasadas e ausência de
 * qualquer contato registrado. 100 = saudável.
 */
export async function loadClientHealth(
  tenantId: string,
  workArea: "sistemas" | "midia" = "sistemas",
): Promise<ClientHealth[]> {
  const [{ data: clients }, { data: touchpoints }, { data: demands }] = await Promise.all([
    supabase
      .from("tenant_companies")
      .select("id, name, fantasy_name, contact_cadence_days, default_work_area")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("client_touchpoints")
      .select("client_id, touchpoint_type, occurred_at")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("demands")
      .select("client_id, due_date, delivery_date, archived_at, work_area, current_function_key")
      .eq("tenant_id", tenantId)
      .is("archived_at", null),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const since30 = Date.now() - 30 * 86_400_000;

  // Filtro estrito por área: empresas sem área definida contam como Mídia.
  const relevant = (clients || []).filter(
    (c: any) => (c.default_work_area || "midia") === workArea,
  );


  return relevant.map((c: any) => {
    const cadenceDays = Number(c.contact_cadence_days) || 15;
    const tps = (touchpoints || []).filter((t: any) => t.client_id === c.id);
    const last = tps[0] || null;
    const lastTouchAt = last?.occurred_at || null;
    const daysSinceTouch = lastTouchAt ? dayDiff(lastTouchAt) : null;
    const touchpoints30d = tps.filter((t: any) => new Date(t.occurred_at).getTime() >= since30).length;

    const clientDemands = (demands || []).filter(
      (d: any) => d.client_id === c.id && (d.work_area || "midia") === workArea,
    );
    const openDemands = clientDemands.length;
    const overdueDemands = clientDemands.filter(
      (d: any) => d.due_date && d.due_date < todayStr && !d.delivery_date,
    ).length;

    let score = 100;
    const reasons: string[] = [];

    if (daysSinceTouch === null) {
      score -= 40;
      reasons.push("Nenhum contato registrado");
    } else if (daysSinceTouch > cadenceDays * 2) {
      score -= 40;
      reasons.push(`Sem contato há ${daysSinceTouch} dias (cadência ${cadenceDays}d)`);
    } else if (daysSinceTouch > cadenceDays) {
      score -= 20;
      reasons.push(`Cadência estourada (${daysSinceTouch}d / ${cadenceDays}d)`);
    }

    if (overdueDemands >= 3) {
      score -= 30;
      reasons.push(`${overdueDemands} demandas atrasadas`);
    } else if (overdueDemands > 0) {
      score -= 15 * overdueDemands;
      reasons.push(`${overdueDemands} demanda(s) atrasada(s)`);
    }

    if (openDemands === 0 && touchpoints30d === 0) {
      score -= 10;
      reasons.push("Sem atividade nos últimos 30 dias");
    }

    score = Math.max(0, Math.min(100, score));

    return {
      clientId: c.id,
      clientName: c.fantasy_name || c.name,
      cadenceDays,
      lastTouchAt,
      lastTouchType: last?.touchpoint_type || null,
      daysSinceTouch,
      openDemands,
      overdueDemands,
      touchpoints30d,
      score,
      level: levelFromScore(score),
      reasons,
    };
  });
}

export interface SystemsClientHealth extends ClientHealth {
  parentCompanyId: string;
  parentCompanyName: string;
  status: string;
  /** Demandas abertas agrupadas por origem (interno, cliente_solicitacao, ...). */
  openByOrigin: Record<string, number>;
}

/**
 * Health score dos CLIENTES de uma empresa de Sistemas (ex.: as clínicas
 * atendidas pela SmartVety). Cada linha é um registro de `systems_clients`.
 */
/** Origem do card → tipo de contato equivalente (contato derivado da demanda). */
const DERIVED_ORIGIN_TOUCHPOINT: Record<string, string> = {
  cliente_solicitacao: "solicitacao",
  cliente_feedback: "feedback",
  suporte: "solicitacao",
};

function derivedTouchpointType(origin?: string | null): string | null {
  if (!origin) return null;
  return DERIVED_ORIGIN_TOUCHPOINT[origin.toLowerCase().trim()] ?? null;
}

export async function loadSystemsClientHealth(tenantId: string): Promise<SystemsClientHealth[]> {

  const [{ data: companies }, { data: subclients }, { data: touchpoints }, { data: demands }] =
    await Promise.all([
      supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", tenantId)
        .eq("default_work_area", "sistemas"),
      supabase
        .from("systems_clients")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("client_touchpoints")
        .select("subclient_id, touchpoint_type, occurred_at")
        .eq("tenant_id", tenantId)
        .not("subclient_id", "is", null)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("demands")
        .select(
          "subclient_id, subclient_ids, due_date, delivery_date, archived_at, origin, created_at, title",
        )
        .eq("tenant_id", tenantId)
        .is("archived_at", null),
    ]);

  const companyName = new Map<string, string>();
  (companies || []).forEach((c: any) => companyName.set(c.id, c.fantasy_name || c.name));

  const todayStr = new Date().toISOString().slice(0, 10);
  const since30 = Date.now() - 30 * 86_400_000;

  return (subclients || []).map((s: any) => {
    const cadenceDays = Number(s.contact_cadence_days) || 30;
    const tps = (touchpoints || []).filter((t: any) => t.subclient_id === s.id);

    // Uma demanda pode ter vários clientes solicitantes: conta para todos eles.
    const own = (demands || []).filter((d: any) => {
      const ids: string[] = Array.isArray(d.subclient_ids) && d.subclient_ids.length
        ? d.subclient_ids
        : d.subclient_id
          ? [d.subclient_id]
          : [];
      return ids.includes(s.id);
    });

    // Contatos derivados dos próprios cards (origem de cliente), caso o
    // registro automático não tenha rodado — a tela nunca deve dizer
    // "nunca registrado" havendo evidência de contato.
    const derived = own
      .filter((d: any) => derivedTouchpointType(d.origin) !== null)
      .map((d: any) => ({
        subclient_id: s.id,
        touchpoint_type: derivedTouchpointType(d.origin) as string,
        occurred_at: d.created_at as string,
        derived: true,
      }));

    const allTps = [...tps.map((t: any) => ({ ...t, derived: false })), ...derived].sort(
      (a: any, b: any) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );

    const last = allTps[0] || null;
    const lastTouchAt = last?.occurred_at || null;
    const daysSinceTouch = lastTouchAt ? dayDiff(lastTouchAt) : null;
    const touchpoints30d = allTps.filter(
      (t: any) => new Date(t.occurred_at).getTime() >= since30,
    ).length;


    const openDemands = own.length;
    const overdueDemands = own.filter(
      (d: any) => d.due_date && d.due_date < todayStr && !d.delivery_date,
    ).length;
    const openByOrigin: Record<string, number> = {};
    own.forEach((d: any) => {
      const key = d.origin || "interno";
      openByOrigin[key] = (openByOrigin[key] || 0) + 1;
    });

    let score = 100;
    const reasons: string[] = [];

    if (s.status === "cancelado") {
      score -= 60;
      reasons.push("Cliente cancelado");
    } else if (s.status === "pausado") {
      score -= 20;
      reasons.push("Cliente pausado");
    }

    if (daysSinceTouch === null) {
      score -= 40;
      reasons.push("Nenhum contato registrado");
    } else if (daysSinceTouch > cadenceDays * 2) {
      score -= 40;
      reasons.push(`Sem contato há ${daysSinceTouch} dias (cadência ${cadenceDays}d)`);
    } else if (daysSinceTouch > cadenceDays) {
      score -= 20;
      reasons.push(`Cadência estourada (${daysSinceTouch}d / ${cadenceDays}d)`);
    }

    if (last?.derived) {
      reasons.push("Último contato inferido de demanda do cliente");
    }


    if (overdueDemands >= 3) {
      score -= 30;
      reasons.push(`${overdueDemands} demandas atrasadas`);
    } else if (overdueDemands > 0) {
      score -= 15 * overdueDemands;
      reasons.push(`${overdueDemands} demanda(s) atrasada(s)`);
    }

    if (openDemands === 0 && touchpoints30d === 0) {
      score -= 10;
      reasons.push("Sem atividade nos últimos 30 dias");
    }

    score = Math.max(0, Math.min(100, score));

    return {
      clientId: s.id,
      clientName: s.name,
      parentCompanyId: s.parent_company_id,
      parentCompanyName: companyName.get(s.parent_company_id) || "—",
      status: s.status,
      openByOrigin,
      cadenceDays,
      lastTouchAt,
      lastTouchType: last?.touchpoint_type || null,
      daysSinceTouch,
      openDemands,
      overdueDemands,
      touchpoints30d,
      score,
      level: levelFromScore(score),
      reasons,
    };
  });
}

export interface TimelineTouchpoint {
  subclientId: string;
  type: string;
  occurredAt: string;
  summary: string | null;
  source: string;
}

/**
 * Carrega em UMA query os contatos dos últimos N dias de todos os subclientes
 * do tenant, agrupados por subcliente — usado pela linha do tempo do CS.
 */
export async function loadSubclientTouchpointTimeline(
  tenantId: string,
  days = 90,
): Promise<Record<string, TimelineTouchpoint[]>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data, error }, { data: demands }] = await Promise.all([
    supabase
      .from("client_touchpoints")
      .select("subclient_id, touchpoint_type, occurred_at, summary, source")
      .eq("tenant_id", tenantId)
      .not("subclient_id", "is", null)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true }),
    supabase
      .from("demands")
      .select("subclient_id, subclient_ids, origin, created_at, title")
      .eq("tenant_id", tenantId)
      .gte("created_at", since),
  ]);

  if (error) throw error;

  const grouped: Record<string, TimelineTouchpoint[]> = {};
  const push = (key: string, tp: TimelineTouchpoint) => {
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tp);
  };

  (data || []).forEach((t: any) => {
    push(t.subclient_id as string, {
      subclientId: t.subclient_id as string,
      type: t.touchpoint_type,
      occurredAt: t.occurred_at,
      summary: t.summary ?? null,
      source: t.source,
    });
  });

  // Contatos derivados: cards com origem de cliente contam como contato mesmo
  // que o touchpoint automático não tenha sido gravado.
  const seen = new Set(
    (data || []).map((t: any) => `${t.subclient_id}|${(t.occurred_at || "").slice(0, 10)}`),
  );
  (demands || []).forEach((d: any) => {
    const type = derivedTouchpointType(d.origin);
    if (!type) return;
    const ids: string[] = Array.isArray(d.subclient_ids) && d.subclient_ids.length
      ? d.subclient_ids
      : d.subclient_id
        ? [d.subclient_id]
        : [];
    ids.filter(Boolean).forEach((sid: string) => {
      const key = `${sid}|${(d.created_at || "").slice(0, 10)}`;
      if (seen.has(key)) return;
      seen.add(key);
      push(sid, {
        subclientId: sid,
        type,
        occurredAt: d.created_at,
        summary: `Origem do card: ${d.title || "demanda"}`,
        source: "demanda",
      });
    });
  });

  Object.keys(grouped).forEach((key) => {
    grouped[key].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
  });

  return grouped;
}



export interface CadenceSeriesPoint {
  /** timestamp (ms) do dia */
  t: number;
  /** rótulo curto dd/mm */
  label: string;
  /** dias sem contato por cliente (clientId → dias, null quando desconhecido) */
  [clientId: string]: number | string | null;
}

export interface CadenceSeries {
  points: CadenceSeriesPoint[];
  /** clientId → dia (dd/mm) → contatos daquele dia */
  contactsByDay: Record<string, Record<string, TimelineTouchpoint[]>>;
}

const DAY_MS = 86_400_000;
const dayKey = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Constrói a série "dias desde o último contato" por dia do período, para cada
 * cliente — base do gráfico de linha de cadência do Customer Success.
 */
export function buildCadenceSeries(
  rows: SystemsClientHealth[],
  timeline: Record<string, TimelineTouchpoint[]>,
  days: number,
): CadenceSeries {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endMs = today.getTime();
  const startMs = endMs - (days - 1) * DAY_MS;

  const contactsByDay: Record<string, Record<string, TimelineTouchpoint[]>> = {};
  const stamps: Record<string, number[]> = {};

  rows.forEach((row) => {
    const tps = (timeline[row.clientId] || []).slice().sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    contactsByDay[row.clientId] = {};
    tps.forEach((t) => {
      const k = dayKey(new Date(t.occurredAt).getTime());
      (contactsByDay[row.clientId][k] ||= []).push(t);
    });
    stamps[row.clientId] = tps.map((t) => {
      const d = new Date(t.occurredAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });
    // contato anterior à janela: usa o último contato conhecido do health
    if (row.lastTouchAt) {
      const d = new Date(row.lastTouchAt);
      d.setHours(0, 0, 0, 0);
      if (!stamps[row.clientId].includes(d.getTime())) {
        stamps[row.clientId].push(d.getTime());
        stamps[row.clientId].sort((a, b) => a - b);
      }
    }
  });

  const points: CadenceSeriesPoint[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const point: CadenceSeriesPoint = { t: ms, label: dayKey(ms) };
    rows.forEach((row) => {
      const previous = (stamps[row.clientId] || []).filter((s) => s <= ms);
      // sem contato conhecido até esse dia: não inventar valor (linha cortada)
      point[row.clientId] =
        previous.length === 0
          ? null
          : Math.round((ms - previous[previous.length - 1]) / DAY_MS);
    });
    points.push(point);
  }

  return { points, contactsByDay };
}
