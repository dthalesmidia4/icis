import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  loadExpansionMarkets,
  loadExpansionPlan,
  marketBudgetLabel,
  marketLabel,
  marketOrderLabel,
  marketStatusLabel,
  marketWindow,
  undefinedSuffix,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";
import {
  cancelPaidMediaActivation,
  formatActivationBudget,
  loadPaidMediaActivations,
  paidMediaStatusLabel,
  type PaidMediaActivation,
} from "@/lib/paidMediaActivations";
import {
  buildPaidMediaMarketRows,
  summarizePaidMediaPlan,
} from "@/lib/paidMediaPlanning";
import ActivationFormModal, { type ActivationDemandOption } from "./ActivationFormModal";

interface PaidMediaTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  currentPeriodId: string | null | undefined;
  /** Praça vinda da aba Expansão (`market=`): abre e destaca a cidade. */
  selectedMarketId?: string | null;
}

interface DemandRow {
  id: string;
  title: string;
  publish_date: string | null;
  period_plan_id: string | null;
}

/**
 * MÍDIA PAGA EM DOIS NÍVEIS:
 * 1. planejamento da praça (verba e janela já definidas no plano regional);
 * 2. alocação de peças naquela praça (ativações).
 *
 * A tela nunca mostra "R$ 0,00 planejado" quando as praças já têm verba: o
 * planejamento aparece mesmo com zero ativações.
 */
