import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  PAID_MEDIA_STATUS_OPTIONS,
  effectivePaidMediaStatus,
  loadExpansionMarkets,
  loadExpansionPlan,
  marketBudgetLabel,
  marketLabel,
  marketOrderLabel,
  marketWindow,
  paidMediaMarketStatusLabel,

  patchExpansionMarket,
  undefinedSuffix,
  type ExpansionMarket,
  type PaidMediaStatus,
} from "@/lib/expansionMarkets";
import {
  cancelPaidMediaActivation,
  formatActivationBudget,
  isActivationCancelled,
  loadPaidMediaActivations,
  paidMediaStatusLabel,
  type PaidMediaActivation,
} from "@/lib/paidMediaActivations";
import {
  buildPaidMediaMarketRows,
  summarizePaidMediaPlan,
} from "@/lib/paidMediaPlanning";
import { InlineCurrencyCell } from "@/components/inline-edit/InlineCells";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paidMediaRowBadge, paidMediaRowClass } from "@/lib/marketRowStyles";

// MESMO seletor de início/término dos cards da Visão Geral.
import { StartEndDatePopover } from "@/components/kanban/StartEndDatePopover";
import ActivationFormModal, { type ActivationDemandOption } from "./ActivationFormModal";
import PlaceFormModal from "./PlaceFormModal";

/** Valor sentinela do dropdown: o banco guarda `null` para automático. */
const AUTO_STATUS = "__auto__";


