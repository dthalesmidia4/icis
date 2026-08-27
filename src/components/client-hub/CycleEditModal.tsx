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
import type { CurrentPeriodInfo } from "@/lib/periodCounts";
import { demandsOutsideCycleWindow, saveCycleEdit } from "@/lib/periodCycleEdit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: CurrentPeriodInfo | null;
  demands: { id: string; title: string; publish_date: string | null }[];
  onSaved?: () => void;
}

/**
 * Edita a JANELA EDITORIAL do ciclo atual, sem rota nova e sem recriar
 * planejamento. Praça/cidade não entram aqui.
 */
export default function CycleEditModal({ open, onOpenChange, period, demands, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !period) return;
    setTitle(period.period_title || "");
    setStartDate(period.period_start || "");
    setEndDate(period.period_end || "");
    setObjective(period.objective || "");
    setBudget(period.paid_traffic_budget || "");
  }, [open, period]);

  const outside = demandsOutsideCycleWindow(demands, startDate, endDate);

  const handleSave = async () => {
    if (!period) return;
    setSaving(true);
    try {
      const result = await saveCycleEdit(period.id, {
        title,
        startDate,
        endDate,
        objective,
        paidTrafficBudget: budget,
      });
      if (!result.success) {
        toast.error(result.message || "Não foi possível salvar o ciclo.");
        return;
      }
      toast.success("Ciclo atualizado.");
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
          <DialogTitle>Editar ciclo</DialogTitle>
          <DialogDescription>
            Ajusta apenas a janela editorial. Nenhuma demanda é regenerada ou reagendada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Título do ciclo *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Início</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Fim</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Objetivo do ciclo</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="mt-1 min-h-[80px]"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Verba geral de tráfego pago</Label>
            <Input
              value={budget}
              placeholder="A definir"
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Verba do ciclo editorial. A verba por praça fica na aba Expansão e a de cada anúncio
              em Mídia paga.
            </p>
          </div>
        </div>

        {outside.length > 0 && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {outside.length} conteúdo(s) ficam fora desta janela. Nada será movido automaticamente —
            reagende manualmente se quiser.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !period}>
            {saving ? "Salvando…" : "Salvar ciclo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
