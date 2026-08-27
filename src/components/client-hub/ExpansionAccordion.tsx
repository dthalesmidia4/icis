import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  baseMarketsOf,
  expansionMarketsOf,
  isBaseMarket,
  loadExpansionMarkets,
  loadExpansionPlan,
  marketBudgetLabel,
  marketDate,
  marketLabel,
  marketOrderLabel,
  marketStatusLabel,
  marketVisitWindow,
  marketWindow,
  patchExpansionMarket,
  summarizeExpansionPlan,
  undefinedSuffix,
  MARKET_STATUS_OPTIONS,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import {
  loadMarketLeads,
  loadMarketTouchpoints,
  leadsWithoutMarket,
  summarizeMarketCommercial,
  type MarketLead,
  type MarketTouchpoint,
} from "@/lib/commercialMarketActivity";
import {
  isActivationCancelled,
  loadPaidMediaActivations,
  type PaidMediaActivation,
} from "@/lib/paidMediaActivations";
import {
  patchSystemsClient,
  STAGE_OPTIONS,
  stageLabel,
  type CommercialStage,
} from "@/lib/systemsClients";
import {
  InlineDateTimeCell,
  InlineNumberCell,
  InlineSelectCell,
  InlineTextCell,
} from "@/components/inline-edit/InlineCells";
import { inlineDateText } from "@/lib/inlineEdit";
import PlaceFormModal from "./PlaceFormModal";
import PlanConfigModal from "./PlanConfigModal";

interface Props {
  tenantId?: string | null;
  companyId?: string | null;
  /** Cidade em foco pelo deep link (`?market=`). */
  selectedMarketId?: string | null;
  onOpenPaidMedia?: (marketId: string) => void;
  onOpenCommercial?: (marketId?: string, opportunityId?: string) => void;
}

/**
 * PLANO REGIONAL OPERACIONAL (accordion).
 *
 * Uma linha enxuta por cidade e, ao abrir, o que a operação precisa de fato:
 * posicionamento editável na hora, resumo do que já está planejado em mídia
 * paga, a carteira comercial real (`systems_clients.market_id`) e a execução
 * registrada em `client_touchpoints`. Nada é duplicado: cada bloco lê e grava
 * na sua fonte de verdade.
 */
