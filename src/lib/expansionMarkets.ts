import { supabase } from "@/integrations/supabase/client";
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_OPTIONS,
  isCampaignClosed,
  parseNumber,
  placeBudgetLabel,
  placeDate,
  placeDistanceLabel,
  placeTargetLabel,
  placeVisitWindow,
  placeWindow,
  type CampaignStatus,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";

/**
 * PLANO DE EXPANSÃO REGIONAL (1) × CIDADES/ETAPAS (N).
 *
 * `marketing_campaigns` = o PLANO único do cliente (nome, status, objetivo,
 * estratégia geral). NÃO carrega cidade, verba ou datas de execução.
 * `marketing_campaign_markets` = as cidades/etapas do plano, cada uma com sua
 * própria distância, meta, verba e janelas de anúncios/ligações/visitas.
 *
 * O ciclo editorial (`period_plans`) e as peças (`demands`) continuam únicos:
 * nenhuma cidade duplica conteúdo. A distribuição por cidade vive em
 * `paid_media_activations.market_id`; a origem comercial em
 * `systems_clients.acquisition_market_id`.
 */

export type MarketStatus = CampaignStatus;

/**
 * `base` = praça comercial JÁ existente (não é etapa de expansão e nunca ocupa
 * número). `expansion` = cidade numerada da sequência de expansão.
 */
export type MarketType = "base" | "expansion";

export const MARKET_STATUS_LABEL = CAMPAIGN_STATUS_LABEL;
export const MARKET_STATUS_OPTIONS = CAMPAIGN_STATUS_OPTIONS;

