import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  PAID_MEDIA_PLATFORM_OPTIONS,
  PAID_MEDIA_STATUS_OPTIONS,
  savePaidMediaActivation,
  validateActivationInput,
  type PaidMediaActivation,
  type PaidMediaStatus,
} from "@/lib/paidMediaActivations";
import {
  marketLabel,
  marketOrderLabel,
  marketStatusLabel,
  type ExpansionMarket,
} from "@/lib/expansionMarkets";

export interface ActivationDemandOption {
  id: string;
  title: string;
  publish_date: string | null;
  inCurrentPeriod: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  companyId: string;
  /** Plano único de expansão do cliente. */
  campaignId: string;
  markets: ExpansionMarket[];
  /** Ativações já existentes (todas as praças) para calcular o saldo da praça. */
  activationsByMarket?: PaidMediaActivation[];
  demands: ActivationDemandOption[];
  activation?: PaidMediaActivation | null;
  /** Praça pré-selecionada ao criar uma nova ativação. */
  initialMarketId?: string | null;
  onSaved?: () => void;
}


interface FormState {
  demandId: string;
  marketId: string;
  platform: string;
  status: PaidMediaStatus;
  startDate: string;
  endDate: string;
  budget: string;
  objective: string;
  audience: string;
  cta: string;
  notes: string;
}

const empty: FormState = {
  demandId: "",
  marketId: "",
  platform: "Meta",
  status: "planned",
  startDate: "",
  endDate: "",
  budget: "",
  objective: "",
  audience: "",
  cta: "",
  notes: "",
};

/**
 * Ativação = UMA peça rodando em UMA cidade/etapa do plano único. Nunca duplica nem move a demanda:
 * `period_plan_id` da demanda permanece intocado.
 */
export default function ActivationFormModal({
  open,
  onOpenChange,
  tenantId,
  companyId,
  campaignId,
  markets,
  demands,
  activation,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      activation
        ? {
            demandId: activation.demand_id,
            marketId: activation.market_id || "",
            platform: activation.platform || "Meta",
            status: activation.status,
            startDate: activation.start_date || "",
            endDate: activation.end_date || "",
            budget: activation.budget !== null ? String(activation.budget) : "",
            objective: activation.objective || "",
            audience: activation.audience || "",
            cta: activation.cta || "",
            notes: activation.notes || "",
          }
        : { ...empty, marketId: markets[0]?.id || "" },
    );
  }, [open, activation, markets]);

  const handleSave = async () => {
    const invalid = validateActivationInput({
      demandId: form.demandId,
      campaignId,
      marketId: form.marketId,
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
      budget: form.budget,
    });
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const result = await savePaidMediaActivation({
        id: activation?.id,
        tenantId,
        companyId,
        campaignId,
        marketId: form.marketId,
        demandId: form.demandId,
        platform: form.platform,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate,
        budget: form.budget,
        objective: form.objective,
        audience: form.audience,
        cta: form.cta,
        notes: form.notes,
      });
      if (!result.success) {
        toast.error(result.message || "Não foi possível salvar a ativação.");
        return;
      }
      toast.success(activation ? "Ativação atualizada." : "Ativação criada.");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const periodDemands = demands.filter((d) => d.inCurrentPeriod);
  const otherDemands = demands.filter((d) => !d.inCurrentPeriod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activation ? "Editar ativação" : "Nova ativação"}</DialogTitle>
          <DialogDescription>
            A mesma peça pode rodar em várias cidades do plano. Nenhuma demanda é duplicada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Conteúdo *</Label>
            <Select
              value={form.demandId}
              onValueChange={(v) => setForm({ ...form, demandId: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o conteúdo" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {periodDemands.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}
                    {d.publish_date ? ` · ${d.publish_date.slice(8, 10)}/${d.publish_date.slice(5, 7)}` : ""}
                  </SelectItem>
                ))}
                {otherDemands.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title} · fora do ciclo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cidade/etapa *</Label>
            <Select value={form.marketId} onValueChange={(v) => setForm({ ...form, marketId: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a cidade" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {markets.map((m, index) => (
                  <SelectItem key={m.id} value={m.id}>
                    {`${marketOrderLabel(m, index)} ${marketLabel(m)} — ${marketStatusLabel(m.status)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Plataforma</Label>
            <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAID_MEDIA_PLATFORM_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as PaidMediaStatus })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAID_MEDIA_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Verba</Label>
            <Input
              value={form.budget}
              placeholder="Ex.: 800,00"
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Início</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Fim</Label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Objetivo</Label>
            <Input
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Público</Label>
            <Input
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>CTA</Label>
            <Input
              value={form.cta}
              onChange={(e) => setForm({ ...form, cta: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar ativação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
