import { useEffect, useMemo, useState } from "react";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";
import type { WorkspaceDemand, WorkspacePlanItem } from "@/hooks/useClientPeriodWorkspace";
import { summarizePaidMedia } from "@/lib/acquisitionView";
import {
  formatActivationBudget,
  loadPaidMediaActivations,
  summarizePaidMediaActivations,
  type PaidMediaActivation,
} from "@/lib/paidMediaActivations";
import RegionalPlanTable from "./RegionalPlanTable";


const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{children}</h2>
);

interface StrategyTabProps {
  tenantId?: string | null;
  companyId?: string | null;
  period: CurrentPeriodInfo | null;
  planItems: WorkspacePlanItem[];
  demands: WorkspaceDemand[];
  strategyText: string | null;
  onOpenStrategy: () => void;
  onOpenPeriodHistory: () => void;
  /** Cidade em foco pelo deep link (`?market=`). */
  selectedMarketId?: string | null;
  /** Encaminha a cidade para a aba Mídia paga. */
  onOpenPaidMedia?: (marketId: string) => void;
  /** Encaminha a carteira para a aba Comercial. */
  onOpenCommercial?: (marketId?: string) => void;
}

export default function StrategyTab({
  tenantId,
  companyId,
  period,
  planItems,
  demands,
  strategyText,
  onOpenStrategy,
  onOpenPeriodHistory,
  selectedMarketId,
  onOpenPaidMedia,
  onOpenCommercial,
}: StrategyTabProps) {

  const channels = [
    ...new Set(
      planItems
        .flatMap((i) => (i.canal || "").split(","))
        .map((c) => c.trim())
        .filter(Boolean)
    ),
  ];

  const objectives = [
    ...new Set(planItems.map((i) => (i.objetivo || "").trim()).filter(Boolean)),
  ].slice(0, 6);

  const paidBudget = (period?.paid_traffic_budget || "").trim();
  const generalBudget = (period?.budget || "").trim();
  const periodObjective = (period?.objective || "").trim();
  // Mídia paga é real quando há verba OU conteúdos marcados como anúncio.
  const paidMedia = summarizePaidMedia({
    demands,
    paidTrafficBudget: period?.paid_traffic_budget ?? null,
    budget: period?.budget ?? null,
  });
  // Fonte de verdade da execução paga: ativações territoriais das peças do ciclo.
  const [activations, setActivations] = useState<PaidMediaActivation[]>([]);
  const demandIds = useMemo(() => demands.map((d) => d.id), [demands]);
  useEffect(() => {
    if (!tenantId || !companyId || demandIds.length === 0) {
      setActivations([]);
      return;
    }
    let cancelled = false;
    loadPaidMediaActivations(tenantId, companyId, { demandIds })
      .then((rows) => {
        if (!cancelled) setActivations(rows);
      })
      .catch((err) => console.error("[StrategyTab] ativações", err));
    return () => {
      cancelled = true;
    };
  }, [tenantId, companyId, demandIds]);

  const activationSummary = useMemo(
    () => summarizePaidMediaActivations(activations),
    [activations],
  );
  const hasActivations = activationSummary.total - activationSummary.cancelled > 0;
  const hasPaidMedia = paidMedia.hasPaidMedia || hasActivations;

  return (
    <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-14">
      <div className="space-y-10">
        <section>
          <SectionTitle>Estratégia geral</SectionTitle>
          {strategyText ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {strategyText.length > 1600 ? `${strategyText.slice(0, 1600)}…` : strategyText}
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma estratégia registrada para este cliente.
            </p>
          )}
          <button
            type="button"
            onClick={onOpenStrategy}
            className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Abrir estratégia completa
          </button>
        </section>

        {/* Plano regional: posicionamento das cidades, sem verba nem comercial. */}
        <RegionalPlanTable
          tenantId={tenantId}
          companyId={companyId}
          selectedMarketId={selectedMarketId}
          onOpenPaidMedia={onOpenPaidMedia}
          onOpenCommercial={onOpenCommercial}
        />
      </div>


      <div className="space-y-10">
        {/* Mídia paga */}
        <section className="bg-primary p-6 text-primary-foreground">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Mídia paga</p>
          {hasPaidMedia ? (
            <>
              <h3 className="mt-3 text-xl font-black leading-tight">
                Fazer cada anúncio cumprir uma função.
              </h3>
              <dl className="mt-5 space-y-3 text-sm">
                {paidBudget && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                    <dt className="opacity-80">Verba do ciclo editorial</dt>
                    <dd className="font-bold">{paidBudget}</dd>
                  </div>
                )}
                {generalBudget && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                    <dt className="opacity-80">Orçamento do período</dt>
                    <dd className="font-bold">{generalBudget}</dd>
                  </div>
                )}
                {hasActivations && (
                  <>
                    <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                      <dt className="opacity-80">Conteúdos com ativação</dt>
                      <dd className="font-bold tabular-nums">{activationSummary.demandsActivated}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                      <dt className="opacity-80">Ativações do período</dt>
                      <dd className="font-bold tabular-nums">
                        {activationSummary.total - activationSummary.cancelled}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                      <dt className="opacity-80">Verba nas ativações</dt>
                      <dd className="font-bold tabular-nums">
                        {formatActivationBudget(activationSummary.budgetTotal)}
                        {activationSummary.budgetUndefinedCount > 0 ? " · há verba a definir" : ""}
                      </dd>
                    </div>
                  </>
                )}
                <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                  <dt className="opacity-80">Marcados para anúncio (sem ativação)</dt>
                  <dd className="font-bold tabular-nums">{paidMedia.adMarkedCount}</dd>
                </div>
                {paidMedia.adPlanEnabledCount > 0 && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                    <dt className="opacity-80">Com plano de anúncio configurado</dt>
                    <dd className="font-bold tabular-nums">{paidMedia.adPlanEnabledCount}</dd>
                  </div>
                )}
                {!paidBudget && !generalBudget && (
                  <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
                    <dt className="opacity-80">Verba do ciclo editorial</dt>
                    <dd className="font-bold">A definir</dd>
                  </div>
                )}
              </dl>
              {periodObjective && (
                <p className="mt-4 text-xs leading-relaxed opacity-85">{periodObjective}</p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed opacity-80">
                A verba por cidade e a verba de cada ativação vivem na aba Mídia paga — esta verba
                é do ciclo editorial.

              </p>
            </>
          ) : (
            <>
              <h3 className="mt-3 text-xl font-black leading-tight">
                Nenhum plano de mídia paga neste período.
              </h3>
              <p className="mt-4 text-xs leading-relaxed opacity-85">
                Quando o período tiver verba de tráfego pago definida no planejamento, a distribuição
                dos anúncios aparece aqui.
              </p>
            </>
          )}
        </section>



        <section>
          <SectionTitle>Canais prioritários</SectionTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {channels.length ? (
              channels.map((c) => (
                <span
                  key={c}
                  className="bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary"
                >
                  {c}
                </span>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sem canais definidos no plano.</p>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>Objetivo editorial do ciclo</SectionTitle>
          {objectives.length ? (
            <ol className="mt-4 divide-y border-y">
              {objectives.map((o, i) => (
                <li key={i} className="flex gap-4 py-3">
                  <span className="text-lg font-black leading-none tabular-nums text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{o}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Sem objetivos mapeados.</p>
          )}
          <button
            type="button"
            onClick={onOpenPeriodHistory}
            className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Histórico de períodos
          </button>
        </section>
      </div>
    </div>
  );
}