export interface ExpansionMarket {
  id: string;
  tenant_id: string;
  company_id: string;
  campaign_id: string;
  market_type: MarketType;
  sequence_order: number | null;
  city: string;
  state: string;
  region_label: string | null;
  status: MarketStatus;
  objective: string | null;
  /** Deslocamento logístico comercial até a cidade (km). */
  travel_distance_km: number | null;
  /** Meta de alvos a mapear na cidade. */
  target_accounts: number | null;
  paid_traffic_budget: number | null;
  ads_start_date: string | null;
  ads_end_date: string | null;
  calls_start_date: string | null;
  visits_start_date: string | null;
  visits_end_date: string | null;
  channels: string[];
  acquisition_strategy: string | null;
  observations: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


export const TBD = "A definir";

export function marketStatusLabel(status?: string | null): string {
  if (!status) return "—";
  return MARKET_STATUS_LABEL[status as MarketStatus] || status;
}

export function isMarketClosed(status?: string | null): boolean {
  return isCampaignClosed(status);
}

/** Base existente → `BASE`. Expansão → `01`, `02`, … (nunca índice fictício). */
export function marketOrderLabel(
  market: Pick<ExpansionMarket, "sequence_order" | "market_type">,
  index?: number,
): string {
  if (isBaseMarket(market)) return "BASE";
  const n = market.sequence_order ?? (typeof index === "number" ? index + 1 : null);
  if (n === null) return "—";
  return String(n).padStart(2, "0");
}

export function isBaseMarket(market: Pick<ExpansionMarket, "market_type">): boolean {
  return market.market_type === "base";
}

/** Bases existentes, ordem estável por cidade e depois created_at. */
export function baseMarketsOf(markets: ExpansionMarket[]): ExpansionMarket[] {
  return (markets || [])
    .filter(isBaseMarket)
    .sort(
      (a, b) =>
        marketLabel(a).localeCompare(marketLabel(b), "pt-BR") ||
        (a.created_at || "").localeCompare(b.created_at || ""),
    );
}

/** Somente cidades de expansão, numeradas por sequence_order ASC (nulls last). */
export function expansionMarketsOf(markets: ExpansionMarket[]): ExpansionMarket[] {
  return sortExpansionMarkets((markets || []).filter((m) => !isBaseMarket(m)));
}

/** Cidade/UF humanizada. */
export function marketLabel(
  m: Pick<ExpansionMarket, "city" | "state" | "region_label">,
): string {
  const place = [m.city, m.state].filter((v) => v && String(v).trim()).join("/");
  if (place) return place;
  return (m.region_label || "").trim() || "Cidade";
}

// Rótulos visuais reaproveitados (mesma linguagem de `A definir`).
export {
  placeBudgetLabel as marketBudgetLabel,
  placeDistanceLabel as marketDistanceLabel,
  placeTargetLabel as marketTargetLabel,
  placeVisitWindow as marketVisitWindow,
  placeWindow as marketWindow,
  placeDate as marketDate,
};

/** Ordem operacional: bases primeiro, depois expansão por sequence_order. */
export function sortExpansionMarkets(rows: ExpansionMarket[]): ExpansionMarket[] {
  return [...(rows || [])].sort((a, b) => {
    const ba = isBaseMarket(a) ? 0 : 1;
    const bb = isBaseMarket(b) ? 0 : 1;
    if (ba !== bb) return ba - bb;
    const sa = a.sequence_order ?? Number.POSITIVE_INFINITY;
    const sb = b.sequence_order ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

export interface ExpansionPlanSummary {
  /** Praças comerciais já existentes (ex.: Bebedouro/SP). */
  baseMarkets: ExpansionMarket[];
  /** Cidades numeradas da sequência de expansão. */
  expansionMarkets: ExpansionMarket[];
  totalExpansionCities: number;
  /** Soma das metas conhecidas de EXPANSÃO (null NUNCA vira zero). */
  totalTargetAccounts: number;
  targetsUndefined: number;
  /** Soma das verbas conhecidas de EXPANSÃO. */
  totalBudget: number;
  budgetUndefined: number;
  currentMarket: ExpansionMarket | null;
  completedMarkets: number;
}

/**
 * Resumo do PLANO. Base NÃO conta como etapa de expansão e não entra em
 * nenhuma soma nem em `a definir`. Valores null são sinalizados, não somados.
 */
export function summarizeExpansionPlan(markets: ExpansionMarket[]): ExpansionPlanSummary {
  const bases = baseMarketsOf(markets || []);
  const list = expansionMarketsOf(markets || []);
  const known = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;
  return {
    baseMarkets: bases,
    expansionMarkets: list,
    totalExpansionCities: list.length,
    totalTargetAccounts: list.reduce((s, m) => s + (known(m.target_accounts) ? m.target_accounts : 0), 0),
    targetsUndefined: list.filter((m) => !known(m.target_accounts)).length,
    totalBudget: list.reduce((s, m) => s + (known(m.paid_traffic_budget) ? m.paid_traffic_budget : 0), 0),
    budgetUndefined: list.filter((m) => !known(m.paid_traffic_budget)).length,
    currentMarket: list.find((m) => m.status === "active") || null,
    completedMarkets: list.filter((m) => m.status === "completed").length,
  };
}


/** `20 + 3 metas a definir` — nunca mascara null como zero. */
export function undefinedSuffix(count: number, noun: string): string {
  if (count <= 0) return "";
  return ` + ${count} ${noun}${count === 1 ? "" : "s"} a definir`;
}

export interface ExpansionMarketInput {
  id?: string;
  tenantId: string;
  companyId: string;
  campaignId: string;
  sequenceOrder?: string | number | null;
  city: string;
  state: string;
  status?: MarketStatus;
  objective?: string | null;
  travelDistanceKm?: string | number | null;
  targetAccounts?: string | number | null;
  paidTrafficBudget?: string | number | null;
  adsStartDate?: string | null;
  adsEndDate?: string | null;
  callsStartDate?: string | null;
  visitsStartDate?: string | null;
  visitsEndDate?: string | null;
  channels?: string[];
  acquisitionStrategy?: string | null;
  observations?: string | null;
}

/** Validação pura da CIDADE — usada pela UI e pelos testes. */
export function validateExpansionMarketInput(input: Partial<ExpansionMarketInput>): string | null {
  if (!input.city || !String(input.city).trim()) return "Informe a cidade.";
  if (!input.state || !String(input.state).trim()) return "Informe o estado.";
  if (!input.campaignId) return "Plano de expansão não encontrado.";
  if (input.status && !MARKET_STATUS_OPTIONS.some((o) => o.value === input.status)) {
    return "Status da cidade inválido.";
  }
  const seq = parseNumber(input.sequenceOrder);
  if (seq !== null && seq < 1) return "A ordem da cidade deve ser 1 ou maior.";
  const distance = parseNumber(input.travelDistanceKm);
  if (distance !== null && distance < 0) return "A distância logística não pode ser negativa.";
  const targets = parseNumber(input.targetAccounts);
  if (targets !== null && targets < 0) return "A meta de alvos não pode ser negativa.";
  const budget = parseNumber(input.paidTrafficBudget);
  if (budget !== null && budget < 0) return "O investimento não pode ser negativo.";
  if (input.adsStartDate && input.adsEndDate && input.adsEndDate < input.adsStartDate) {
    return "O fim dos anúncios deve ser posterior ao início.";
  }
  if (input.visitsStartDate && input.visitsEndDate && input.visitsEndDate < input.visitsStartDate) {
    return "O fim das visitas deve ser posterior ao início.";
  }
  return null;
}

const clean = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : null);

/** Linha pronta para `marketing_campaign_markets` — nunca toca marketing_campaigns. */
export function buildMarketRow(input: ExpansionMarketInput): Record<string, unknown> {
  const city = input.city.trim();
  const state = input.state.trim().toUpperCase();
  return {
    tenant_id: input.tenantId,
    company_id: input.companyId,
    campaign_id: input.campaignId,
    sequence_order: parseNumber(input.sequenceOrder),
    city,
    state,
    region_label: `${city}/${state}`,
    status: input.status || "planning",
    objective: clean(input.objective),
    travel_distance_km: parseNumber(input.travelDistanceKm),
    target_accounts: parseNumber(input.targetAccounts),
    paid_traffic_budget: parseNumber(input.paidTrafficBudget),
    ads_start_date: input.adsStartDate || null,
    ads_end_date: input.adsEndDate || null,
    calls_start_date: input.callsStartDate || null,
    visits_start_date: input.visitsStartDate || null,
    visits_end_date: input.visitsEndDate || null,
    channels: input.channels ?? [],
    acquisition_strategy: clean(input.acquisitionStrategy),
    observations: clean(input.observations),
  };
}

const normalizeMarket = (row: any): ExpansionMarket => ({
  ...row,
  channels: Array.isArray(row?.channels) ? row.channels.map((c: unknown) => String(c)) : [],
  status: (row?.status || "planning") as MarketStatus,
});

/**
 * Plano vigente do cliente: prioriza `active`, depois o mais recente aberto.
 * Nunca cria plano automaticamente.
 */
export function pickExpansionPlan(plans: MarketingCampaign[]): MarketingCampaign | null {
  const list = plans || [];
  if (list.length === 0) return null;
  const open = list.filter((p) => !isCampaignClosed(p.status));
  const pool = open.length > 0 ? open : list;
  return [...pool].sort((a, b) => {
    const sa = a.status === "active" ? 0 : 1;
    const sb = b.status === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (b.created_at || "").localeCompare(a.created_at || "");
  })[0];
}

export async function loadExpansionPlan(
  tenantId: string,
  companyId: string,
): Promise<MarketingCampaign | null> {
  const { data, error } = await (supabase as any)
    .from("marketing_campaigns")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("company_id", companyId);
  if (error) throw error;
  const plans = (data || []).map((row: any) => ({
    ...row,
    channels: Array.isArray(row?.channels) ? row.channels.map((c: unknown) => String(c)) : [],
    status: (row?.status || "planning") as CampaignStatus,
  })) as MarketingCampaign[];
  return pickExpansionPlan(plans);
}

export async function loadExpansionMarkets(
  tenantId: string,
  companyId: string,
  campaignId?: string | null,
): Promise<ExpansionMarket[]> {
  let query = (supabase as any)
    .from("marketing_campaign_markets")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("company_id", companyId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  if (error) throw error;
  return sortExpansionMarkets((data || []).map(normalizeMarket));
}

export async function saveExpansionMarket(
  input: ExpansionMarketInput,
): Promise<{ success: boolean; message?: string; id?: string }> {
  const invalid = validateExpansionMarketInput(input);
  if (invalid) return { success: false, message: invalid };
  const row = buildMarketRow(input);

  if (input.id) {
    const { error } = await (supabase as any)
      .from("marketing_campaign_markets")
      .update(row)
      .eq("id", input.id);
    if (error) return { success: false, message: error.message };
    return { success: true, id: input.id };
  }

  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any)
    .from("marketing_campaign_markets")
    .insert({ ...row, created_by: auth?.user?.id ?? null })
    .select("id")
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  return { success: true, id: data?.id };
}

export interface ExpansionPlanConfigInput {
  name: string;
  status?: MarketStatus;
  objective?: string | null;
  acquisitionStrategy?: string | null;
  observations?: string | null;
}

/** Configuração do PLANO: só identidade e estratégia — nada de cidade/verba/datas. */
export function validatePlanConfigInput(input: Partial<ExpansionPlanConfigInput>): string | null {
  if (!input.name || !String(input.name).trim()) return "Informe o nome do plano.";
  if (input.status && !MARKET_STATUS_OPTIONS.some((o) => o.value === input.status)) {
    return "Status do plano inválido.";
  }
  return null;
}

export const PLAN_EDITABLE_COLUMNS = [
  "name",
  "status",
  "objective",
  "acquisition_strategy",
  "observations",
] as const;

export function buildPlanConfigRow(input: ExpansionPlanConfigInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    status: input.status || "active",
    objective: clean(input.objective),
    acquisition_strategy: clean(input.acquisitionStrategy),
    observations: clean(input.observations),
  };
}

export async function saveExpansionPlanConfig(
  planId: string,
  input: ExpansionPlanConfigInput,
): Promise<{ success: boolean; message?: string }> {
  const invalid = validatePlanConfigInput(input);
  if (invalid) return { success: false, message: invalid };
  const { error } = await (supabase as any)
    .from("marketing_campaigns")
    .update(buildPlanConfigRow(input))
    .eq("id", planId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
