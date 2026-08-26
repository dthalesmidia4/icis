import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  loadCampaigns,
  placeLabel,
  placeOrderLabel,
  sortCampaignsForExpansion,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";
import {
  PAID_MEDIA_PLATFORM_OPTIONS,
  PAID_MEDIA_STATUS_OPTIONS,
  cancelPaidMediaActivation,
  formatActivationBudget,
  loadPaidMediaActivations,
  paidMediaStatusLabel,
  summarizePaidMediaActivations,
  type PaidMediaActivation,
} from "@/lib/paidMediaActivations";
import { isAdEnabled } from "@/lib/adPlan";
import { placeWindow } from "@/lib/marketingCampaigns";
import ActivationFormModal, { type ActivationDemandOption } from "./ActivationFormModal";

interface PaidMediaTabProps {
  tenantId: string | null | undefined;
  companyId: string | null | undefined;
  currentPeriodId: string | null | undefined;
}

interface DemandRow {
  id: string;
  title: string;
  publish_date: string | null;
  period_plan_id: string | null;
  ad_plan: Record<string, any> | null;
}

/**
 * MÍDIA PAGA: única área dedicada à execução paga. A fonte operacional é
 * `paid_media_activations`; `demands.ad_plan` aparece somente como informação
 * complementar da peça (briefing), nunca como praça ou verba executável.
 */
export default function PaidMediaTab({ tenantId, companyId, currentPeriodId }: PaidMediaTabProps) {
  const [places, setPlaces] = useState<MarketingCampaign[]>([]);
  const [demands, setDemands] = useState<DemandRow[]>([]);
  const [activations, setActivations] = useState<PaidMediaActivation[]>([]);
  const [loading, setLoading] = useState(false);
  const [placeFilter, setPlaceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaidMediaActivation | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !companyId) {
      setPlaces([]);
      setDemands([]);
      setActivations([]);
      return;
    }
    setLoading(true);
    try {
      const [camps, acts, dem] = await Promise.all([
        loadCampaigns(tenantId, companyId),
        loadPaidMediaActivations(tenantId, companyId),
        supabase
          .from("demands")
          .select("id, title, publish_date, period_plan_id, ad_plan")
          .eq("tenant_id", tenantId)
          .eq("client_id", companyId)
          .eq("work_area", "midia")
          .eq("is_draft", false)
          .order("publish_date", { ascending: true, nullsFirst: false }),
      ]);
      setPlaces(sortCampaignsForExpansion(camps));
      setActivations(acts);
      setDemands((dem.data || []) as unknown as DemandRow[]);
    } catch (err) {
      console.error("[PaidMediaTab]", err);
      toast.error("Não foi possível carregar as ativações de mídia paga.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const demandById = useMemo(() => {
    const map = new Map<string, DemandRow>();
    demands.forEach((d) => map.set(d.id, d));
    return map;
  }, [demands]);

  const placeById = useMemo(() => {
    const map = new Map<string, { label: string; order: string }>();
    places.forEach((p, index) =>
      map.set(p.id, { label: placeLabel(p), order: placeOrderLabel(p, index) }),
    );
    return map;
  }, [places]);

  /** Resumo do PERÍODO ATUAL: só ativações de peças do ciclo em andamento. */
  const periodSummary = useMemo(() => {
    const periodDemandIds = new Set(
      demands.filter((d) => currentPeriodId && d.period_plan_id === currentPeriodId).map((d) => d.id),
    );
    return summarizePaidMediaActivations(
      activations.filter((a) => periodDemandIds.has(a.demand_id)),
    );
  }, [activations, demands, currentPeriodId]);

  const visible = useMemo(
    () =>
      activations.filter((a) => {
        if (placeFilter !== "all" && a.campaign_id !== placeFilter) return false;
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (platformFilter !== "all" && a.platform !== platformFilter) return false;
        return true;
      }),
    [activations, placeFilter, statusFilter, platformFilter],
  );

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight">Mídia paga</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cada linha é uma ativação: uma peça rodando em uma praça, com verba e janela próprias. O
            calendário editorial não muda.
          </p>
        </div>
        {places.length > 0 && (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova ativação
          </Button>
        )}
      </div>

      <div className="grid gap-px border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Verba planejada" value={formatActivationBudget(periodSummary.budgetTotal)} />
        <Metric
          label="Sem verba definida"
          value={`${periodSummary.budgetUndefinedCount} ativações`}
        />
        <Metric label="Rodando" value={String(periodSummary.running)} />
        <Metric label="Planejadas" value={String(periodSummary.planned)} />
        <Metric label="Concluídas" value={String(periodSummary.completed)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          value={placeFilter}
          onChange={setPlaceFilter}
          placeholder="Praça"
          options={[
            { value: "all", label: "Todas as praças" },
            ...places.map((p, i) => ({ value: p.id, label: `${placeOrderLabel(p, i)} ${placeLabel(p)}` })),
          ]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Status"
          options={[{ value: "all", label: "Todos os status" }, ...PAID_MEDIA_STATUS_OPTIONS]}
        />
        <FilterSelect
          value={platformFilter}
          onChange={setPlatformFilter}
          placeholder="Plataforma"
          options={[
            { value: "all", label: "Todas as plataformas" },
            ...PAID_MEDIA_PLATFORM_OPTIONS.map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Carregando…"
            : places.length === 0
              ? "Cadastre uma praça na aba Expansão para criar ativações."
              : "Nenhuma ativação de mídia paga registrada."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                <th className="py-2 pr-4">Conteúdo</th>
                <th className="py-2 pr-4">Praça</th>
                <th className="py-2 pr-4">Plataforma</th>
                <th className="py-2 pr-4">Período</th>
                <th className="py-2 pr-4">Verba</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Objetivo</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((a) => {
                const demand = demandById.get(a.demand_id);
                const place = placeById.get(a.campaign_id);
                const objective = (a.objective || "").trim();
                return (
                  <tr key={a.id} className="align-top">
                    <td className="py-3 pr-4">
                      <p className="font-bold">{demand?.title || "Conteúdo removido"}</p>
                      {demand && isAdEnabled(demand.ad_plan) && (
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          Peça com plano de anúncio
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {place ? `${place.order} ${place.label}` : "—"}
                    </td>
                    <td className="py-3 pr-4">{a.platform}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {placeWindow(a.start_date, a.end_date)}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{formatActivationBudget(a.budget)}</td>
                    <td className="py-3 pr-4">{paidMediaStatusLabel(a.status)}</td>
                    <td className="max-w-[240px] py-3 pr-4 text-muted-foreground">
                      {objective ? (objective.length > 90 ? `${objective.slice(0, 90)}…` : objective) : "—"}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setEditing(a);
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tenantId && companyId && (
        <ActivationFormModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          tenantId={tenantId}
          companyId={companyId}
          places={places}
          demands={demandOptions}
          activation={editing}
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

const FilterSelect = ({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-9 w-[210px] text-xs">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
