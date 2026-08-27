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
import type { MarketingCampaign } from "@/lib/marketingCampaigns";
import {
  MARKET_STATUS_OPTIONS,
  saveExpansionPlanConfig,
  type MarketStatus,
} from "@/lib/expansionMarkets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: MarketingCampaign;
  onSaved?: () => void;
}

/**
 * Configuração do PLANO único de expansão. Cidade, verba e datas NÃO pertencem
 * aqui — isso é sempre da cidade/etapa (`marketing_campaign_markets`).
 */
export default function PlanConfigModal({ open, onOpenChange, plan, onSaved }: Props) {
  const [name, setName] = useState(plan.name || "");
  const [status, setStatus] = useState<MarketStatus>(plan.status);
  const [objective, setObjective] = useState(plan.objective || "");
  const [strategy, setStrategy] = useState(plan.acquisition_strategy || "");
  const [observations, setObservations] = useState(plan.observations || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(plan.name || "");
    setStatus(plan.status);
    setObjective(plan.objective || "");
    setStrategy(plan.acquisition_strategy || "");
    setObservations(plan.observations || "");
  }, [open, plan]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveExpansionPlanConfig(plan.id, {
        name,
        status,
        objective,
        acquisitionStrategy: strategy,
        observations,
      });
      if (!res.success) {
        toast.error(res.message || "Não foi possível salvar o plano.");
        return;
      }
      toast.success("Plano de expansão atualizado.");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar plano</DialogTitle>
          <DialogDescription>
            Identidade e estratégia do plano único. Cidades, verbas e datas ficam em cada etapa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label>Nome do plano</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as MarketStatus)}>
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
            <Label>Objetivo geral</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-1 min-h-[80px]"
            />
          </div>
          <div>
            <Label>Estratégia geral de expansão</Label>
            <Textarea
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="mt-1 min-h-[100px]"
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="mt-1 min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
