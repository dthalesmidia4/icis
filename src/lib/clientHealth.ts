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
}

/**
 * Health score dos CLIENTES de uma empresa de Sistemas (ex.: as clínicas
 * atendidas pela SmartVety). Cada linha é um registro de `systems_clients`.
 */
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
        .select("subclient_id, subclient_ids, due_date, delivery_date, archived_at")
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
    const last = tps[0] || null;
    const lastTouchAt = last?.occurred_at || null;
    const daysSinceTouch = lastTouchAt ? dayDiff(lastTouchAt) : null;
    const touchpoints30d = tps.filter(
      (t: any) => new Date(t.occurred_at).getTime() >= since30,
    ).length;

    const own = (demands || []).filter((d: any) => d.subclient_id === s.id);
    const openDemands = own.length;
    const overdueDemands = own.filter(
      (d: any) => d.due_date && d.due_date < todayStr && !d.delivery_date,
    ).length;

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
