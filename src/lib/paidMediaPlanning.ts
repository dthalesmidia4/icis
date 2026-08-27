import {
  expansionMarketsOf,
  isBaseMarket,
  sortExpansionMarkets,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import { isActivationCancelled, type PaidMediaActivation } from "@/lib/paidMediaActivations";

/**
 * MÍDIA PAGA EM DOIS NÍVEIS — helpers puros.
 *
 * Nível 1 (PLANEJAMENTO DA PRAÇA): cada cidade do plano regional já tem verba e
 * janela de anúncios próprias (`marketing_campaign_markets`).
 * Nível 2 (ALOCAÇÃO): cada peça que roda naquela cidade
 * (`paid_media_activations`) consome parte dessa verba.
 *
 * Zero ativações NUNCA significa zero planejamento: o planejado da praça é
 * mostrado mesmo sem nenhuma peça alocada. Valores nulos são sinalizados como
 * "a definir" e jamais somados como zero.
 */

const known = (v: number | null | undefined): v is number => v !== null && v !== undefined;

export interface PaidMediaPlanTotals {
  /** Soma das verbas conhecidas das cidades de expansão. */
  plannedKnown: number;
  /** Cidades de expansão sem verba definida. */
  plannedUndefined: number;
  /** Soma das verbas conhecidas das ativações não canceladas. */
  allocatedKnown: number;
  /** Ativações não canceladas sem verba definida. */
  allocatedUndefined: number;
  /** Saldo conhecido = planejado conhecido − alocado conhecido. */
  balanceKnown: number;
  /** Cidades com JANELA PLANEJADA definida (início e fim) — não é status. */
  scheduledCities: number;
  /** Ativações não canceladas. */
  activations: number;
}

export function summarizePaidMediaPlan(
  markets: ExpansionMarket[],
  activations: PaidMediaActivation[],
): PaidMediaPlanTotals {
  const cities = expansionMarketsOf(markets || []);
  const live = (activations || []).filter((a) => !isActivationCancelled(a.status));
  const plannedKnown = cities.reduce(
    (s, m) => s + (known(m.paid_traffic_budget) ? m.paid_traffic_budget : 0),
    0,
  );
  const allocatedKnown = live.reduce((s, a) => s + (known(a.budget) ? a.budget : 0), 0);
  return {
    plannedKnown,
    plannedUndefined: cities.filter((m) => !known(m.paid_traffic_budget)).length,
    allocatedKnown,
    allocatedUndefined: live.filter((a) => !known(a.budget)).length,
    balanceKnown: plannedKnown - allocatedKnown,
    scheduledCities: cities.filter((m) => !!m.ads_start_date && !!m.ads_end_date).length,
    activations: live.length,
  };
}

export interface MarketPaidMediaRow {
  market: ExpansionMarket;
  /** Verba planejada da praça (null = a definir). */
  planned: number | null;
  /** Verba alocada em ativações não canceladas (sempre número). */
  allocated: number;
  /** Ativações não canceladas sem verba definida. */
  allocatedUndefined: number;
  /** Saldo conhecido; null quando a verba da praça é a definir. */
  available: number | null;
  /** Peças (demands) DISTINTAS vinculadas à praça, sem contar canceladas. */
  linkedDemands: number;
  activations: PaidMediaActivation[];
}

/**
 * Uma linha por cidade, na ordem da sequência. A BASE só entra no plano pago
 * quando realmente tem verba, janela ou ativação — nunca é inventada.
 */
export function buildPaidMediaMarketRows(
  markets: ExpansionMarket[],
  activations: PaidMediaActivation[],
): MarketPaidMediaRow[] {
  const live = (activations || []).filter((a) => !isActivationCancelled(a.status));
  const byMarket = new Map<string, PaidMediaActivation[]>();
  (activations || []).forEach((a) => {
    if (!a.market_id) return;
    const list = byMarket.get(a.market_id) || [];
    list.push(a);
    byMarket.set(a.market_id, list);
  });

  const relevant = sortExpansionMarkets(markets || []).filter((m) => {
    if (!isBaseMarket(m)) return true;
    const hasActivation = live.some((a) => a.market_id === m.id);
    return (
      hasActivation ||
      known(m.paid_traffic_budget) ||
      !!m.ads_start_date ||
      !!m.ads_end_date
    );
  });

  return relevant.map((market) => {
    const all = byMarket.get(market.id) || [];
    const liveRows = all.filter((a) => !isActivationCancelled(a.status));
    const allocated = liveRows.reduce((s, a) => s + (known(a.budget) ? a.budget : 0), 0);
    const planned = known(market.paid_traffic_budget) ? market.paid_traffic_budget : null;
    return {
      market,
      planned,
      allocated,
      allocatedUndefined: liveRows.filter((a) => !known(a.budget)).length,
      available: planned === null ? null : planned - allocated,
      linkedDemands: new Set(liveRows.map((a) => a.demand_id)).size,
      activations: all,
    };
  });
}

/**
 * A PLANILHA EDITA O SALDO, O BANCO GUARDA A VERBA.
 *
 * A visão principal mostra só `Disponível`. A contabilidade interna continua
 * `available = paid_traffic_budget - allocated`, então gravar um saldo novo é
 * gravar `paid_traffic_budget = novoDisponivel + allocated`: as peças já
 * alocadas seguem preservadas e o saldo passa a valer exatamente o digitado.
 * Saldo vazio (`null`) volta a verba para "a definir" — nunca para zero.
 */
export function budgetFromAvailable(
  newAvailable: number | null,
  allocated: number,
): number | null {
  if (newAvailable === null || newAvailable === undefined) return null;
  return newAvailable + (allocated || 0);
}

/**
 * Praça padrão de uma NOVA ativação: cidade de expansão ativa de menor ordem;
 * senão a primeira cidade de expansão. A BASE nunca é default.
 */
export function defaultActivationMarketId(markets: ExpansionMarket[]): string {
  const cities = expansionMarketsOf(markets || []);
  const active = cities.find((m) => m.status === "active");
  return (active || cities[0])?.id || "";
}

