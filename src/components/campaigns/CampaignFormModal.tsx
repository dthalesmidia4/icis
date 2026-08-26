import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
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
  saveCampaign,
  validateCampaignInput,
  type CampaignStatus,
  type MarketingCampaign,
} from "@/lib/marketingCampaigns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  campaign?: MarketingCampaign | null;
  onSaved?: (id?: string) => void;
}

interface FormState {
  strategyId: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  city: string;
  state: string;
  regionLabel: string;
  radiusKm: string;
  channels: string[];
  paidTrafficBudget: string;
  acquisitionStrategy: string;
  observations: string;
}

const empty: FormState = {
  strategyId: "",
  name: "",
  objective: "",
  status: "planning",
  startDate: "",
  endDate: "",
  city: "",
  state: "",
  regionLabel: "",
  radiusKm: "",
  channels: [],
  paidTrafficBudget: "",
  acquisitionStrategy: "",
  observations: "",
};

const fromCampaign = (c: MarketingCampaign): FormState => ({
  strategyId: c.strategy_id || "",
  name: c.name,
  objective: c.objective || "",
  status: c.status,
  startDate: c.start_date || "",
  endDate: c.end_date || "",
  city: c.city || "",
  state: c.state || "",
  regionLabel: c.region_label || "",
  radiusKm: c.radius_km !== null && c.radius_km !== undefined ? String(c.radius_km) : "",
  channels: c.channels || [],
  paidTrafficBudget:
    c.paid_traffic_budget !== null && c.paid_traffic_budget !== undefined
      ? String(c.paid_traffic_budget)
      : "",
  acquisitionStrategy: c.acquisition_strategy || "",
  observations: c.observations || "",
});

export default function CampaignFormModal({
  open,
  onOpenChange,
  companyId,
  campaign,
  onSaved,
}: Props) {
  const { tenantId } = useTenant();
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [strategies, setStrategies] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !tenantId || !companyId) return;
      try {
        const rows = await loadCompanyStrategies(tenantId, companyId);
        if (!cancelled) setStrategies(rows);
      } catch (err) {
        console.error("[CampaignFormModal] falha ao carregar estratégias", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, companyId]);

  useEffect(() => {
    if (!open) return;
    setForm(campaign ? fromCampaign(campaign) : empty);
  }, [open, campaign]);

  const toggleChannel = (channel: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  };

  const handleSave = async () => {
    if (!tenantId || !companyId) return;
    const invalid = validateCampaignInput({
      name: form.name,
      status: form.status,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      radiusKm: form.radiusKm,
      paidTrafficBudget: form.paidTrafficBudget,
    });
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    const res = await saveCampaign({
      id: campaign?.id,
      tenantId,
      companyId,
      strategyId: form.strategyId || null,
      name: form.name,
      objective: form.objective,
      status: form.status,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      city: form.city,
      state: form.state,
      regionLabel: form.regionLabel,
      radiusKm: form.radiusKm,
      channels: form.channels,
      paidTrafficBudget: form.paidTrafficBudget,
      acquisitionStrategy: form.acquisitionStrategy,
      observations: form.observations,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.message || "Erro ao salvar campanha.");
      return;
    }
    toast.success(campaign ? "Campanha atualizada." : "Campanha criada.");
    onOpenChange(false);
    onSaved?.(res.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? "Editar campanha" : "Nova campanha"}</DialogTitle>
          <DialogDescription>
            A campanha organiza a operação de Mídia e a aquisição do Comercial no mesmo cadastro de
            cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Ribeirão Preto — Aquisição"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Estratégia vinculada</Label>
            <Select
              value={form.strategyId || "none"}
              onValueChange={(v) => setForm({ ...form, strategyId: v === "none" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem estratégia vinculada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem estratégia vinculada</SelectItem>
                {strategies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A campanha é a execução de uma estratégia geral já aprovada do cliente.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as CampaignStatus })}
            >
              <SelectTrigger>
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
          <div className="space-y-1.5">
            <Label>Verba de tráfego pago</Label>
            <Input
              value={form.paidTrafficBudget}
              onChange={(e) => setForm({ ...form, paidTrafficBudget: e.target.value })}
              placeholder="Ex.: 1.500,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Início</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Término</Label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Ribeirão Preto"
            />
          </div>
          <div className="space-y-1.5">
            <Label>UF</Label>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="SP"
              maxLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Raio (km)</Label>
            <Input
              value={form.radiusKm}
              onChange={(e) => setForm({ ...form, radiusKm: e.target.value })}
              placeholder="30"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rótulo da região</Label>
            <Input
              value={form.regionLabel}
              onChange={(e) => setForm({ ...form, regionLabel: e.target.value })}
              placeholder="Ex.: Ribeirão Preto e região"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Objetivo</Label>
            <Textarea
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              className="min-h-[70px]"
              placeholder="O que esta campanha precisa entregar."
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Canais</Label>
            <div className="flex flex-wrap gap-3 rounded-md border p-3">
              {CAMPAIGN_CHANNEL_OPTIONS.map((channel) => (
                <label key={channel} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.channels.includes(channel)}
                    onCheckedChange={() => toggleChannel(channel)}
                  />
                  {channel}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Estratégia de aquisição</Label>
            <Textarea
              value={form.acquisitionStrategy}
              onChange={(e) => setForm({ ...form, acquisitionStrategy: e.target.value })}
              className="min-h-[90px]"
              placeholder="Como a campanha gera oportunidades para o Comercial."
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={form.observations}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
