import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  baseMarketsOf,
  expansionMarketsOf,
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
import {
  EMPTY_MARKET_STATS,
  groupLeadsByMarket,
  leadsWithoutMarket,
  loadMarketLeads,
  loadMarketTouchpoints,
  summarizeMarketCommercial,
  type MarketLead,
} from "@/lib/commercialMarketActivity";
import { stageLabel, STAGE_OPTIONS } from "@/lib/systemsClients";
import PlaceFormModal from "./PlaceFormModal";
import PlanConfigModal from "./PlanConfigModal";

interface ExpansionTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  /** Abre o Comercial já no contexto da cidade/carteira, sem duplicar leads. */
  onOpenCommercial: (marketId?: string) => void;
}

/**
 * PLANO DE EXPANSÃO REGIONAL: UM único plano (`marketing_campaigns`) com uma
 * BASE comercial existente e N cidades/etapas numeradas
 * (`marketing_campaign_markets`). Os leads exibidos são os MESMOS registros de
 * `systems_clients` (por `market_id`) — a aba nunca cria ou copia lead. A
 * execução real vem de `client_touchpoints`.
 */
export default function ExpansionTab({ tenantId, companyId, onOpenCommercial }: ExpansionTabProps) {
  const [plan, setPlan] = useState<MarketingCampaign | null>(null);
  const [markets, setMarkets] = useState<ExpansionMarket[]>([]);
  const [leads, setLeads] = useState<MarketLead[]>([]);
  const [touchpoints, setTouchpoints] = useState<
    { subclient_id: string | null; touchpoint_type: string; occurred_at: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpansionMarket | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !companyId) {
      setPlan(null);
      setMarkets([]);
      setLeads([]);
      setTouchpoints([]);
      return;
    }
    setLoading(true);
    try {
      const activePlan = await loadExpansionPlan(tenantId, companyId);
      setPlan(activePlan);
      const [rows, leadRows] = await Promise.all([
        loadExpansionMarkets(tenantId, companyId, activePlan?.id ?? null),
        loadMarketLeads(tenantId, companyId),
      ]);
      setMarkets(rows);
      setLeads(leadRows);
      setTouchpoints(await loadMarketTouchpoints(leadRows.map((l) => l.id)));
    } catch (err) {
      console.error("[ExpansionTab]", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const statsByMarket = useMemo(
    () => summarizeMarketCommercial(leads, touchpoints),
    [leads, touchpoints],
  );
  const leadsByMarket = useMemo(() => groupLeadsByMarket(leads), [leads]);
  const orphanLeads = useMemo(() => leadsWithoutMarket(leads), [leads]);

  const summary = useMemo(() => summarizeExpansionPlan(markets), [markets]);
  const bases = useMemo(() => baseMarketsOf(markets), [markets]);
  const expansionRows = useMemo(() => expansionMarketsOf(markets), [markets]);

  const nextOrder = useMemo(
    () => expansionRows.reduce((max, m) => Math.max(max, m.sequence_order ?? 0), 0) + 1,
    [expansionRows],
  );

  const renderRows = (rows: ExpansionMarket[]) =>
    rows.map((market) => {
      const stats = statsByMarket.get(market.id) ?? EMPTY_MARKET_STATS;
      const marketLeads = leadsByMarket.get(market.id) ?? [];
      const isOpen = expanded === market.id;
      const isCurrent = market.status === "active";
      return (
        <Fragment key={market.id}>
          <tr className={isCurrent ? "bg-primary/5 align-top" : "align-top"}>
            <td className="py-3 pr-3 font-black tabular-nums text-primary">
              {marketOrderLabel(market)}
            </td>
            <td className="py-3 pr-4 font-bold">{marketLabel(market)}</td>
            <td className="py-3 pr-4">{marketStatusLabel(market.status)}</td>
            <td className="py-3 pr-4 tabular-nums">
              {marketDistanceLabel(market.travel_distance_km)}
            </td>
            <td className="py-3 pr-4 tabular-nums">{marketTargetLabel(market.target_accounts)}</td>
            <td className="py-3 pr-4 tabular-nums">
              {marketBudgetLabel(market.paid_traffic_budget)}
            </td>
            <td className="py-3 pr-4 tabular-nums">
              {marketWindow(market.ads_start_date, market.ads_end_date)}
            </td>
            <td className="py-3 pr-4 tabular-nums">{marketDate(market.calls_start_date)}</td>
            <td className="py-3 pr-4 tabular-nums">
              {marketVisitWindow(market.visits_start_date, market.visits_end_date)}
            </td>
            <td className="py-3 pr-4 tabular-nums">{stats.total}</td>
            <td className="py-3 pr-4 tabular-nums">{stats.negotiating}</td>
            <td className="py-3 pr-4 tabular-nums">{`${stats.won}/${stats.customers}`}</td>
            <td className="py-3 pr-4 tabular-nums text-muted-foreground">
              {`${stats.calls} lig. · ${stats.visits} vis. · ${stats.demos} demo`}
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
              <td colSpan={13} className="py-4 pr-4">
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
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Registros comerciais desta cidade
                      </p>
                      {marketLeads.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Nenhum registro vinculado a esta cidade ainda. O vínculo é sempre
                          explícito no Comercial.
                        </p>
                      ) : (
                        <ul className="mt-2 divide-y border-y text-sm">
                          {marketLeads.map((lead) => (
                            <li key={lead.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                              <span className="font-bold">{lead.name}</span>
                              <span className="text-muted-foreground">
                                {lead.lifecycle === "customer"
                                  ? "Cliente"
                                  : stageLabel(lead.commercial_stage)}
                              </span>
                              {lead.next_action && (
                                <span className="text-muted-foreground">
                                  Próxima ação: {lead.next_action}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      Distribuição por etapa comercial
                    </p>
                    <dl className="mt-3 divide-y border-y text-sm">
                      {STAGE_OPTIONS.map(({ value, label }) => (
                        <div key={value} className="flex items-baseline justify-between gap-4 py-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-bold tabular-nums">{stats.stages[value] ?? 0}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Execução registrada: {stats.calls} ligações, {stats.visits} visitas,{" "}
                      {stats.demos} demonstrações.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenCommercial(market.id)}
                      className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
                    >
                      Abrir Comercial nesta cidade
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      );
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight">Plano de expansão regional</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um único plano comercial: uma base já existente e a sequência de cidades a conquistar. O
            conteúdo é produzido uma vez e distribuído em todas as etapas.
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
              <Field
                label="Base comercial"
                value={bases.length ? bases.map((b) => marketLabel(b)).join(", ") : "A definir"}
              />
              <Field label="Cidades a conquistar" value={String(summary.totalExpansionCities)} />
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
              <table className="w-full min-w-[1320px] text-sm">
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
                    <th className="py-2 pr-4">Execução real</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bases.length > 0 && (
                    <tr className="bg-muted/40">
                      <td
                        colSpan={14}
                        className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground"
                      >
                        Base comercial existente
                      </td>
                    </tr>
                  )}
                  {renderRows(bases)}
                  <tr className="bg-muted/40">
                    <td
                      colSpan={14}
                      className="py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground"
                    >
                      Sequência de expansão
                    </td>
                  </tr>
                  {renderRows(expansionRows)}
                </tbody>
              </table>
            </div>
          )}

          {orphanLeads.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Sem cidade definida
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {orphanLeads.length} registro(s) comercial(is) ainda sem carteira territorial. A
                atribuição nunca é automática — defina a cidade no Comercial.
              </p>
              <button
                type="button"
                onClick={() => onOpenCommercial()}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
              >
                Abrir Comercial
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
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
