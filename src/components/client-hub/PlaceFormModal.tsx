import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CAMPAIGN_CHANNEL_OPTIONS } from "@/lib/marketingCampaigns";
import {
  MARKET_STATUS_OPTIONS,
  marketDisplayLabel,
  saveExpansionMarket,
  validateExpansionMarketInput,
  type ExpansionMarket,
  type MarketEditMode,
  type MarketStatus,
} from "@/lib/expansionMarkets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  companyId: string;
  /** Plano único de expansão ao qual a cidade pertence. */
  campaignId: string;
  market?: ExpansionMarket | null;
  nextOrder?: number;
  /**
   * Área de trabalho que abriu o editor. Cada área vê e grava SOMENTE os seus
   * campos; campos ocultos nunca são reescritos.
   */
  mode?: MarketEditMode;
  onSaved?: () => void;
}

interface FormState {
  /** Base existente x etapa de expansão — nunca inferido. */
  marketType: "base" | "expansion";
  sequenceOrder: string;
  city: string;
  state: string;
  status: MarketStatus;
  objective: string;
  paidTrafficBudget: string;
  adsStartDate: string;
  adsEndDate: string;
  callsStartDate: string;
  visitsStartDate: string;
  visitsEndDate: string;
  travelDistanceKm: string;
  targetAccounts: string;
  channels: string[];
  acquisitionStrategy: string;
  observations: string;
}

const empty = (nextOrder: number): FormState => ({
  marketType: "expansion",
  sequenceOrder: String(nextOrder || 1),
  city: "",
  state: "",
  status: "planning",
  objective: "",
  paidTrafficBudget: "",
  adsStartDate: "",
  adsEndDate: "",
  callsStartDate: "",
  visitsStartDate: "",
  visitsEndDate: "",
  travelDistanceKm: "",
  targetAccounts: "",
  channels: [],
  acquisitionStrategy: "",
  observations: "",
});

const fromMarket = (m: ExpansionMarket): FormState => ({
  marketType: m.market_type === "base" ? "base" : "expansion",
  sequenceOrder: m.sequence_order ? String(m.sequence_order) : "",
  city: m.city || "",
  state: m.state || "",
  status: m.status,
  objective: m.objective || "",
  paidTrafficBudget: m.paid_traffic_budget !== null ? String(m.paid_traffic_budget) : "",
  adsStartDate: m.ads_start_date || "",
  adsEndDate: m.ads_end_date || "",
  callsStartDate: m.calls_start_date || "",
  visitsStartDate: m.visits_start_date || "",
  visitsEndDate: m.visits_end_date || "",
  travelDistanceKm: m.travel_distance_km !== null ? String(m.travel_distance_km) : "",
  targetAccounts: m.target_accounts !== null ? String(m.target_accounts) : "",
  channels: m.channels || [],
  acquisitionStrategy: m.acquisition_strategy || "",
  observations: m.observations || "",
});

const COPY: Record<MarketEditMode, { title: string; description: string }> = {
  strategy: {
    title: "Cidade do plano regional",
    description:
      "Aqui vive o posicionamento da cidade: ordem, status, distância, meta de alvos e abordagem. Verba de anúncios e agenda comercial são editadas nas abas Mídia paga e Comercial.",
  },
  "paid-media": {
    title: "Verba e janela de anúncios",
    description:
      "Somente o planejamento pago desta cidade. Nada do plano regional ou da agenda comercial é alterado.",
  },
  commercial: {
    title: "Agenda comercial da cidade",
    description:
      "Somente as janelas de ligações e visitas desta cidade. O plano regional e a verba de anúncios permanecem intactos.",
  },
  full: {
    title: "Cidade do plano de expansão",
    description:
      "Todos os campos da cidade. O conteúdo continua sendo produzido uma vez e distribuído em todas as etapas.",
  },
};

/**
 * Editor da CIDADE/ETAPA do plano único de expansão
 * (`marketing_campaign_markets`). Nunca cria uma nova campanha/plano e nunca
 * pede nome de plano — a cidade é subordinada ao plano vigente.
 *
 * O `mode` define a ÁREA DE TRABALHO: cada área mostra e grava apenas o seu
 * grupo de campos, evitando que uma tela apague o dado de outra.
 */
