import { supabase } from "@/integrations/supabase/client";
import { STAGE_OPTIONS, type SystemsClient } from "@/lib/systemsClients";

/**
 * Leitura territorial do MESMO registro comercial (`systems_clients`).
 * Nada é copiado: a aba Expansão apenas apresenta os leads que o Comercial
 * já trabalha, agrupados pela carteira operacional (`market_id`).
 *
 * A execução comercial real (ligações, visitas, demonstrações) vem de
 * `client_touchpoints`, que já existe — nunca de uma tabela nova.
 */
export type MarketLead = Pick<
  SystemsClient,
  | "id"
  | "name"
  | "city"
  | "state"
  | "lifecycle"
  | "commercial_stage"
  | "current_system"
  | "next_action"
  | "next_action_at"
  | "last_contact_result"
  | "market_id"
  | "acquisition_market_id"
  | "lead_source"
  | "parent_company_id"
>;

export interface MarketTouchpoint {
  subclient_id: string | null;
  touchpoint_type: string;
  occurred_at: string;
}

export interface MarketCommercialStats {
  total: number;
  negotiating: number;
  won: number;
  customers: number;
  stages: Record<string, number>;
  /** Execução real registrada em client_touchpoints. */
  calls: number;
  visits: number;
  demos: number;
  lastTouchAt: string | null;
}

export const EMPTY_MARKET_STATS: MarketCommercialStats = {
  total: 0,
  negotiating: 0,
  won: 0,
  customers: 0,
  stages: {},
  calls: 0,
  visits: 0,
  demos: 0,
  lastTouchAt: null,
};

/** Leads agrupados pela carteira operacional. `market_id` nulo fica de fora. */
export function groupLeadsByMarket(leads: MarketLead[]): Map<string, MarketLead[]> {
  const map = new Map<string, MarketLead[]>();
  (leads || []).forEach((lead) => {
    if (!lead.market_id) return;
    const list = map.get(lead.market_id) || [];
    list.push(lead);
    map.set(lead.market_id, list);
  });
  map.forEach((list) =>
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  );
  return map;
}

/** Leads sem carteira: nunca atribuídos automaticamente, apenas sinalizados. */
export function leadsWithoutMarket(leads: MarketLead[]): MarketLead[] {
  return (leads || []).filter((l) => !l.market_id);
}

/**
 * Agregação pura por cidade/carteira. Ligações/visitas/demonstrações são
 * contadas a partir dos touchpoints REALIZADOS, jamais das janelas planejadas.
 */
export function summarizeMarketCommercial(
  leads: MarketLead[],
  touchpoints: MarketTouchpoint[] = [],
): Map<string, MarketCommercialStats> {
  const byMarket = groupLeadsByMarket(leads);
  const marketOfLead = new Map<string, string>();
  byMarket.forEach((list, marketId) => list.forEach((l) => marketOfLead.set(l.id, marketId)));

  const stats = new Map<string, MarketCommercialStats>();
  byMarket.forEach((list, marketId) => {
    const stages: Record<string, number> = {};
    STAGE_OPTIONS.forEach(({ value }) => {
      stages[value] = list.filter((l) => l.commercial_stage === value).length;
    });
    stats.set(marketId, {
      total: list.length,
      negotiating: (stages.avaliacao || 0) + (stages.negociacao || 0),
      won: stages.ganho || 0,
      customers: list.filter((l) => l.lifecycle === "customer").length,
      stages,
      calls: 0,
      visits: 0,
      demos: 0,
      lastTouchAt: null,
    });
  });

  (touchpoints || []).forEach((tp) => {
    const marketId = tp.subclient_id ? marketOfLead.get(tp.subclient_id) : undefined;
    if (!marketId) return;
    const current = stats.get(marketId);
    if (!current) return;
    if (tp.touchpoint_type === "ligacao") current.calls += 1;
    if (tp.touchpoint_type === "visita") current.visits += 1;
    if (tp.touchpoint_type === "demonstracao") current.demos += 1;
    if (!current.lastTouchAt || tp.occurred_at > current.lastTouchAt) {
      current.lastTouchAt = tp.occurred_at;
    }
  });

  return stats;
}

const LEAD_COLUMNS =
  "id, name, city, state, lifecycle, commercial_stage, current_system, next_action, next_action_at, last_contact_result, market_id, acquisition_market_id, lead_source, parent_company_id";

/** Os MESMOS registros do Comercial, restritos ao tenant e à empresa/produto. */
export async function loadMarketLeads(
  tenantId: string,
  companyId: string,
): Promise<MarketLead[]> {
  const { data, error } = await (supabase as any)
    .from("systems_clients")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("parent_company_id", companyId)
    .order("name");
  if (error) throw error;
  return (data || []) as MarketLead[];
}

/** Touchpoints já existentes dos leads carregados (sem tabela nova). */
export async function loadMarketTouchpoints(
  subclientIds: string[],
): Promise<MarketTouchpoint[]> {
  const ids = Array.from(new Set((subclientIds || []).filter(Boolean)));
  if (ids.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from("client_touchpoints")
    .select("subclient_id, touchpoint_type, occurred_at")
    .in("subclient_id", ids);
  if (error) throw error;
  return (data || []) as MarketTouchpoint[];
}
