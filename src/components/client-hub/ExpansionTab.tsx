import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  loadExpansionMarkets,
  loadExpansionPlan,
  marketBudgetLabel,
  marketDate,
  marketDistanceLabel,
  marketLabel,
  marketOrderLabel,
  marketStatusLabel,
  marketTargetLabel,
  marketVisitWindow,
  marketWindow,
  summarizeExpansionPlan,
  undefinedSuffix,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import { STAGE_OPTIONS } from "@/lib/systemsClients";
import PlaceFormModal from "./PlaceFormModal";
import PlanConfigModal from "./PlanConfigModal";

interface ExpansionTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  onOpenCommercial: () => void;
}

interface CommercialRow {
  acquisition_market_id: string | null;
  lifecycle: string | null;
  commercial_stage: string | null;
}

/**
 * PLANO DE EXPANSÃO REGIONAL: UM único plano (`marketing_campaigns`) com N
 * cidades/etapas (`marketing_campaign_markets`) visíveis na mesma tela. O
 * cronograma editorial é único e não é filtrado por cidade.
 */
export default function ExpansionTab({ tenantId, companyId, onOpenCommercial }: ExpansionTabProps) {
  const [plan, setPlan] = useState<MarketingCampaign | null>(null);
  const [markets, setMarkets] = useState<ExpansionMarket[]>([]);
  const [commercial, setCommercial] = useState<CommercialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpansionMarket | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !companyId) {
      setPlan(null);
      setMarkets([]);
      setCommercial([]);
      return;
    }
    setLoading(true);
    try {
      const activePlan = await loadExpansionPlan(tenantId, companyId);
      setPlan(activePlan);
      const [rows, comm] = await Promise.all([
        loadExpansionMarkets(tenantId, companyId, activePlan?.id ?? null),
        (supabase as any)
          .from("systems_clients")
          .select("acquisition_market_id, lifecycle, commercial_stage")
          .eq("tenant_id", tenantId)
          .not("acquisition_market_id", "is", null),
      ]);
      setMarkets(rows);
      setCommercial(((comm?.data || []) as CommercialRow[]) ?? []);
    } catch (err) {
      console.error("[ExpansionTab]", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const statsByMarket = useMemo(() => {
    const map = new Map<
      string,
      { total: number; negotiating: number; won: number; customers: number; stages: Record<string, number> }
    >();
    markets.forEach((m) => {
      const rows = commercial.filter((r) => r.acquisition_market_id === m.id);
      const stages: Record<string, number> = {};
      STAGE_OPTIONS.forEach(({ value }) => {
        stages[value] = rows.filter((r) => r.commercial_stage === value).length;
      });
      map.set(m.id, {
        total: rows.length,
        negotiating: (stages.avaliacao || 0) + (stages.negociacao || 0),
        won: stages.ganho || 0,
        customers: rows.filter((r) => r.lifecycle === "customer").length,
        stages,
      });
    });
    return map;
  }, [markets, commercial]);

  const summary = useMemo(() => summarizeExpansionPlan(markets), [markets]);

  const nextOrder = useMemo(
    () => markets.reduce((max, m) => Math.max(max, m.sequence_order ?? 0), 0) + 1,
    [markets],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight">Plano de expansão regional</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um único plano comercial, executado cidade por cidade. O conteúdo é produzido uma vez e
            pode ser distribuído em todas as etapas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPlanModalOpen(true)}>
              Editar plano
            </Button>
          )}
          {plan && (
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
          )}
        </div>
      </div>

      {!plan ? (
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : "Nenhum plano de expansão cadastrado para este cliente."}
        </p>
      ) : (
        <>
          <div className="border-y py-3">
            <p className="text-sm font-black">{plan.name}</p>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
              <Field label="Status do plano" value={marketStatusLabel(plan.status)} />
              <Field label="Cidades no plano" value={String(summary.totalCities)} />
              <Field
                label="Alvos previstos"
                value={`${summary.totalTargetAccounts}${undefinedSuffix(summary.targetsUndefined, "meta")}`}
              />
              <Field
                label="Investimento previsto"
                value={`${marketBudgetLabel(summary.totalBudget)}${undefinedSuffix(summary.budgetUndefined, "valor")}`}
              />
              <Field
                label="Praça atual"
                value={summary.currentMarket ? marketLabel(summary.currentMarket) : "A definir"}
              />
              <Field label="Etapas concluídas" value={String(summary.completedMarkets)} />
            </div>
          </div>

          {markets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loading ? "Carregando…" : "Nenhuma cidade cadastrada neste plano."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-4">Cidade</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Distância</th>
                    <th className="py-2 pr-4">Meta</th>
                    <th className="py-2 pr-4">Investimento</th>
                    <th className="py-2 pr-4">Anúncios</th>
                    <th className="py-2 pr-4">Ligações</th>
                    <th className="py-2 pr-4">Visitas</th>
                    <th className="py-2 pr-4">Oportunidades</th>
                    <th className="py-2 pr-4">Avaliação/negociação</th>
                    <th className="py-2 pr-4">Ganhos/clientes</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {markets.map((market, index) => {
                    const stats = statsByMarket.get(market.id);
                    const isOpen = expanded === market.id;
                    const isCurrent = market.status === "active";
                    return (
                      <Fragment key={market.id}>
                        <tr
                          className={isCurrent ? "bg-primary/5 align-top" : "align-top"}
                        >
                          <td className="py-3 pr-3 font-black tabular-nums text-primary">
                            {marketOrderLabel(market, index)}
                          </td>
                          <td className="py-3 pr-4 font-bold">{marketLabel(market)}</td>
                          <td className="py-3 pr-4">{marketStatusLabel(market.status)}</td>
                          <td className="py-3 pr-4 tabular-nums">
                            {marketDistanceLabel(market.travel_distance_km)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {marketTargetLabel(market.target_accounts)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {marketBudgetLabel(market.paid_traffic_budget)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {marketWindow(market.ads_start_date, market.ads_end_date)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {marketDate(market.calls_start_date)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">
                            {marketVisitWindow(market.visits_start_date, market.visits_end_date)}
                          </td>
                          <td className="py-3 pr-4 tabular-nums">{stats?.total ?? 0}</td>
                          <td className="py-3 pr-4 tabular-nums">{stats?.negotiating ?? 0}</td>
                          <td className="py-3 pr-4 tabular-nums">
                            {`${stats?.won ?? 0}/${stats?.customers ?? 0}`}
                          </td>
                          <td className="whitespace-nowrap py-3 text-right">
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
                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : market.id)}
                              className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
                            >
                              Detalhes
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                              />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/30">
                            <td />
                            <td colSpan={12} className="py-4 pr-4">
                              <div className="grid gap-6 border-l-2 border-primary pl-4 lg:grid-cols-2">
                                <div className="space-y-3">
                                  {(market.objective || "").trim() && (
                                    <Detail label="Objetivo local" value={market.objective!} />
                                  )}
                                  {market.channels.length > 0 && (
                                    <Detail label="Canais" value={market.channels.join(", ")} />
                                  )}
                                  {(market.acquisition_strategy || "").trim() && (
                                    <Detail label="Abordagem local" value={market.acquisition_strategy!} />
                                  )}
                                  {(market.observations || "").trim() && (
                                    <Detail label="Observações" value={market.observations!} />
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                    Distribuição por etapa comercial
                                  </p>
                                  <dl className="mt-3 divide-y border-y text-sm">
                                    {STAGE_OPTIONS.map(({ value, label }) => (
                                      <div
                                        key={value}
                                        className="flex items-baseline justify-between gap-4 py-2"
                                      >
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="font-bold tabular-nums">
                                          {stats?.stages[value] ?? 0}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                  <button
                                    type="button"
                                    onClick={onOpenCommercial}
                                    className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
                                  >
                                    Abrir Comercial
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tenantId && companyId && plan && (
        <PlaceFormModal
          open={marketModalOpen}
          onOpenChange={setMarketModalOpen}
          tenantId={tenantId}
          companyId={companyId}
          campaignId={plan.id}
          market={editing}
          nextOrder={nextOrder}
          onSaved={load}
        />
      )}
      {plan && (
        <PlanConfigModal
          open={planModalOpen}
          onOpenChange={setPlanModalOpen}
          plan={plan}
          onSaved={load}
        />
      )}
    </div>
  );
}

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-[110px]">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
  </div>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
      {value.length > 1200 ? `${value.slice(0, 1200)}…` : value}
    </p>
  </div>
);
