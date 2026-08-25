/**
 * Pagamento da FATURA do cartão.
 *
 * A data informada aqui é o FATO do pagamento (`paid_at`). O vencimento
 * (`due_date`) é histórico e NUNCA é alterado por este fluxo — por isso os dois
 * aparecem separados na tela.
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
import { parseLocalizedNumber } from "@/lib/financeNumber";
import { formatDayMonth } from "@/lib/financeRowStatus";
import { isValidPaymentDate } from "@/lib/financePaymentDate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: StatementGroup | null;
  /** Hoje no fuso America/Sao_Paulo (`YYYY-MM-DD`). */
  today: string;
  onConfirm: (params: { group: StatementGroup; paidDateISO: string; paidAmountBrl: number | null }) => Promise<void>;
}

export default function PayStatementModal({ open, onOpenChange, group, today, onConfirm }: Props) {
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const suggested = group ? group.actualTotal ?? group.projectedTotal : null;

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setAmount(suggested != null ? String(suggested) : "");
  }, [open, today, suggested]);

  if (!group) return null;

  const parsed = parseLocalizedNumber(amount);
  const valid = isValidPaymentDate(date);

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onConfirm({ group, paidDateISO: date, paidAmountBrl: parsed ?? suggested ?? null });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar fatura · {cardDisplayLabel(group.card)}</DialogTitle>
          <DialogDescription>
            {group.dueDate
              ? `Vencimento da fatura: ${formatDayMonth(group.dueDate)}. O vencimento não muda ao registrar o pagamento.`
              : "O vencimento da fatura não muda ao registrar o pagamento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-statement-date">Data do pagamento</Label>
            <Input
              id="pay-statement-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use a data real em que a fatura foi paga, mesmo que seja retroativa.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-statement-amount">Valor pago (R$)</Label>
            <Input
              id="pay-statement-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={suggested != null ? formatBRL(suggested) : "0,00"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !valid}>
            {saving ? "Registrando..." : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
