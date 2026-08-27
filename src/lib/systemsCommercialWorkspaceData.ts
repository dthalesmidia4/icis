/**
 * CARGA ÚNICA DO WORKSPACE COMERCIAL DE SISTEMAS.
 *
 * Antes a tela fazia companies + prospects + customers + campaigns + markets +
 * último contato + touchpoints em várias requests (e, com empresa travada,
 * ainda lia plano por plano). Agora é UMA chamada: `get_systems_commercial_workspace_v1`.
 *
 * O RPC já filtra por empresa quando `p_company_id` é informado — nada de
 * carga global filtrada no browser.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeMarket, sortExpansionMarkets, type ExpansionMarket } from "@/lib/expansionMarkets";
import { normalizeCampaignRow, type MarketingCampaign } from "@/lib/marketingCampaigns";
import type { LastTouch } from "@/lib/systemsCommercial";
import type { MarketTouchpoint } from "@/lib/commercialMarketActivity";
import type { SystemsClient, SystemsCompany } from "@/lib/systemsClients";

export interface SystemsCommercialWorkspaceData {
  companies: SystemsCompany[];
  prospects: SystemsClient[];
  customers: SystemsClient[];
  campaigns: MarketingCampaign[];
  markets: ExpansionMarket[];
  /** Último contato por subcliente, pronto para `buildOpportunityRows`. */
  lastTouches: Map<string, LastTouch>;
  /** Execução real da carteira (client_touchpoints do escopo). */
  touchpoints: MarketTouchpoint[];
}

const EMPTY: SystemsCommercialWorkspaceData = {
  companies: [],
  prospects: [],
  customers: [],
  campaigns: [],
  markets: [],
  lastTouches: new Map(),
  touchpoints: [],
};

export function mapWorkspacePayload(payload: any): SystemsCommercialWorkspaceData {
  if (!payload) return EMPTY;
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  const lastTouches = new Map<string, LastTouch>();
  arr(payload.last_touches).forEach((t) => {
    if (!t?.subclient_id || lastTouches.has(t.subclient_id)) return;
    lastTouches.set(String(t.subclient_id), {
      type: t.touchpoint_type,
      occurredAt: t.occurred_at,
    });
  });
  return {
    companies: arr(payload.companies) as SystemsCompany[],
    prospects: arr(payload.prospects) as SystemsClient[],
    customers: arr(payload.customers) as SystemsClient[],
    campaigns: arr(payload.campaigns).map(normalizeCampaignRow),
    markets: sortExpansionMarkets(arr(payload.markets).map(normalizeMarket)),
    lastTouches,
    touchpoints: arr(payload.touchpoints) as MarketTouchpoint[],
  };
}

export async function loadSystemsCommercialWorkspace(
  tenantId: string,
  companyId?: string | null,
): Promise<SystemsCommercialWorkspaceData> {
  const { data, error } = await (supabase as any).rpc("get_systems_commercial_workspace_v1", {
    p_tenant_id: tenantId,
    p_company_id: companyId || null,
  });
  if (error) throw error;
  return mapWorkspacePayload(data);
}
