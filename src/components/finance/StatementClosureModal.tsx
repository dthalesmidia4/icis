/**
 * FECHAMENTO DA FATURA — consulta e ajuste.
 *
 * Um único lugar para os dados do fechamento: `Total da fatura` e
 * `IOF incluído na fatura`. Não existe mais um caminho separado de IOF.
 *
 * O que NÃO se ajusta aqui: data e valor pagos. Liquidação é outro fato — este
 * modal nunca escreve `paid_at`/`paid_amount_brl`.
 */
import { useEffect, useState } from "react";
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
import { buildStatementConference } from "@/lib/financeIof";
import { paymentTimestampToDate } from "@/lib/financePaymentDate";
import {
  CLOSURE_IOF_LABEL,
  CLOSURE_SECTION_LABEL,
  CLOSURE_TOTAL_LABEL,
  StatementClosurePayload,
  resolveStatementClosure,
  seedStatementClosure,
  statementClosureMessage,
  statementClosurePayload,
  statementClosureUnchanged,
} from "@/lib/financeStatementClosure";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: StatementGroup | null;
  /** `true` = fechamento gravado no banco. `false` mantém o modal aberto. */
  onConfirm: (payload: StatementClosurePayload) => Promise<boolean>;
}

export default function StatementClosureModal({ open, onOpenChange, group, onConfirm }: Props) {
  const [total, setTotal] = useState("");
  const [iof, setIof] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seed = seedStatementClosure(group);
    setTotal(seed.total);
    setIof(seed.iof);
  }, [open, group]);

  const knownTotal = group?.actualTotal ?? null;
  const currentIofRaw = group?.statementRow?.occurrence?.iof_amount_brl ?? null;
  const currentIof =
    currentIofRaw != null && Number.isFinite(currentIofRaw) && currentIofRaw > 0
      ? Number(currentIofRaw.toFixed(2))
      : 0;
  const paidAt = paymentTimestampToDate(group?.statementRow?.occurrence?.paid_at);
  const paidAmount = group?.statementRow?.paidAmountBrl ?? null;

  const closure = resolveStatementClosure({ total, iof, knownTotalBrl: knownTotal });
  const message = statementClosureMessage(closure);
  const effectiveTotal = closure.state === "ok" ? closure.totalBrl ?? knownTotal : knownTotal;
  const nextIof = closure.state === "ok" ? closure.iofBrl : currentIof;
  const unchanged = statementClosureUnchanged(closure, { totalBrl: knownTotal, iofBrl: currentIof });

  const conference = buildStatementConference({
    statementBrl: effectiveTotal,
    componentsBrl: group?.projectedTotal ?? null,
    iofBrl: nextIof,
    paidBrl: paidAmount,
  });
  /** Fonte ÚNICA do texto da conferência (mesma em todas as telas). */
  const reading = interpretStatementCompositionDifference(conference.unclassifiedBrl);
  const payment = interpretStatementPayment({
    paid: !!group?.paid,
    statementBrl: effectiveTotal,
    paidBrl: paidAmount,
  });


  const payload = group ? statementClosurePayload(group, closure) : null;
  const canSubmit = !!payload && closure.state === "ok" && !unchanged;

  const submit = async () => {
    if (!payload || !canSubmit) return;
    setSaving(true);
    try {
      const ok = await onConfirm(payload);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{CLOSURE_SECTION_LABEL}</DialogTitle>
          <DialogDescription>
            {cardDisplayLabel(group.card)}
            {group.dueDate ? ` · fatura de ${formatDayMonth(group.dueDate)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {group.paid && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Pago em</span>
                <span className="font-medium">{paidAt ? formatDayMonth(paidAt) : "Data não registrada"}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Valor pago</span>
                <span className="font-medium">{formatBRL(paidAmount)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Ajustar o fechamento não altera a data nem o valor já pagos.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="statement-closure-total">{CLOSURE_TOTAL_LABEL}</Label>
            <Input
              id="statement-closure-total"
              inputMode="decimal"
              className="w-full min-w-0 max-w-full"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder={knownTotal != null ? formatBRL(knownTotal) : "0,00"}
            />
            <p className="text-xs text-muted-foreground">
              Total emitido pelo banco, com o IOF já dentro dele.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="statement-closure-iof">{CLOSURE_IOF_LABEL}</Label>
            <Input
              id="statement-closure-iof"
              inputMode="decimal"
              className="w-full min-w-0 max-w-full"
              value={iof}
              onChange={(e) => setIof(e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              Use 0 para remover uma classificação lançada incorretamente.
            </p>
          </div>

          {message ? <p className="text-xs text-destructive">{message}</p> : null}

          <div className="rounded-lg border p-3 text-xs space-y-1">
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Total da fatura</span>
              <span className="font-medium">{formatBRL(conference.statementBrl)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">Compras identificadas</span>
              <span className="font-medium">{formatBRL(conference.componentsBrl)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">IOF da fatura</span>
              <span className="font-medium">{formatBRL(conference.iofBrl)}</span>
            </p>
            <p className="flex justify-between gap-3 border-t pt-1">
              <span className="text-muted-foreground">Compras + IOF</span>
              <span className="font-semibold">{formatBRL(conference.classifiedBrl)}</span>
            </p>
            <p className="flex justify-between gap-3 border-t pt-1">
              <span className="text-muted-foreground">{reading.label}</span>
              <span className="font-medium">{formatBRL(reading.absoluteBrl)}</span>
            </p>
            <p className="pt-1 font-medium text-foreground">{reading.title}</p>
            <p className="text-muted-foreground">{reading.description}</p>
          </div>
        </div>


        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving ? "Salvando..." : "Salvar fechamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
