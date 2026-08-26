import { supabase } from "@/integrations/supabase/client";

/**
 * Camada de CAMPANHA (marketing_campaigns).
 *
 * Uma campanha pertence a UMA empresa/cliente já cadastrada em tenant_companies
 * (ex.: SmartVety, que é simultaneamente cliente de Mídia e produto de Sistemas).
 * A campanha costura Mídia (period_plans.campaign_id) e Comercial
 * (systems_clients.acquisition_campaign_id). Nada aqui substitui systems_clients
 * nem cria um segundo cadastro de cliente.
 */

export type CampaignStatus = "planning" | "active" | "paused" | "completed" | "cancelled";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  planning: "Planejamento",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const CAMPAIGN_STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = (
  Object.keys(CAMPAIGN_STATUS_LABEL) as CampaignStatus[]
).map((value) => ({ value, label: CAMPAIGN_STATUS_LABEL[value] }));

/** Estados que não estão mais em operação. */
export const CAMPAIGN_CLOSED_STATUSES: CampaignStatus[] = ["completed", "cancelled"];

export const CAMPAIGN_CHANNEL_OPTIONS = [
  "Instagram",
  "Facebook",
  "Google",
  "WhatsApp",
  "E-mail",
  "Eventos",
  "Prospecção ativa",
  "Indicação",
] as const;

export interface MarketingCampaign {
  id: string;
  tenant_id: string;
  company_id: string;
  strategy_id: string | null;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  region_label: string | null;
  radius_km: number | null;
  channels: string[];
  paid_traffic_budget: number | null;
  acquisition_strategy: string | null;
  observations: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function campaignStatusLabel(status?: string | null): string {
  if (!status) return "—";
  return CAMPAIGN_STATUS_LABEL[status as CampaignStatus] || status;
}

export function isCampaignClosed(status?: string | null): boolean {
  return !!status && CAMPAIGN_CLOSED_STATUSES.includes(status as CampaignStatus);
}

/** Rótulo humano da região atendida (cidade/UF + raio). */
export function campaignRegionLabel(
  c: Pick<MarketingCampaign, "region_label" | "city" | "state" | "radius_km">,
): string {
  if (c.region_label && c.region_label.trim()) return c.region_label.trim();
  const place = [c.city, c.state].filter((v) => v && String(v).trim()).join(" / ");
  if (!place) return c.radius_km ? `Raio de ${c.radius_km} km` : "—";
  return c.radius_km ? `${place} + ${c.radius_km} km` : place;
}

export interface CampaignFormInput {
  name?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  radiusKm?: string | number | null;
  paidTrafficBudget?: string | number | null;
}

/** Validação pura do formulário — usada pela UI e pelos testes. */
export function validateCampaignInput(input: CampaignFormInput): string | null {
  if (!input.name || !String(input.name).trim()) return "Informe o nome da campanha.";
  if (input.status && !CAMPAIGN_STATUS_OPTIONS.some((o) => o.value === input.status)) {
    return "Status de campanha inválido.";
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return "A data final deve ser posterior à data inicial.";
  }
  const radius = parseNumber(input.radiusKm);
  if (radius !== null && radius < 0) return "O raio de atuação não pode ser negativo.";
  const budget = parseNumber(input.paidTrafficBudget);
  if (budget !== null && budget < 0) return "A verba de tráfego pago não pode ser negativa.";
  return null;
}

/** Converte texto brasileiro ("1.500,50") ou número em number; vazio → null. */
export function parseNumber(value?: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Campanha "vigente" para exibir no Comercial: prioriza `active`, depois a que
 * cobre a data de referência, depois a mais recente. Nunca devolve encerrada.
 */
export function pickActiveCampaign(
  campaigns: MarketingCampaign[],
  reference: Date = new Date(),
): MarketingCampaign | null {
  const open = (campaigns || []).filter((c) => !isCampaignClosed(c.status));
  if (open.length === 0) return null;
  const ref = reference.toISOString().slice(0, 10);
  const covers = (c: MarketingCampaign) =>
    (!c.start_date || c.start_date <= ref) && (!c.end_date || c.end_date >= ref);
  const score = (c: MarketingCampaign) => {
    let s = 0;
    if (c.status === "active") s += 4;
    if (covers(c)) s += 2;
    if (c.status === "planning") s += 1;
    return s;
  };
  return [...open].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    const sa = a.start_date || a.created_at;
    const sb = b.start_date || b.created_at;
    return sb.localeCompare(sa);
  })[0];
}

const normalizeRow = (row: any): MarketingCampaign => ({
  ...row,
  channels: Array.isArray(row?.channels) ? row.channels.map((c: unknown) => String(c)) : [],
  status: (row?.status || "planning") as CampaignStatus,
});

