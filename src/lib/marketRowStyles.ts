import { isBaseMarket, type ExpansionMarket } from "@/lib/expansionMarkets";

/**
 * HIERARQUIA VISUAL ÚNICA DAS LINHAS DE CIDADE (Mídia paga e Comercial).
 *
 * A mesma linha universal serve BASE e EXPANSÃO: o que muda é apenas o peso
 * visual, nunca a estrutura da tabela. Helpers puros para permitir teste.
 */

export type MarketRowTone = "active" | "base" | "planning" | "paused" | "completed" | "cancelled";

export function marketRowTone(market: Pick<ExpansionMarket, "market_type" | "status">): MarketRowTone {
  const status = market.status || "planning";
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "paused") return "paused";
  if (status === "active" && !isBaseMarket(market)) return "active";
  if (isBaseMarket(market)) return "base";
  return "planning";
}

/** Classes da `<tr>` da cidade — praça atual em destaque leve, base neutra. */
export function marketRowClass(market: Pick<ExpansionMarket, "market_type" | "status">): string {
  switch (marketRowTone(market)) {
    case "active":
      return "border-l-[3px] border-l-primary bg-primary/5";
    case "base":
      return "bg-muted/20";
    case "paused":
      return "bg-muted/30";
    case "completed":
      return "opacity-75";
    case "cancelled":
      return "bg-muted/40 text-muted-foreground";
    default:
      return "";
  }
}

/** Selo curto da linha: `ATUAL` para a praça ativa, `BASE` neutro. */
export function marketRowBadge(
  market: Pick<ExpansionMarket, "market_type" | "status">,
): { label: string; className: string } | null {
  const tone = marketRowTone(market);
  if (tone === "active") {
    return { label: "ATUAL", className: "border-primary/40 bg-primary/10 text-primary" };
  }
  if (tone === "base") {
    return { label: "BASE", className: "border-border bg-muted text-muted-foreground" };
  }
  return null;
}

/** Cidade cujo status ainda é planejamento: números com menos peso. */
export function isPlanningTone(market: Pick<ExpansionMarket, "market_type" | "status">): boolean {
  return marketRowTone(market) === "planning";
}
