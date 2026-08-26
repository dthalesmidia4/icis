import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { CurrentPeriodInfo } from "@/lib/periodCounts";
import type { WorkspaceDemand } from "@/hooks/useClientPeriodWorkspace";
import {
  campaignRegionLabel,
  campaignStatusLabel,
  loadCampaign,
  loadCampaignCommercial,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";
import {
  formatPeriodWindow,
  summarizeAcquisitionCommercial,
  summarizePaidMedia,
  type AcquisitionCommercialRow,
} from "@/lib/acquisitionView";

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{children}</h2>
);

interface AcquisitionTabProps {
  tenantId: string | null | undefined;
  period: CurrentPeriodInfo | null;
  demands: WorkspaceDemand[];
  onOpenCommercial: () => void;
}

/**
 * Visão INTEGRADA de aquisição: recorte da campanha interna + mídia paga do
 * período + resultado comercial atribuído. Não é editor de campanha e não
 * oferece planejamento — o Client Hub é a única central de Mídia.
 */
export default function AcquisitionTab({
  tenantId,
  period,
  demands,
  onOpenCommercial,
}: AcquisitionTabProps) {
  const campaignId = period?.campaign_id || null;
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [commercial, setCommercial] = useState<AcquisitionCommercialRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!campaignId || !tenantId) {
      setCampaign(null);
      setCommercial([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [c, rows] = await Promise.all([
          loadCampaign(campaignId),
          loadCampaignCommercial(tenantId, campaignId),
        ]);
        if (cancelled) return;
        setCampaign(c);
        setCommercial((rows || []) as AcquisitionCommercialRow[]);
      } catch (err) {
        console.error("[AcquisitionTab]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, tenantId]);

  const paidMedia = useMemo(
    () =>
      summarizePaidMedia({
        demands,
        paidTrafficBudget: period?.paid_traffic_budget ?? null,
        budget: period?.budget ?? null,
      }),
    [demands, period?.paid_traffic_budget, period?.budget]
  );

  const funnel = useMemo(() => summarizeAcquisitionCommercial(commercial), [commercial]);

  if (!campaignId) {
    return (
      <div className="max-w-2xl space-y-3">
        <SectionTitle>Aquisição</SectionTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Este período não faz parte de um recorte de aquisição. A visão integrada aparece quando o
          ciclo está costurado a um recorte comercial.
        </p>
      </div>
    );
  }

  const acquisitionText = (campaign?.acquisition_strategy || "").trim();
  const clientAcquisition = (period?.client_acquisition || "").trim();

  return (
    <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-14">
      <div className="space-y-10">
        <section>
          <SectionTitle>Recorte de aquisição</SectionTitle>
          <h3 className="mt-3 text-2xl font-black leading-tight">
            {campaign?.name || (loading ? "Carregando…" : "Recorte não encontrado")}
          </h3>
          <dl className="mt-5 divide-y border-y text-sm">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-bold">{campaignStatusLabel(campaign?.status)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Região</dt>
              <dd className="font-bold">{campaign ? campaignRegionLabel(campaign) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Objetivo de negócio</dt>
              <dd className="max-w-[60%] text-right font-bold">
                {(campaign?.objective || "").trim() || "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Período atual</dt>
              <dd className="font-bold tabular-nums">
                {formatPeriodWindow(period?.period_start, period?.period_end)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Canais</dt>
              <dd className="max-w-[60%] text-right font-bold">
                {campaign?.channels?.length ? campaign.channels.join(", ") : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <SectionTitle>Como este ciclo converte</SectionTitle>
          {acquisitionText || clientAcquisition ? (
            <div className="mt-4 space-y-4">
              {acquisitionText && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {acquisitionText.length > 1400 ? `${acquisitionText.slice(0, 1400)}…` : acquisitionText}
                </p>
              )}
              {clientAcquisition && (
                <div className="border-l-2 border-primary pl-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Aquisição no período
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {clientAcquisition}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum caminho de conversão descrito para este ciclo.
            </p>
          )}
        </section>
      </div>

      <div className="space-y-10">
        <section className="bg-primary p-6 text-primary-foreground">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Mídia paga</p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
              <dt className="opacity-80">Verba do período</dt>
              <dd className="font-bold">{paidMedia.budgetLabel || "Nenhuma verba cadastrada"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-primary-foreground/20 pb-2">
              <dt className="opacity-80">Conteúdos para mídia paga</dt>
              <dd className="font-bold tabular-nums">{paidMedia.adMarkedCount}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="opacity-80">Com plano de anúncio</dt>
              <dd className="font-bold tabular-nums">{paidMedia.adPlanEnabledCount}</dd>
            </div>
          </dl>
        </section>

        <section>
          <SectionTitle>Resultado comercial</SectionTitle>
          {funnel.total === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma oportunidade atribuída a este ciclo ainda.
            </p>
          ) : (
            <dl className="mt-4 divide-y border-y text-sm">
              {funnel.stages.map((s) => (
                <div key={s.stage} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="font-bold tabular-nums">{s.count}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Clientes</dt>
                <dd className="font-bold tabular-nums">{funnel.customers}</dd>
              </div>
            </dl>
          )}
          <button
            type="button"
            onClick={onOpenCommercial}
            className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Abrir Comercial
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      </div>
    </div>
  );
}