interface PaidMediaTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  currentPeriodId: string | null | undefined;
  /** Praça vinda do deep link (`market=`): abre e destaca a cidade. */
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
  // Edição da verba/janela da cidade acontece aqui mesmo, em modo paid-media.
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [editingMarket, setEditingMarket] = useState<ExpansionMarket | null>(null);

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

  /** Verba/janela da praça editadas na própria célula, sem tocar outras áreas. */
  const patchMarket = async (marketId: string, patch: Record<string, unknown>) => {
    const res = await patchExpansionMarket(marketId, patch, "paid-media");
    if (res.success) {
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? ({ ...m, ...patch } as ExpansionMarket) : m)),
      );
    }
    return res;
  };

  const openEditMarket = (market: ExpansionMarket) => {
    setEditingMarket(market);
    setMarketModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-black leading-tight">Mídia paga</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cada cidade já tem verba e janela planejadas. Dentro dela, cada peça alocada consome
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

      {/* Leitura financeira primeiro: planejado e disponível dominam. */}
      <div className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Investimento planejado"
          value={`${marketBudgetLabel(totals.plannedKnown)}${undefinedSuffix(totals.plannedUndefined, "valor")}`}
          strong
        />
        <Metric label="Saldo disponível" value={marketBudgetLabel(totals.balanceKnown)} strong />
        <Metric
          label="Alocado em ativações"
          value={`${marketBudgetLabel(totals.allocatedKnown)}${undefinedSuffix(totals.allocatedUndefined, "verba")}`}
        />
        <Metric
          label="Cidades programadas"
          value={`${totals.scheduledCities} · ${totals.activations} peças vinculadas`}
        />
      </div>

      <section className="overflow-x-auto border">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              <th className="p-3 text-left">#</th>
              <th className="p-3 text-left">Cidade</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Período dos anúncios</th>
              <th className="p-3 text-right">Verba planejada</th>
              <th className="p-3 text-right">Alocado</th>
              <th className="p-3 text-right">Disponível</th>
              <th className="p-3 text-right">Peças vinculadas</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  {loading
                    ? "Carregando o planejamento de mídia paga…"
                    : "Nenhuma cidade com planejamento de mídia paga neste plano."}
                </td>
              </tr>
            ) : (
              rows.map(({ market, planned, allocated, available, linkedDemands, activations: acts }) => {
                const isOpen = expanded === market.id;
                const live = acts.filter((a) => !isActivationCancelled(a.status));
                // Status de MÍDIA (janela de anúncios + override), nunca `market.status`.
                const mediaStatus = effectivePaidMediaStatus(market);
                const badge = paidMediaRowBadge(mediaStatus);
                return (
                  <Fragment key={market.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-t align-top transition-colors hover:bg-muted/40",
                        paidMediaRowClass(mediaStatus),
                        selectedMarketId === market.id && "bg-primary/5",
                      )}
                      onClick={() => setExpanded(isOpen ? null : market.id)}
                    >
                      <td className="p-3 font-black tabular-nums">{marketOrderLabel(market)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{marketLabel(market)}</span>
                          {badge && (
                            <span
                              className={cn(
                                "rounded-full border px-1.5 py-0.5 text-[9px] font-black tracking-[0.12em]",
                                badge.className,
                              )}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={market.paid_media_status_override ?? AUTO_STATUS}
                          onValueChange={async (value) => {
                            const override =
                              value === AUTO_STATUS ? null : (value as PaidMediaStatus);
                            const res = await patchMarket(market.id, {
                              paid_media_status_override: override,
                            });
                            if (!res.success) {
                              toast.error(res.message || "Não foi possível salvar o status.");
                              return;
                            }
                            toast.success("Status de mídia atualizado.");
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-[150px] border-0 bg-muted/60 text-xs font-semibold"
                            aria-label={`Status de mídia em ${marketLabel(market)}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent onClick={(e) => e.stopPropagation()}>
                            {PAID_MEDIA_STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o.value ?? AUTO_STATUS} value={o.value ?? AUTO_STATUS}>
                                {o.value === null
                                  ? `Automático · ${paidMediaMarketStatusLabel(effectivePaidMediaStatus({ ...market, paid_media_status_override: null }))}`
                                  : o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* MESMO popover de início/término da Visão Geral. */}
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <StartEndDatePopover
                          dueDate={market.ads_start_date}
                          deliveryDate={market.ads_end_date}
                          dueTime={null}
                          deliveryTime={null}
                          onSave={async (v) => {
                            const res = await patchMarket(market.id, {
                              ads_start_date: v.due_date,
                              ads_end_date: v.delivery_date,
                            });
                            if (!res.success) {
                              toast.error(res.message || "Não foi possível salvar o período.");
                              return;
                            }
                            toast.success("Período dos anúncios atualizado.");
                          }}
                          trigger={
                            <button
                              type="button"
                              className="inline-flex items-center gap-3 rounded-md bg-muted/60 px-2 py-1 text-[11px] font-medium leading-tight transition-colors hover:bg-muted"
                              aria-label={`Período dos anúncios em ${marketLabel(market)}`}
                            >
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3 shrink-0 text-amber-500" />
                                <span className="text-muted-foreground">Ini:</span>
                                {market.ads_start_date ? (
                                  <span className="font-semibold">
                                    {shortDate(market.ads_start_date)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3 shrink-0 text-emerald-500" />
                                <span className="text-muted-foreground">Fim:</span>
                                {market.ads_end_date ? (
                                  <span className="font-semibold">
                                    {shortDate(market.ads_end_date)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </span>
                            </button>
                          }
                        />
                      </td>
                      <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <InlineCurrencyCell
                          ariaLabel={`Verba planejada em ${marketLabel(market)}`}
                          value={planned}
                          className="text-right"
                          onCommit={(v) => patchMarket(market.id, { paid_traffic_budget: v })}
                        />
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {marketBudgetLabel(allocated)}
                      </td>
                      <td
                        className={cn(
                          "p-3 text-right tabular-nums",
                          available !== null && available < 0 && "font-bold text-destructive",
                        )}
                      >
                        {available === null
                          ? "A definir"
                          : `${marketBudgetLabel(available)}${available < 0 ? " · acima do planejado" : ""}`}
                      </td>
                      <td className="p-3 text-right tabular-nums">{linkedDemands}</td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => openEditMarket(market)}
                          >
                            Editar verba
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => openNew(market.id)}
                          >
                            Nova ativação
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
                        <td colSpan={9} className="p-3">
                          {acts.length === 0 ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-sm text-muted-foreground">
                                Nenhuma peça alocada nesta cidade. A janela e a verba já estão
                                planejadas.
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => openNew(market.id)}
                              >
                                Vincular peça
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="mb-2 text-[11px] text-muted-foreground">
                                {`${linkedDemands} peça(s) vinculada(s) · ${live.length} ativação(ões) ativa(s) nesta cidade`}
                              </p>
                              <table className="w-full text-xs">

                              <thead>
                                <tr className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                                  <th className="py-2 pr-3">Conteúdo</th>
                                  <th className="py-2 pr-3">Plataforma</th>
                                  <th className="py-2 pr-3">Período</th>
                                  <th className="py-2 pr-3 text-right">Verba</th>
                                  <th className="py-2 pr-3">Situação</th>
                                  <th className="py-2 pr-3">Objetivo</th>
                                  <th className="py-2 text-right">Ações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {acts.map((a) => (
                                  <tr key={a.id} className="border-t align-top">
                                    <td className="py-2 pr-3 font-bold">
                                      {demandById.get(a.demand_id)?.title || "Conteúdo removido"}
                                    </td>
                                    <td className="py-2 pr-3">{a.platform}</td>
                                    <td className="py-2 pr-3 tabular-nums">
                                      {marketWindow(a.start_date, a.end_date)}
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                      {formatActivationBudget(a.budget)}
                                    </td>
                                    <td className="py-2 pr-3">{paidMediaStatusLabel(a.status)}</td>
                                    <td className="py-2 pr-3 text-muted-foreground">
                                      {(a.objective || "").trim() || "—"}
                                    </td>
                                    <td className="py-2">
                                      <div className="flex justify-end gap-1">
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
                                        {!isActivationCancelled(a.status) && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs text-muted-foreground"
                                            onClick={async () => {
                                              const res = await cancelPaidMediaActivation(a.id);
                                              if (!res.success) {
                                                toast.error(
                                                  res.message || "Não foi possível cancelar.",
                                                );
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
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              </table>
                            </>
                          )}

                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
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

      {tenantId && companyId && plan && editingMarket && (
        <PlaceFormModal
          open={marketModalOpen}
          onOpenChange={(v) => {
            setMarketModalOpen(v);
            if (!v) setEditingMarket(null);
          }}
          tenantId={tenantId}
          companyId={companyId}
          campaignId={plan.id}
          market={editingMarket}
          mode="paid-media"
          onSaved={load}
        />
      )}
    </div>
  );
}

const Metric = ({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div className={cn("bg-background p-4", strong && "border-l-[3px] border-l-primary")}>
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
    <p
      className={cn(
        "mt-1 tabular-nums",
        strong ? "text-xl font-black" : "text-sm font-bold text-muted-foreground",
      )}
    >
      {value}
    </p>
  </div>
);

/** Data curta pt-BR sem fuso: o valor é uma data pura (YYYY-MM-DD). */
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
};

