import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  baseMarketsOf,
  expansionMarketsOf,
  loadExpansionMarkets,
  loadExpansionPlan,
  marketBudgetLabel,
  marketLabel,
  marketStatusLabel,
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
import {
  isActivationCancelled,
  loadPaidMediaActivations,
  type PaidMediaActivation,
} from "@/lib/paidMediaActivations";
import PlaceFormModal from "./PlaceFormModal";
import PlanConfigModal from "./PlanConfigModal";
import ExpansionMarketRow from "./ExpansionMarketRow";
import ExpansionMarketDetails from "./ExpansionMarketDetails";

interface ExpansionTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  /** Abre o Comercial já no contexto da praça e, quando informado, do registro. */
  onOpenCommercial: (marketId?: string, opportunityId?: string) => void;
  /** Leva para a aba Mídia paga já com a praça selecionada (sem rota nova). */
  onOpenPaidMedia?: (marketId: string) => void;
  /** Praça destacada por deep link (`market=`). */
  selectedMarketId?: string | null;
}

/**
 * PLANO DE EXPANSÃO REGIONAL: UM plano (`marketing_campaigns`) com uma BASE
 * comercial existente e N cidades numeradas. Leitura VERTICAL em faixas
 * operacionais — nunca uma megatabela horizontal. Os leads exibidos são os
 * MESMOS registros comerciais e a execução real vem dos touchpoints já
 * registrados no Comercial.
 */
export default function ExpansionTab({
  tenantId,
  companyId,
  onOpenCommercial,
  onOpenPaidMedia,
  selectedMarketId,
}: ExpansionTabProps) {
  const [plan, setPlan] = useState<MarketingCampaign | null>(null);
  const [markets, setMarkets] = useState<ExpansionMarket[]>([]);
  const [leads, setLeads] = useState<MarketLead[]>([]);
  const [activations, setActivations] = useState<PaidMediaActivation[]>([]);
  const [touchpoints, setTouchpoints] = useState<
    { subclient_id: string | null; touchpoint_type: string; occurred_at: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpansionMarket | null>(null);
  const autoExpanded = useRef(false);

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
      const activePlan = await loadExpansionPlan(tenantId, companyId);
      setPlan(activePlan);
      const [rows, leadRows, acts] = await Promise.all([
        loadExpansionMarkets(tenantId, companyId, activePlan?.id ?? null),
        loadMarketLeads(tenantId, companyId),
        loadPaidMediaActivations(tenantId, companyId).catch(
          () => [] as PaidMediaActivation[],
        ),
      ]);
      setMarkets(rows);
      setLeads(leadRows);
      setActivations(acts);
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

  // A execução real vive no Comercial: ao voltar o foco para a aba, recarrega.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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

  const activationsByMarket = useMemo(() => {
    const map = new Map<string, PaidMediaActivation[]>();
    activations
      .filter((a) => !isActivationCancelled(a.status) && a.market_id)
      .forEach((a) => {
        const list = map.get(a.market_id!) || [];
        list.push(a);
        map.set(a.market_id!, list);
      });
    return map;
  }, [activations]);

  const nextOrder = useMemo(
    () => expansionRows.reduce((max, m) => Math.max(max, m.sequence_order ?? 0), 0) + 1,
    [expansionRows],
  );

  // Base com carteira ativa abre por padrão quando nada foi escolhido.
  useEffect(() => {
    if (autoExpanded.current) return;
    if (markets.length === 0) return;
    autoExpanded.current = true;
    if (selectedMarketId && markets.some((m) => m.id === selectedMarketId)) {
      setExpanded(selectedMarketId);
      return;
    }
    const baseWithLeads = bases.find((b) => (leadsByMarket.get(b.id) ?? []).length > 0);
    if (baseWithLeads) setExpanded(baseWithLeads.id);
  }, [markets, bases, leadsByMarket, selectedMarketId]);

  const renderMarket = (market: ExpansionMarket) => {
    const stats = statsByMarket.get(market.id) ?? EMPTY_MARKET_STATS;
    const marketLeads = leadsByMarket.get(market.id) ?? [];
    const marketActivations = activationsByMarket.get(market.id) ?? [];
    const allocated = marketActivations.reduce((s, a) => s + (a.budget ?? 0), 0);
    const isOpen = expanded === market.id;
    return (
      <ExpansionMarketRow
        key={market.id}
        market={market}
        stats={stats}
        open={isOpen}
        onToggle={() => setExpanded(isOpen ? null : market.id)}
        onEdit={() => {
          setEditing(market);
          setMarketModalOpen(true);
        }}
        onOpenPaidMedia={onOpenPaidMedia ? () => onOpenPaidMedia(market.id) : undefined}
      >
        <ExpansionMarketDetails
          market={market}
          stats={stats}
          leads={marketLeads}
          activationsCount={marketActivations.length}
          allocatedBudget={allocated}
          onOpenLead={(leadId) => onOpenCommercial(market.id, leadId)}
          onOpenCommercial={() => onOpenCommercial(market.id)}
          onOpenPaidMedia={onOpenPaidMedia ? () => onOpenPaidMedia(market.id) : undefined}
        />
      </ExpansionMarketRow>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-black leading-tight">Plano de expansão regional</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um único plano comercial. O conteúdo é produzido uma vez; mídia, ligações e visitas
            avançam cidade por cidade.
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
              <Field label="Cidades na expansão" value={String(summary.totalExpansionCities)} />
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
            <div className="space-y-8">
              {bases.length > 0 && (
                <section>
                  <p className="border-b pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Base comercial existente
                  </p>
                  {bases.map(renderMarket)}
                </section>
              )}
              <section>
                <p className="border-b pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Sequência de expansão
                </p>
                {expansionRows.map(renderMarket)}
              </section>
            </div>
          )}

          {orphanLeads.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Oportunidades sem cidade operacional
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {orphanLeads.length} oportunidade(s) comercial(is) ainda sem carteira operacional. A
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