export default function PlaceFormModal({
  open,
  onOpenChange,
  tenantId,
  companyId,
  campaignId,
  market,
  nextOrder = 1,
  mode = "full",
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(empty(nextOrder));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(market ? fromMarket(market) : empty(nextOrder));
  }, [open, market, nextOrder]);

  // Criar cidade sempre usa o formulário completo (a linha nasce inteira).
  const effectiveMode: MarketEditMode = market ? mode : "full";
  const showStrategy = effectiveMode === "strategy" || effectiveMode === "full";
  const showPaid = effectiveMode === "paid-media" || effectiveMode === "full";
  const showCommercial = effectiveMode === "commercial" || effectiveMode === "full";
  const copy = COPY[effectiveMode];

  const toggleChannel = (channel: string) =>
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));

  const handleSave = async () => {
    const payload = {
      id: market?.id,
      mode: effectiveMode,
      tenantId,
      companyId,
      campaignId,
      marketType: form.marketType,
      sequenceOrder: form.marketType === "base" ? null : form.sequenceOrder,
      city: form.city,
      state: form.state,
      status: form.status,
      objective: form.objective,
      travelDistanceKm: form.travelDistanceKm,
      targetAccounts: form.targetAccounts,
      paidTrafficBudget: form.paidTrafficBudget,
      adsStartDate: form.adsStartDate,
      adsEndDate: form.adsEndDate,
      callsStartDate: form.callsStartDate,
      visitsStartDate: form.visitsStartDate,
      visitsEndDate: form.visitsEndDate,
      channels: form.channels,
      acquisitionStrategy: form.acquisitionStrategy,
      observations: form.observations,
    };
    const invalid = validateExpansionMarketInput(payload);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const result = await saveExpansionMarket(payload);
      if (!result.success) {
        toast.error(result.message || "Não foi possível salvar a cidade.");
        return;
      }
      toast.success(market ? "Cidade atualizada." : "Cidade adicionada ao plano.");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{market ? copy.title : "Adicionar cidade"}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {market && effectiveMode !== "full" && (
          <p className="text-sm font-bold">{marketDisplayLabel(market)}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {showStrategy && (
            <>
              <div>
                <Label>Ordem</Label>
                {form.marketType === "base" ? (
                  <p className="mt-2 text-sm font-bold text-muted-foreground">
                    BASE — praça existente não ocupa número na sequência.
                  </p>
                ) : (
                  <Input
                    inputMode="numeric"
                    value={form.sequenceOrder}
                    onChange={(e) => setForm({ ...form, sequenceOrder: e.target.value })}
                    className="mt-1"
                  />
                )}
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as MarketStatus })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKET_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cidade *</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Estado *</Label>
                <Input
                  value={form.state}
                  maxLength={2}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Distância logística (km)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="A definir"
                  value={form.travelDistanceKm}
                  onChange={(e) => setForm({ ...form, travelDistanceKm: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Meta de alvos a mapear</Label>
                <Input
                  inputMode="numeric"
                  placeholder="A definir"
                  value={form.targetAccounts}
                  onChange={(e) => setForm({ ...form, targetAccounts: e.target.value })}
                  className="mt-1"
                />
              </div>
            </>
          )}

          {showPaid && (
            <>
              <div>
                <Label>Verba planejada de anúncios</Label>
                <Input
                  value={form.paidTrafficBudget}
                  placeholder="Ex.: 200,00"
                  onChange={(e) => setForm({ ...form, paidTrafficBudget: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div />
              <div>
                <Label>Início dos anúncios</Label>
                <Input
                  type="date"
                  value={form.adsStartDate}
                  onChange={(e) => setForm({ ...form, adsStartDate: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Fim dos anúncios</Label>
                <Input
                  type="date"
                  value={form.adsEndDate}
                  onChange={(e) => setForm({ ...form, adsEndDate: e.target.value })}
                  className="mt-1"
                />
              </div>
            </>
          )}

          {showCommercial && (
            <>
              <div>
                <Label>Início das ligações</Label>
                <Input
                  type="date"
                  value={form.callsStartDate}
                  onChange={(e) => setForm({ ...form, callsStartDate: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div />
              <div>
                <Label>Início das visitas</Label>
                <Input
                  type="date"
                  value={form.visitsStartDate}
                  onChange={(e) => setForm({ ...form, visitsStartDate: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Fim das visitas</Label>
                <Input
                  type="date"
                  value={form.visitsEndDate}
                  onChange={(e) => setForm({ ...form, visitsEndDate: e.target.value })}
                  className="mt-1"
                />
              </div>
            </>
          )}

          {showStrategy && (
            <>
              <div className="sm:col-span-2">
                <Label>Objetivo local</Label>
                <Input
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Canais</Label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {CAMPAIGN_CHANNEL_OPTIONS.map((channel) => (
                    <label key={channel} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.channels.includes(channel)}
                        onCheckedChange={() => toggleChannel(channel)}
                      />
                      {channel}
                    </label>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <Label>Abordagem local</Label>
                <Textarea
                  value={form.acquisitionStrategy}
                  onChange={(e) => setForm({ ...form, acquisitionStrategy: e.target.value })}
                  className="mt-1 min-h-[90px]"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.observations}
                  onChange={(e) => setForm({ ...form, observations: e.target.value })}
                  className="mt-1 min-h-[70px]"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar cidade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
