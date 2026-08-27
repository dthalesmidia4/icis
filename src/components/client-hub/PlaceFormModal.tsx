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
import {
  CAMPAIGN_CHANNEL_OPTIONS,
  CAMPAIGN_STATUS_OPTIONS,
  loadCompanyStrategies,
  placeInternalName,
  saveCampaign,
  validatePlaceInput,
  type CampaignStatus,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  companyId: string;
  place?: MarketingCampaign | null;
  nextOrder?: number;
  onSaved?: () => void;
}

interface FormState {
  sequenceOrder: string;
  city: string;
  state: string;
  status: CampaignStatus;
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

const fromPlace = (c: MarketingCampaign): FormState => ({
  sequenceOrder: c.sequence_order ? String(c.sequence_order) : "",
  city: c.city || "",
  state: c.state || "",
  status: c.status,
  objective: c.objective || "",
  paidTrafficBudget: c.paid_traffic_budget !== null ? String(c.paid_traffic_budget) : "",
  adsStartDate: c.ads_start_date || "",
  adsEndDate: c.ads_end_date || "",
  callsStartDate: c.calls_start_date || "",
  visitsStartDate: c.visits_start_date || "",
  visitsEndDate: c.visits_end_date || "",
  travelDistanceKm: c.travel_distance_km !== null ? String(c.travel_distance_km) : "",
  targetAccounts: c.target_accounts !== null ? String(c.target_accounts) : "",
  channels: c.channels || [],
  acquisitionStrategy: c.acquisition_strategy || "",
  observations: c.observations || "",
});

/**
 * Editor local da PRAÇA de expansão. Nunca abre rota nova e nunca pede um
 * campo redundante de nome — o nome interno é derivado da cidade.
 */
export default function PlaceFormModal({
  open,
  onOpenChange,
  tenantId,
  companyId,
  place,
  nextOrder = 1,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(empty(nextOrder));
  const [saving, setSaving] = useState(false);
  const [strategyId, setStrategyId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setForm(place ? fromPlace(place) : empty(nextOrder));
    setStrategyId(place?.strategy_id || "");
  }, [open, place, nextOrder]);

  useEffect(() => {
    if (!open || place?.strategy_id || !tenantId || !companyId) return;
    let cancelled = false;
    loadCompanyStrategies(tenantId, companyId)
      .then((list) => {
        if (!cancelled && list.length > 0) setStrategyId(list[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, place?.strategy_id, tenantId, companyId]);

  const toggleChannel = (channel: string) =>
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));

  const handleSave = async () => {
    const invalid = validatePlaceInput({
      city: form.city,
      state: form.state,
      sequenceOrder: form.sequenceOrder,
      adsStartDate: form.adsStartDate,
      adsEndDate: form.adsEndDate,
      visitsStartDate: form.visitsStartDate,
      visitsEndDate: form.visitsEndDate,
      travelDistanceKm: form.travelDistanceKm,
      targetAccounts: form.targetAccounts,
      paidTrafficBudget: form.paidTrafficBudget,
      status: form.status,
    });
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const result = await saveCampaign({
        id: place?.id,
        tenantId,
        companyId,
        strategyId: strategyId || null,
        name: placeInternalName(form.city),
        objective: form.objective,
        status: form.status,
        city: form.city,
        state: form.state,
        regionLabel: `${form.city.trim()}/${form.state.trim().toUpperCase()}`,
        sequenceOrder: form.sequenceOrder,
        adsStartDate: form.adsStartDate,
        adsEndDate: form.adsEndDate,
        callsStartDate: form.callsStartDate,
        visitsStartDate: form.visitsStartDate,
        visitsEndDate: form.visitsEndDate,
        travelDistanceKm: form.travelDistanceKm,
        targetAccounts: form.targetAccounts,
        channels: form.channels,
        paidTrafficBudget: form.paidTrafficBudget,
        acquisitionStrategy: form.acquisitionStrategy,
        observations: form.observations,
      });
      if (!result.success) {
        toast.error(result.message || "Não foi possível salvar a praça.");
        return;
      }
      toast.success(place ? "Praça atualizada." : "Praça adicionada.");
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
          <DialogTitle>{place ? "Editar praça" : "Adicionar praça"}</DialogTitle>
          <DialogDescription>
            Cada praça tem sua própria janela comercial. O cronograma de conteúdo do cliente
            continua único.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Ordem</Label>
            <Input
              inputMode="numeric"
              value={form.sequenceOrder}
              onChange={(e) => setForm({ ...form, sequenceOrder: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as CampaignStatus })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_STATUS_OPTIONS.map((o) => (
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
          <div className="sm:col-span-2">
            <Label>Objetivo comercial</Label>
            <Input
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Investimento em tráfego</Label>
            <Input
              value={form.paidTrafficBudget}
              placeholder="Ex.: 1.500,00"
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
          <div>
            <Label>Início das ligações</Label>
            <Input
              type="date"
              value={form.callsStartDate}
              onChange={(e) => setForm({ ...form, callsStartDate: e.target.value })}
              className="mt-1"
            />
          </div>
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
          <div />

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
            <Label>Estratégia de aquisição / abordagem</Label>
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar praça"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
