import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  campaignStatusLabel,
  loadCampaigns,
  placeBudgetLabel,
  placeDate,
  placeLabel,
  placeOrderLabel,
  placeWindow,
  sortCampaignsForExpansion,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";
import { STAGE_OPTIONS } from "@/lib/systemsClients";
import PlaceFormModal from "./PlaceFormModal";

interface ExpansionTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  onOpenCommercial: () => void;
}

interface CommercialRow {
  acquisition_campaign_id: string | null;
  lifecycle: string | null;
  commercial_stage: string | null;
}

/**
 * PLANO DE EXPANSÃO: cada registro de `marketing_campaigns` é, para o usuário,
 * uma PRAÇA (onda territorial). O cronograma editorial (period_plan) é único e
 * pode ser reutilizado entre cidades — por isso esta aba não filtra produção.
 */
export default function ExpansionTab({ tenantId, companyId, onOpenCommercial }: ExpansionTabProps) {
  const [places, setPlaces] = useState<MarketingCampaign[]>([]);
  const [commercial, setCommercial] = useState<CommercialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !companyId) {
      setPlaces([]);
      setCommercial([]);
      return;
    }
    setLoading(true);
    try {
      const [rows, comm] = await Promise.all([
        loadCampaigns(tenantId, companyId),
        (supabase as any)
          .from("systems_clients")
          .select("acquisition_campaign_id, lifecycle, commercial_stage")
          .eq("tenant_id", tenantId)
          .not("acquisition_campaign_id", "is", null),
      ]);
      setPlaces(sortCampaignsForExpansion(rows));
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

  const statsByPlace = useMemo(() => {
    const map = new Map<
      string,
      { total: number; negotiating: number; won: number; customers: number; stages: Record<string, number> }
    >();
    places.forEach((p) => {
      const rows = commercial.filter((r) => r.acquisition_campaign_id === p.id);
      const stages: Record<string, number> = {};
      STAGE_OPTIONS.forEach(({ value }) => {
        stages[value] = rows.filter((r) => r.commercial_stage === value).length;
      });
      map.set(p.id, {
        total: rows.length,
        negotiating: (stages.avaliacao || 0) + (stages.negociacao || 0),
        won: stages.ganho || 0,
        customers: rows.filter((r) => r.lifecycle === "customer").length,
        stages,
      });
    });
    return map;
  }, [places, commercial]);

  const nextOrder = useMemo(
    () => places.reduce((max, p) => Math.max(max, p.sequence_order ?? 0), 0) + 1,
    [places],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight">Plano de expansão</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cada praça tem sua própria janela comercial. O cronograma de conteúdo é único e pode ser
            reutilizado entre cidades.
          </p>
        </div>
        {companyId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar praça
          </Button>
        )}
      </div>

      {places.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : "Nenhuma praça de expansão cadastrada."}
        </p>
      ) : (
        <div className="divide-y border-y">
          {places.map((place, index) => {
            const stats = statsByPlace.get(place.id);
            const isOpen = expanded === place.id;
            return (
              <div key={place.id} className="py-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span className="text-2xl font-black tabular-nums leading-none text-primary">
                    {placeOrderLabel(place, index)}
                  </span>
                  <div className="min-w-[150px]">
                    <p className="text-sm font-black">{placeLabel(place)}</p>
                    <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {campaignStatusLabel(place.status)}
                    </p>
                  </div>

                  <Field label="Investimento" value={placeBudgetLabel(place.paid_traffic_budget)} />
                  <Field
                    label="Anúncios"
                    value={placeWindow(place.ads_start_date, place.ads_end_date)}
                  />
                  <Field label="Ligações" value={placeDate(place.calls_start_date)} />
                  <Field label="Visitas" value={placeDate(place.visits_start_date)} />
                  <Field label="Oportunidades" value={String(stats?.total ?? 0)} />
                  <Field
                    label="Avaliação/negociação"
                    value={String(stats?.negotiating ?? 0)}
                  />
                  <Field label="Ganhos/clientes" value={`${stats?.won ?? 0}/${stats?.customers ?? 0}`} />

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : place.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
                    >
                      Ver detalhes
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setEditing(place);
                        setModalOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 grid gap-6 border-l-2 border-primary pl-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      {(place.objective || "").trim() && (
                        <Detail label="Objetivo comercial" value={place.objective!} />
                      )}
                      {place.channels.length > 0 && (
                        <Detail label="Canais" value={place.channels.join(", ")} />
                      )}
                      {(place.acquisition_strategy || "").trim() && (
                        <Detail label="Abordagem" value={place.acquisition_strategy!} />
                      )}
                      {(place.observations || "").trim() && (
                        <Detail label="Observações" value={place.observations!} />
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Distribuição por etapa
                      </p>
                      <dl className="mt-3 divide-y border-y text-sm">
                        {STAGE_OPTIONS.map(({ value, label }) => (
                          <div key={value} className="flex items-baseline justify-between gap-4 py-2">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-bold tabular-nums">{stats?.stages[value] ?? 0}</dd>
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {tenantId && companyId && (
        <PlaceFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          tenantId={tenantId}
          companyId={companyId}
          place={editing}
          nextOrder={nextOrder}
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