export async function loadCampaigns(
  tenantId: string,
  companyId?: string | null,
): Promise<MarketingCampaign[]> {
  let query = (supabase as any)
    .from("marketing_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeRow);
}

export async function loadCampaign(id: string): Promise<MarketingCampaign | null> {
  const { data, error } = await (supabase as any)
    .from("marketing_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeRow(data) : null;
}

export interface SaveCampaignPayload {
  id?: string;
  tenantId: string;
  companyId: string;
  strategyId?: string | null;
  name: string;
  objective?: string | null;
  status?: CampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
  city?: string | null;
  state?: string | null;
  regionLabel?: string | null;
  radiusKm?: string | number | null;
  channels?: string[];
  paidTrafficBudget?: string | number | null;
  acquisitionStrategy?: string | null;
  observations?: string | null;
}

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

export async function saveCampaign(
  payload: SaveCampaignPayload,
): Promise<{ success: boolean; message?: string; id?: string }> {
  const invalid = validateCampaignInput({
    name: payload.name,
    status: payload.status,
    startDate: payload.startDate,
    endDate: payload.endDate,
    radiusKm: payload.radiusKm,
    paidTrafficBudget: payload.paidTrafficBudget,
  });
  if (invalid) return { success: false, message: invalid };

  const row: Record<string, unknown> = {
    tenant_id: payload.tenantId,
    company_id: payload.companyId,
    strategy_id: payload.strategyId || null,
    name: payload.name.trim(),
    objective: clean(payload.objective),
    status: payload.status || "planning",
    start_date: payload.startDate || null,
    end_date: payload.endDate || null,
    city: clean(payload.city),
    state: clean(payload.state),
    region_label: clean(payload.regionLabel),
    radius_km: parseNumber(payload.radiusKm),
    channels: payload.channels ?? [],
    paid_traffic_budget: parseNumber(payload.paidTrafficBudget),
    acquisition_strategy: clean(payload.acquisitionStrategy),
    observations: clean(payload.observations),
  };

  if (payload.id) {
    const { error } = await (supabase as any)
      .from("marketing_campaigns")
      .update(row)
      .eq("id", payload.id);
    if (error) return { success: false, message: error.message };
    return { success: true, id: payload.id };
  }

  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any)
    .from("marketing_campaigns")
    .insert({ ...row, created_by: auth?.user?.id ?? null })
    .select("id")
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  return { success: true, id: data?.id };
}

export async function deleteCampaign(id: string): Promise<{ success: boolean; message?: string }> {
  const { error } = await (supabase as any).from("marketing_campaigns").delete().eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export interface CampaignMediaSummary {
  periods: { id: string; period_title: string | null; period_start: string | null; period_end: string | null; status: string | null }[];
  demandsTotal: number;
  demandsBoosted: number;
  demandsPublished: number;
}

/** Números de Mídia da campanha: períodos vinculados e demandas geradas. */
export async function loadCampaignMedia(
  tenantId: string,
  campaignId: string,
): Promise<CampaignMediaSummary> {
  const { data: periods, error: perErr } = await (supabase as any)
    .from("period_plans")
    .select("id, period_title, period_start, period_end, status")
    .eq("tenant_id", tenantId)
    .eq("campaign_id", campaignId)
    .order("period_start", { ascending: false });
  if (perErr) throw perErr;
  const ids = (periods || []).map((p: any) => p.id);
  if (ids.length === 0) {
    return { periods: periods || [], demandsTotal: 0, demandsBoosted: 0, demandsPublished: 0 };
  }
  const { data: demands, error: demErr } = await supabase
    .from("demands")
    .select("id, ad_plan, published_at, work_area")
    .eq("tenant_id", tenantId)
    .in("period_plan_id", ids);
  if (demErr) throw demErr;
  const rows = (demands || []) as any[];
  return {
    periods: periods || [],
    demandsTotal: rows.length,
    demandsBoosted: rows.filter((d) => !!d.ad_plan && (d.ad_plan as any).boost === true).length,
    demandsPublished: rows.filter((d) => !!d.published_at).length,
  };
}

export interface CampaignCommercialSummary {
  total: number;
  prospects: number;
  customers: number;
  won: number;
  lost: number;
}

/** Números do Comercial: prospects/clientes atribuídos à campanha. */
export function summarizeCampaignCommercial(
  rows: { lifecycle?: string | null; commercial_stage?: string | null }[],
): CampaignCommercialSummary {
  const list = rows || [];
  return {
    total: list.length,
    prospects: list.filter((r) => r.lifecycle === "prospect").length,
    customers: list.filter((r) => r.lifecycle === "customer").length,
    won: list.filter((r) => r.commercial_stage === "ganho").length,
    lost: list.filter((r) => r.commercial_stage === "perdido").length,
  };
}

export async function loadCampaignCommercial(tenantId: string, campaignId: string) {
  const { data, error } = await (supabase as any)
    .from("systems_clients")
    .select("id, name, lifecycle, commercial_stage, city, next_action, next_action_at")
    .eq("tenant_id", tenantId)
    .eq("acquisition_campaign_id", campaignId)
    .order("name");
  if (error) throw error;
  return (data || []) as any[];
}
