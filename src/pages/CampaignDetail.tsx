import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarRange,
  Handshake,
  Loader2,
  MapPin,
  Megaphone,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CampaignFormModal from "@/components/campaigns/CampaignFormModal";
import {
  campaignRegionLabel,
  campaignStatusLabel,
  countCampaignStages,
  loadCampaign,
  loadCampaignCommercial,
  loadCampaignMedia,
  loadCompanyStrategies,
  summarizeCampaignCommercial,
  type CampaignMediaSummary,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";
import { stageLabel } from "@/lib/systemsClients";

const fmtDate = (v?: string | null) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";

const fmtMoney = (v?: number | null) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [media, setMedia] = useState<CampaignMediaSummary | null>(null);
  const [commercial, setCommercial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [strategyLabel, setStrategyLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !id) return;
    setLoading(true);
    try {
      const c = await loadCampaign(id);
      setCampaign(c);
      if (c) {
        const [m, comm] = await Promise.all([
          loadCampaignMedia(tenantId, c.id),
          loadCampaignCommercial(tenantId, c.id),
        ]);
        setMedia(m);
        setCommercial(comm);
        if (c.strategy_id) {
          try {
            const list = await loadCompanyStrategies(tenantId, c.company_id);
            setStrategyLabel(list.find((s) => s.id === c.strategy_id)?.label ?? null);
          } catch {
            setStrategyLabel(null);
          }
        } else {
          setStrategyLabel(null);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar a campanha.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10 text-center text-sm text-muted-foreground">
        Campanha não encontrada.
      </div>
    );
  }

  const comm = summarizeCampaignCommercial(commercial);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate("/campanhas")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Campanhas
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">{campaign.name}</h1>
              <Badge variant="outline" className="text-[10px] font-black uppercase">
                {campaignStatusLabel(campaign.status)}
              </Badge>
            </div>
            {campaign.objective && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{campaign.objective}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => navigate(`/plan-period?campaign=${campaign.id}`)}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            Planejar período nesta campanha
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            Editar campanha
          </Button>
        </div>
      </div>

      {/* GERAL */}
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Janela
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {fmtDate(campaign.start_date)} → {fmtDate(campaign.end_date)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Região
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            {campaignRegionLabel(campaign)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Tráfego pago
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            {fmtMoney(campaign.paid_traffic_budget)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Canais
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold">
            <Target className="h-4 w-4 text-muted-foreground" />
            {campaign.channels.length ? campaign.channels.join(", ") : "—"}
          </p>
        </div>
      </section>

      {strategyLabel && (
        <section className="mb-4 rounded-xl border bg-card p-4">
          <h2 className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Estratégia vinculada
          </h2>
          <p className="text-sm font-semibold">{strategyLabel}</p>
        </section>
      )}

      {campaign.acquisition_strategy && (
        <section className="mb-8 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Estratégia de aquisição
          </h2>
          <p className="whitespace-pre-wrap text-sm">{campaign.acquisition_strategy}</p>
        </section>
      )}

      {/* MÍDIA */}
      <section className="mb-8 space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Mídia
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Períodos" value={media?.periods.length ?? 0} />
          <Metric label="Demandas" value={media?.demandsTotal ?? 0} />
          <Metric label="Impulsionadas" value={media?.demandsBoosted ?? 0} />
          <Metric label="Publicadas" value={media?.demandsPublished ?? 0} />
        </div>
        <div className="rounded-xl border bg-card">
          {media?.periods.length ? (
            <ul className="divide-y">
              {media.periods.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.period_title || "Período"}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(p.period_start)} → {fmtDate(p.period_end)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => navigate("/plan-period?tab=history")}
                  >
                    Ver período
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <p className="text-sm text-muted-foreground">
                Nenhum período vinculado. Planeje um período já dentro desta campanha para conectar
                as demandas de Mídia ao Comercial.
              </p>
              <Button
                size="sm"
                onClick={() => navigate(`/plan-period?campaign=${campaign.id}`)}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Planejar período nesta campanha
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* COMERCIAL */}
      <section className="space-y-3 pb-10">
        <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Comercial
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Oportunidades" value={comm.total} />
          <Metric label="Prospects" value={comm.prospects} />
          <Metric label="Clientes" value={comm.customers} />
          <Metric label="Ganhos" value={comm.won} />
        </div>
        <div className="flex flex-wrap gap-2">
          {countCampaignStages(commercial).map(({ stage, count }) => (
            <Badge
              key={stage}
              variant={count > 0 ? "secondary" : "outline"}
              className="text-[10px] font-black uppercase"
            >
              {stageLabel(stage)}: {count}
            </Badge>
          ))}
        </div>
        <div className="rounded-xl border bg-card">
          {commercial.length ? (
            <ul className="divide-y">
              {commercial.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[row.city, stageLabel(row.commercial_stage)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black uppercase">
                    {row.lifecycle === "customer" ? "Cliente" : "Prospect"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <p className="text-sm text-muted-foreground">
                Nenhuma oportunidade atribuída a esta campanha ainda.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/comercial-sistemas")}
              >
                <Handshake className="mr-1.5 h-4 w-4" />
                Abrir Comercial
              </Button>
            </div>
          )}
        </div>
      </section>

      <CampaignFormModal
        open={editOpen}
        campaign={campaign}
        companyId={campaign.company_id}
        onOpenChange={setEditOpen}
        onSaved={load}
      />
    </div>
  );
}