export default function PaidMediaTab({
  tenantId,
  companyId,
  currentPeriodId,
  selectedMarketId,
}: PaidMediaTabProps) {
  const [plan, setPlan] = useState<MarketingCampaign | null>(null);
  const [markets, setMarkets] = useState<ExpansionMarket[]>([]);
  const [demands, setDemands] = useState<DemandRow[]>([]);
  const [activations, setActivations] = useState<PaidMediaActivation[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaidMediaActivation | null>(null);
  const [initialMarketId, setInitialMarketId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !companyId) {
      setPlan(null);
      setMarkets([]);
      setDemands([]);
      setActivations([]);
      return;
    }
    setLoading(true);
    try {
      const activePlan = await loadExpansionPlan(tenantId, companyId);
      setPlan(activePlan);
      const [mkts, acts, dem] = await Promise.all([
        loadExpansionMarkets(tenantId, companyId, activePlan?.id ?? null),
        loadPaidMediaActivations(tenantId, companyId),
        supabase
          .from("demands")
          .select("id, title, publish_date, period_plan_id")
          .eq("tenant_id", tenantId)
          .eq("client_id", companyId)
          .eq("work_area", "midia")
          .eq("is_draft", false)
          .order("publish_date", { ascending: true, nullsFirst: false }),
      ]);
      setMarkets(mkts);
      setActivations(acts);
      setDemands((dem.data || []) as unknown as DemandRow[]);
    } catch (err) {
      console.error("[PaidMediaTab]", err);
      toast.error("Não foi possível carregar o planejamento de mídia paga.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedMarketId) setExpanded(selectedMarketId);
  }, [selectedMarketId]);

  const demandById = useMemo(() => {
    const map = new Map<string, DemandRow>();
    demands.forEach((d) => map.set(d.id, d));
    return map;
  }, [demands]);

  const totals = useMemo(() => summarizePaidMediaPlan(markets, activations), [markets, activations]);
  const rows = useMemo(() => buildPaidMediaMarketRows(markets, activations), [markets, activations]);

  const demandOptions: ActivationDemandOption[] = useMemo(
    () =>
      demands.map((d) => ({
        id: d.id,
        title: d.title,
        publish_date: d.publish_date,
        inCurrentPeriod: !!currentPeriodId && d.period_plan_id === currentPeriodId,
      })),
    [demands, currentPeriodId],
  );

  const openNew = (marketId?: string | null) => {
    setEditing(null);
    setInitialMarketId(marketId ?? null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-black leading-tight">Mídia paga</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cada praça já tem verba e janela planejadas. Dentro dela, cada peça alocada consome
            parte dessa verba — o calendário editorial não muda e nenhuma peça é duplicada.
          </p>
        </div>
        {rows.length > 0 && plan && (
          <Button size="sm" className="gap-2" onClick={() => openNew(null)}>
            <Plus className="h-3.5 w-3.5" />
            Nova ativação
          </Button>
        )}
      </div>

      <div className="grid gap-px border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Metric
          label="Investimento planejado"
          value={`${marketBudgetLabel(totals.plannedKnown)}${undefinedSuffix(totals.plannedUndefined, "valor")}`}
        />
        <Metric
          label="Alocado em ativações"
          value={`${marketBudgetLabel(totals.allocatedKnown)}${undefinedSuffix(totals.allocatedUndefined, "verba")}`}
        />
        <Metric label="Saldo conhecido" value={marketBudgetLabel(totals.balanceKnown)} />
        <Metric label="Praças programadas" value={String(totals.scheduledCities)} />
        <Metric label="Ativações" value={String(totals.activations)} />
      </div>

      <section>
        <p className="border-b pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Planejamento por praça
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {loading
              ? "Carregando…"
              : "Cadastre uma cidade na aba Expansão para planejar mídia paga."}
          </p>
        ) : (
          rows.map(({ market, planned, allocated, available, activations: acts }) => {
            const isOpen = expanded === market.id;
            const live = acts.filter((a) => a.status !== "cancelled");
            return (
              <div
                key={market.id}
                className={cn(
                  "border-b",
                  selectedMarketId === market.id && "bg-primary/5",
                )}
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                        {marketOrderLabel(market)}
                      </span>
                      <span className="text-sm font-black">{marketLabel(market)}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                        {marketStatusLabel(market.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <Chip
                        label="Anúncios"
                        value={marketWindow(market.ads_start_date, market.ads_end_date)}
                      />
                      <Chip label="Planejado" value={marketBudgetLabel(planned)} />
                      <Chip label="Alocado" value={marketBudgetLabel(allocated)} />
                      <Chip
                        label="Disponível"
                        value={available === null ? "A definir" : marketBudgetLabel(available)}
                      />
                      <Chip label="Ativações" value={String(live.length)} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => openNew(market.id)}
                    >
                      Adicionar ativação
                    </Button>
                    <button
                      type="button"
                      aria-label={isOpen ? "Recolher praça" : "Expandir praça"}
                      onClick={() => setExpanded(isOpen ? null : market.id)}
                      className="inline-flex h-8 w-8 items-center justify-center text-primary"
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-l-2 border-primary pb-5 pl-4">
                    {acts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma peça alocada ainda. A janela e o orçamento da praça já estão
                        planejados.
                      </p>
                    ) : (
                      <ul className="divide-y border-y text-sm">
                        {acts.map((a) => (
                          <li
                            key={a.id}
                            className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-bold">
                                {demandById.get(a.demand_id)?.title || "Conteúdo removido"}
                              </p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{a.platform}</span>
                                <span className="tabular-nums">
                                  {marketWindow(a.start_date, a.end_date)}
                                </span>
                                <span className="tabular-nums">
                                  {formatActivationBudget(a.budget)}
                                </span>
                                <span>{paidMediaStatusLabel(a.status)}</span>
                                {(a.objective || "").trim() && <span>{a.objective}</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  setEditing(a);
                                  setInitialMarketId(null);
                                  setModalOpen(true);
                                }}
                              >
                                Editar
                              </Button>
                              {a.status !== "cancelled" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-muted-foreground"
                                  onClick={async () => {
                                    const res = await cancelPaidMediaActivation(a.id);
                                    if (!res.success) {
                                      toast.error(res.message || "Não foi possível cancelar.");
                                      return;
                                    }
                                    toast.success("Ativação cancelada.");
                                    load();
                                  }}
                                >
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={() => openNew(market.id)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar ativação
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {tenantId && companyId && plan && (
        <ActivationFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          tenantId={tenantId}
          companyId={companyId}
          campaignId={plan.id}
          markets={markets}
          activationsByMarket={activations}
          demands={demandOptions}
          activation={editing}
          initialMarketId={initialMarketId}
          onSaved={load}
        />
      )}
    </div>
  );
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-background p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
  </div>
);

const Chip = ({ label, value }: { label: string; value: string }) => (
  <span className="whitespace-nowrap">
    <span className="text-[10px] font-black uppercase tracking-[0.14em]">{label} </span>
    <span className="tabular-nums text-foreground">{value}</span>
  </span>
);