export default function ExpansionAccordion({
  tenantId,
  companyId,
  selectedMarketId,
  onOpenPaidMedia,
  onOpenCommercial,
}: Props) {
  const [plan, setPlan] = useState<MarketingCampaign | null>(null);
  const [markets, setMarkets] = useState<ExpansionMarket[]>([]);
  const [leads, setLeads] = useState<MarketLead[]>([]);
  const [touchpoints, setTouchpoints] = useState<MarketTouchpoint[]>([]);
  const [activations, setActivations] = useState<PaidMediaActivation[]>([]);
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
      setActivations([]);
      return;
    }
    setLoading(true);
    try {
      const found = await loadExpansionPlan(tenantId, companyId);
      setPlan(found);
      const [mkts, leadRows, acts] = await Promise.all([
        found ? loadExpansionMarkets(tenantId, companyId, found.id) : Promise.resolve([]),
        loadMarketLeads(tenantId, companyId),
        loadPaidMediaActivations(tenantId, companyId, { campaignId: found?.id ?? null }),
      ]);
      setMarkets(mkts);
      setLeads(leadRows);
      setActivations(acts);
      setTouchpoints(await loadMarketTouchpoints(leadRows.map((l) => l.id)));
    } catch (err) {
      console.error("[ExpansionAccordion] plano regional", err);
      toast.error("Não foi possível carregar o plano regional.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  // Bebedouro (base) abre por padrão; o deep link tem prioridade.
  const baseId = useMemo(() => baseMarketsOf(markets)[0]?.id || null, [markets]);
  useEffect(() => {
    if (selectedMarketId) {
      setExpanded(selectedMarketId);
      return;
    }
    setExpanded((prev) => prev ?? baseId);
  }, [selectedMarketId, baseId]);

  const rows = useMemo(
    () => [...baseMarketsOf(markets), ...expansionMarketsOf(markets)],
    [markets],
  );
  const summary = useMemo(() => summarizeExpansionPlan(markets), [markets]);
  const stats = useMemo(
    () => summarizeMarketCommercial(leads, touchpoints),
    [leads, touchpoints],
  );
  const orphans = useMemo(() => leadsWithoutMarket(leads), [leads]);
  const nextOrder = expansionMarketsOf(markets).length + 1;

  const leadsOf = useCallback(
    (marketId: string) =>
      leads
        .filter((l) => l.market_id === marketId)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [leads],
  );

  const activationsOf = useCallback(
    (marketId: string) =>
      activations.filter((a) => a.market_id === marketId && !isActivationCancelled(a.status)),
    [activations],
  );

  /** Grava UMA coluna territorial da cidade, sem tocar nas outras áreas. */
  const patchMarket = async (marketId: string, patch: Record<string, unknown>) => {
    const res = await patchExpansionMarket(marketId, patch, "strategy");
    if (res.success) {
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? ({ ...m, ...patch } as ExpansionMarket) : m)),
      );
    }
    return res;
  };

  /** Grava UMA coluna do lead comercial (mesmo registro do CRM). */
  const patchLead = async (leadId: string, patch: Record<string, unknown>) => {
    const res = await patchSystemsClient(leadId, patch as any);
    if (res.success) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? ({ ...l, ...patch } as MarketLead) : l)));
    }
    return res;
  };

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

      {orphans.length > 0 && (
        <p className="mt-3 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {`${orphans.length} ${orphans.length === 1 ? "oportunidade" : "oportunidades"} sem cidade/carteira: `}
          {orphans.map((o) => o.name).join(", ")}. O vínculo nunca é automático — defina a carteira
          no Comercial.
        </p>
      )}

      <div className="mt-4 overflow-x-auto border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              <th className="p-3 text-left">#</th>
              <th className="p-3 text-left">Cidade</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Distância</th>
              <th className="p-3 text-right">Meta</th>
              <th className="p-3 text-right">Carteira</th>
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
                const isOpen = expanded === market.id;
                const cityLeads = leadsOf(market.id);
                const cityStats = stats.get(market.id);
                const cityActivations = activationsOf(market.id);
                return (
                  <Fragment key={market.id}>
                    <tr
                      className={cn(
                        "border-t align-middle",
                        selectedMarketId === market.id && "bg-primary/5",
                      )}
                    >
                      <td className="p-3 font-black tabular-nums">{marketOrderLabel(market)}</td>
                      <td className="p-3">
                        <span className="font-bold">{marketLabel(market)}</span>
                        <span
                          className={cn(
                            "ml-2 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]",
                            base ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                          )}
                        >
                          {base ? "Base" : "Expansão"}
                        </span>
                      </td>
                      <td className="p-2">
                        <InlineSelectCell
                          ariaLabel={`Status de ${marketLabel(market)}`}
                          value={market.status}
                          options={MARKET_STATUS_OPTIONS}
                          emptyLabel={marketStatusLabel(market.status)}
                          onCommit={(v) => patchMarket(market.id, { status: v || "planning" })}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <InlineNumberCell
                          ariaLabel={`Distância de ${marketLabel(market)}`}
                          value={market.travel_distance_km}
                          suffix=" km"
                          label="distância"
                          className="text-right"
                          onCommit={(v) => patchMarket(market.id, { travel_distance_km: v })}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <InlineNumberCell
                          ariaLabel={`Meta de alvos de ${marketLabel(market)}`}
                          value={market.target_accounts}
                          label="meta"
                          className="text-right"
                          onCommit={(v) => patchMarket(market.id, { target_accounts: v })}
                        />
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {`${cityStats?.opportunities ?? 0} opor. · ${cityStats?.customers ?? 0} clientes`}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
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
                            aria-label={isOpen ? "Recolher cidade" : "Expandir cidade"}
                            onClick={() => setExpanded(isOpen ? null : market.id)}
                            className="inline-flex h-8 w-8 items-center justify-center text-primary"
                          >
                            <ChevronDown
                              className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={7} className="p-4">
                          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                            <div className="space-y-4">
                              <div>
                                <Label>Objetivo da praça</Label>
                                <InlineTextCell
                                  ariaLabel={`Objetivo de ${marketLabel(market)}`}
                                  value={market.objective}
                                  placeholder="O que esta cidade precisa provar"
                                  onCommit={(v) => patchMarket(market.id, { objective: v })}
                                />
                              </div>
                              <div>
                                <Label>Abordagem de aquisição</Label>
                                <InlineTextCell
                                  ariaLabel={`Abordagem de ${marketLabel(market)}`}
                                  value={market.acquisition_strategy}
                                  onCommit={(v) =>
                                    patchMarket(market.id, { acquisition_strategy: v })
                                  }
                                />
                              </div>
                              <div>
                                <Label>Observações</Label>
                                <InlineTextCell
                                  ariaLabel={`Observações de ${marketLabel(market)}`}
                                  value={market.observations}
                                  onCommit={(v) => patchMarket(market.id, { observations: v })}
                                />
                              </div>

                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <Label>Carteira comercial</Label>
                                  {onOpenCommercial && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenCommercial(market.id)}
                                      className="text-[10px] font-black uppercase tracking-[0.12em] text-primary hover:underline"
                                    >
                                      Abrir no Comercial
                                    </button>
                                  )}
                                </div>
                                {cityLeads.length === 0 ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Nenhuma oportunidade vinculada a esta carteira.
                                  </p>
                                ) : (
                                  <table className="mt-2 w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                                        <th className="py-1 pr-2">Lead</th>
                                        <th className="py-1 pr-2">Etapa</th>
                                        <th className="py-1 pr-2">Sistema atual</th>
                                        <th className="py-1 pr-2">Próxima ação</th>
                                        <th className="py-1 pr-2">Quando</th>
                                        <th className="py-1 text-right">Ações</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cityLeads.map((lead) => (
                                        <tr key={lead.id} className="border-t align-middle">
                                          <td className="py-1 pr-2 font-bold">
                                            {lead.name}
                                            <span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground">
                                              {lead.lifecycle === "customer" ? "cliente" : "prospect"}
                                            </span>
                                          </td>
                                          <td className="py-1 pr-2">
                                            <InlineSelectCell
                                              ariaLabel={`Etapa de ${lead.name}`}
                                              value={lead.commercial_stage}
                                              options={STAGE_OPTIONS}
                                              emptyLabel={stageLabel(lead.commercial_stage)}
                                              onCommit={(v) =>
                                                patchLead(lead.id, {
                                                  commercial_stage: (v as CommercialStage) || null,
                                                })
                                              }
                                            />
                                          </td>
                                          <td className="py-1 pr-2">
                                            <InlineTextCell
                                              ariaLabel={`Sistema atual de ${lead.name}`}
                                              value={lead.current_system}
                                              onCommit={(v) =>
                                                patchLead(lead.id, { current_system: v })
                                              }
                                            />
                                          </td>
                                          <td className="py-1 pr-2">
                                            <InlineTextCell
                                              ariaLabel={`Próxima ação de ${lead.name}`}
                                              value={lead.next_action}
                                              onCommit={(v) => patchLead(lead.id, { next_action: v })}
                                            />
                                          </td>
                                          <td className="py-1 pr-2">
                                            <InlineDateTimeCell
                                              ariaLabel={`Data da próxima ação de ${lead.name}`}
                                              value={lead.next_action_at}
                                              display={
                                                lead.next_action_at
                                                  ? new Date(lead.next_action_at).toLocaleString(
                                                      "pt-BR",
                                                      {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                      },
                                                    )
                                                  : undefined
                                              }
                                              onCommit={(v) =>
                                                patchLead(lead.id, { next_action_at: v })
                                              }
                                            />
                                          </td>
                                          <td className="py-1 text-right">
                                            {onOpenCommercial && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-xs"
                                                onClick={() =>
                                                  onOpenCommercial(market.id, lead.id)
                                                }
                                              >
                                                Abrir
                                              </Button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>

                            <div className="space-y-4 border-l pl-6">
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <Label>Mídia paga planejada</Label>
                                  {onOpenPaidMedia && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenPaidMedia(market.id)}
                                      className="text-[10px] font-black uppercase tracking-[0.12em] text-primary hover:underline"
                                    >
                                      Abrir em Mídia paga
                                    </button>
                                  )}
                                </div>
                                <dl className="mt-1 space-y-1 text-xs">
                                  <Line
                                    label="Verba da praça"
                                    value={marketBudgetLabel(market.paid_traffic_budget)}
                                  />
                                  <Line
                                    label="Janela dos anúncios"
                                    value={marketWindow(market.ads_start_date, market.ads_end_date)}
                                  />
                                  <Line
                                    label="Peças vinculadas"
                                    value={String(
                                      new Set(cityActivations.map((a) => a.demand_id)).size,
                                    )}
                                  />
                                </dl>
                              </div>

                              <div>
                                <Label>Agenda comercial planejada</Label>
                                <dl className="mt-1 space-y-1 text-xs">
                                  <Line
                                    label="Ligações a partir de"
                                    value={marketDate(market.calls_start_date)}
                                  />
                                  <Line
                                    label="Visitas"
                                    value={marketVisitWindow(
                                      market.visits_start_date,
                                      market.visits_end_date,
                                    )}
                                  />
                                </dl>
                              </div>

                              <div>
                                <Label>Execução registrada</Label>
                                <dl className="mt-1 space-y-1 text-xs">
                                  <Line
                                    label="Ligações"
                                    value={String(cityStats?.calls ?? 0)}
                                  />
                                  <Line label="Visitas" value={String(cityStats?.visits ?? 0)} />
                                  <Line
                                    label="Demonstrações"
                                    value={String(cityStats?.demos ?? 0)}
                                  />
                                  <Line
                                    label="Último contato"
                                    value={
                                      cityStats?.lastTouchAt
                                        ? inlineDateText(cityStats.lastTouchAt.slice(0, 10))
                                        : "Sem contato registrado"
                                    }
                                  />
                                </dl>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Verba e janela de anúncios são trabalhadas em Mídia paga. Ligações, visitas e oportunidades
        são trabalhadas em Comercial — aqui a leitura é só de apoio.
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

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
    {children}
  </p>
);

const Line = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-bold tabular-nums">{value}</dd>
  </div>
);
