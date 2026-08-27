import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  expansionMarketsOf,
  isBaseMarket,
  loadExpansionMarkets,
  loadExpansionPlan,
  marketDistanceLabel,
  marketLabel,
  marketOrderLabel,
  marketStatusLabel,
  marketTargetLabel,
  sortExpansionMarkets,
  summarizeExpansionPlan,
  undefinedSuffix,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import PlaceFormModal from "./PlaceFormModal";
import PlanConfigModal from "./PlanConfigModal";

interface Props {
  tenantId?: string | null;
  companyId?: string | null;
  /** Cidade em foco pelo deep link (`?market=`). */
  selectedMarketId?: string | null;
  /** Leva para a aba Mídia paga com a cidade em foco. */
  onOpenPaidMedia?: (marketId: string) => void;
  /** Leva para a aba Comercial com a carteira em foco. */
  onOpenCommercial?: (marketId?: string) => void;
}

/**
 * PLANO REGIONAL DENTRO DA ESTRATÉGIA.
 *
 * Esta é a leitura de POSICIONAMENTO: um único plano
 * (`marketing_campaigns`) com a base comercial existente e as cidades
 * numeradas da expansão. Verba/anúncios pertencem à aba Mídia paga; ligações,
 * visitas e leads pertencem à aba Comercial — nada disso aparece aqui.
 */
export default function RegionalPlanTable({
  tenantId,
  companyId,
  selectedMarketId,
  onOpenPaidMedia,
  onOpenCommercial,
}: Props) {
  const [plan, setPlan] = useState<MarketingCampaign | null>(null);
  const [markets, setMarkets] = useState<ExpansionMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpansionMarket | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !companyId) {
      setPlan(null);
      setMarkets([]);
      return;
    }
    setLoading(true);
    try {
      const found = await loadExpansionPlan(tenantId, companyId);
      setPlan(found);
      setMarkets(found ? await loadExpansionMarkets(tenantId, companyId, found.id) : []);
    } catch (err) {
      console.error("[RegionalPlanTable] plano regional", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => sortExpansionMarkets(markets), [markets]);
  const summary = useMemo(() => summarizeExpansionPlan(markets), [markets]);
  const nextOrder = expansionMarketsOf(markets).length + 1;

  if (!plan) {
    return (
      <section>
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Plano regional
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          {loading
            ? "Carregando o plano regional…"
            : "Este cliente ainda não tem um plano regional cadastrado."}
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Plano regional
          </h2>
          <p className="mt-1 text-lg font-black leading-tight">{plan.name}</p>
          <p className="text-xs text-muted-foreground">
            {summary.baseMarkets.length > 0
              ? `${summary.baseMarkets.length} base + ${summary.totalExpansionCities} cidades de expansão · `
              : `${summary.totalExpansionCities} cidades de expansão · `}
            {`${summary.totalTargetAccounts} alvos${undefinedSuffix(summary.targetsUndefined, "meta")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => setPlanModalOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Configurar plano
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setMarketModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar cidade
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              <th className="p-3 text-left">#</th>
              <th className="p-3 text-left">Cidade</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Distância</th>
              <th className="p-3 text-left">Meta de alvos</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Nenhuma cidade cadastrada neste plano.
                </td>
              </tr>
            ) : (
              rows.map((market) => {
                const base = isBaseMarket(market);
                return (
                  <tr
                    key={market.id}
                    className={cn(
                      "border-t align-top",
                      selectedMarketId === market.id && "bg-primary/5",
                    )}
                  >
                    <td className="p-3 font-black tabular-nums">{marketOrderLabel(market)}</td>
                    <td className="p-3">
                      <span className="font-bold">{marketLabel(market)}</span>
                      {(market.objective || "").trim() && (
                        <span className="block text-xs text-muted-foreground">
                          {market.objective}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]",
                          base ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        {base ? "Base existente" : "Expansão"}
                      </span>
                    </td>
                    <td className="p-3">{marketStatusLabel(market.status)}</td>
                    <td className="p-3 tabular-nums">
                      {marketDistanceLabel(market.travel_distance_km)}
                    </td>
                    <td className="p-3 tabular-nums">
                      {marketTargetLabel(market.target_accounts)}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setEditing(market);
                            setMarketModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        {onOpenPaidMedia && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => onOpenPaidMedia(market.id)}
                          >
                            Mídia paga
                          </Button>
                        )}
                        {onOpenCommercial && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => onOpenCommercial(market.id)}
                          >
                            Comercial
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Verba e janela de anúncios são trabalhadas em Mídia paga. Ligações, visitas e oportunidades
        são trabalhadas em Comercial.
      </p>

      {tenantId && companyId && (
        <PlaceFormModal
          open={marketModalOpen}
          onOpenChange={setMarketModalOpen}
          tenantId={tenantId}
          companyId={companyId}
          campaignId={plan.id}
          market={editing}
          nextOrder={nextOrder}
          mode="strategy"
          onSaved={load}
        />
      )}
      <PlanConfigModal
        open={planModalOpen}
        onOpenChange={setPlanModalOpen}
        plan={plan}
        onSaved={load}
      />
    </section>
  );
}
