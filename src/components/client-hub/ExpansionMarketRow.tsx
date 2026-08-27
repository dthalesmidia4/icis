import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isBaseMarket,
  marketBudgetLabel,
  marketDate,
  marketDistanceLabel,
  marketLabel,
  marketOrderLabel,
  marketStatusLabel,
  marketTargetLabel,
  marketVisitWindow,
  marketWindow,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import type { MarketCommercialStats } from "@/lib/commercialMarketActivity";

/**
 * Faixa VERTICAL de uma praça (base ou cidade da expansão). Nada de tabela
 * horizontal: os campos quebram linha e `Editar`/chevron ficam sempre visíveis.
 */
export default function ExpansionMarketRow({
  market,
  stats,
  open,
  onToggle,
  onEdit,
  onOpenPaidMedia,
  children,
}: {
  market: ExpansionMarket;
  stats: MarketCommercialStats;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onOpenPaidMedia?: () => void;
  children?: React.ReactNode;
}) {
  const base = isBaseMarket(market);
  const isCurrent = market.status === "active";
  return (
    <div className={cn("border-b", isCurrent && !base && "bg-primary/5")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em]",
                base ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
              )}
            >
              {marketOrderLabel(market)}
            </span>
            <span className="text-sm font-black">{marketLabel(market)}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              {marketStatusLabel(market.status)}
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.opportunities} oportunidades
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.negotiating} em avaliação/negociação
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.won} ganhos · {stats.customers} clientes
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.calls} ligações · {stats.visits} visitas · {stats.demos} demonstrações
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {!base && <Chip label="Distância" value={marketDistanceLabel(market.travel_distance_km)} />}
            {!base && <Chip label="Meta" value={marketTargetLabel(market.target_accounts)} />}
            <Chip label="Verba" value={marketBudgetLabel(market.paid_traffic_budget)} />
            <Chip label="Anúncios" value={marketWindow(market.ads_start_date, market.ads_end_date)} />
            <Chip label="Ligações" value={marketDate(market.calls_start_date)} />
            <Chip
              label="Visitas"
              value={marketVisitWindow(market.visits_start_date, market.visits_end_date)}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="text-xs" onClick={onEdit}>
            Editar
          </Button>
          {onOpenPaidMedia && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onOpenPaidMedia}>
              Mídia paga
            </Button>
          )}
          <button
            type="button"
            aria-label={open ? "Recolher praça" : "Expandir praça"}
            onClick={onToggle}
            className="inline-flex h-8 w-8 items-center justify-center text-primary"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
      </div>
      {open && <div className="pb-5">{children}</div>}
    </div>
  );
}

const Chip = ({ label, value }: { label: string; value: string }) => (
  <span className="whitespace-nowrap">
    <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label} </span>
    <span className="tabular-nums text-foreground">{value}</span>
  </span>
);
