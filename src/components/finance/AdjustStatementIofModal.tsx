import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatementGroup, cardDisplayLabel, formatBRL } from "@/lib/financeModel";
import { formatDayMonth } from "@/lib/financeRowStatus";
import { buildStatementConference, iofInputMessage, parseIofInput, statementIofBrl } from "@/lib/financeIof";
import { paymentTimestampToDate } from "@/lib/financePaymentDate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: StatementGroup | null;
  onConfirm: (group: StatementGroup, iofBrl: number) => Promise<boolean>;
}

export default function AdjustStatementIofModal({ open, onOpenChange, group, onConfirm }: Props) {
  const [iof, setIof] = useState("0");
  const [saving, setSaving] = useState(false);

  const currentIof = group ? statementIofBrl(group) : 0;
  const invoiceTotal = group ? group.actualTotal ?? group.statementRow?.amountBrl ?? null : null;
  const paidAt = paymentTimestampToDate(group?.statementRow?.occurrence?.paid_at);
  const paidAmount = group?.statementRow?.paidAmountBrl ?? group?.statementRow?.amountBrl ?? invoiceTotal;

  useEffect(() => {
    if (!open) return;
    setIof(String(currentIof));
  }, [open, currentIof]);

  const iofResult = parseIofInput(iof);
  const iofMessage = iofInputMessage(iofResult);
  const nextIof = iofResult.state === "ok" ? iofResult.value : 0;
  const exceedsInvoice = invoiceTotal != null && nextIof > invoiceTotal;
  const conference = useMemo(
    () =>
      buildStatementConference({
        statementBrl: invoiceTotal,
        componentsBrl: group?.projectedTotal ?? null,
        iofBrl: nextIof,
        paidBrl: paidAmount ?? null,
      }),
    [invoiceTotal, group?.projectedTotal, nextIof, paidAmount],
  );
  const canSubmit = iofResult.state === "ok" && !exceedsInvoice && !!group?.statementRow?.occurrence;

  const submit = async () => {
    if (!group || !canSubmit || iofResult.state !== "ok") return;
    setSaving(true);
    try {
      const ok = await onConfirm(group, iofResult.value);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{currentIof > 0 ? "Ajustar IOF" : "Informar IOF"}</DialogTitle>
          <DialogDescription>
            {cardDisplayLabel(group.card)}{group.dueDate ? ` · fatura de ${formatDayMonth(group.dueDate)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Total da fatura</span>
              <span className="font-medium">{formatBRL(invoiceTotal)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Pago em</span>
              <span className="font-medium">{paidAt ? formatDayMonth(paidAt) : "Data não registrada"}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">IOF atualmente classificado</span>
              <span className="font-medium">{formatBRL(currentIof)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-statement-iof">Repasse de IOF (R$)</Label>
            <Input
              id="adjust-statement-iof"
              inputMode="decimal"
              className="w-full min-w-0 max-w-full"
              value={iof}
              onChange={(e) => setIof(e.target.value)}
              placeholder="0,00"
            />
            {iofMessage ? <p className="text-xs text-destructive">{iofMessage}</p> : null}
            {exceedsInvoice ? (
              <p className="text-xs text-destructive">O IOF não pode ser maior que o total da fatura.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Use 0 para remover uma classificação lançada incorretamente.</p>
            )}
          </div>

          <div className="rounded-lg border p-3 text-xs space-y-1">
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Compras conhecidas/corrigidas</span>
              <span className="font-medium">{formatBRL(conference.componentsBrl)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Repasse de IOF</span>
              <span className="font-medium">{formatBRL(conference.iofBrl)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Total classificado</span>
              <span className="font-semibold">{formatBRL(conference.classifiedBrl)}</span>
            </p>
            <p className="flex justify-between gap-3 border-t pt-1">
              <span className="text-muted-foreground">Diferença ainda a classificar</span>
              <span className="font-medium">{formatBRL(conference.unclassifiedBrl)}</span>
            </p>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving ? "Salvando..." : "Salvar IOF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}