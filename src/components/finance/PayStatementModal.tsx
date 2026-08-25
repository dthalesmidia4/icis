/**
 * Pagamento da FATURA do cartão, com RECONCILIAÇÃO CAMBIAL.
 *
 * A data informada aqui é o FATO do pagamento (`paid_at`). O vencimento
 * (`due_date`) é histórico e NUNCA é alterado por este fluxo.
 *
 * Antes de liquidar, cada compra em dólar da fatura precisa do valor EXATO
 * cobrado em reais: o câmbio efetivo é individual, calculado por compra. O
 * banco recalcula e persiste esse câmbio — a tela só mostra a prévia.
 */
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
import {
  resolveStatementPaymentAmount,
  statementPaymentAmountMessage,
} from "@/lib/financeStatementPaymentForm";
import { formatDayMonth } from "@/lib/financeRowStatus";
import { isValidPaymentDate } from "@/lib/financePaymentDate";
import {
  buildReconciliation,
  reconciliationPayload,
  usdComponentsOf,
} from "@/lib/financeReconciliation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: StatementGroup | null;
  /** Hoje no fuso America/Sao_Paulo (`YYYY-MM-DD`). */
  today: string;
  /** `true` = pagamento confirmado no banco. `false` mantém o modal aberto. */
  onConfirm: (params: {
    group: StatementGroup;
    paidDateISO: string;
    paidAmountBrl: number | null;
    usdComponents?: unknown[];
  }) => Promise<boolean>;
}

export default function PayStatementModal({ open, onOpenChange, group, today, onConfirm }: Props) {
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  /** Valor exato em reais por compra USD, indexado pela chave da linha. */
  const [usdInputs, setUsdInputs] = useState<Record<string, string>>({});

  const suggested = group ? group.actualTotal ?? group.projectedTotal : null;
  /** Fatura com valor real informado: o total é fato, não pode pagar parcial. */
  const exactRequired = group?.actualTotal != null;

  const usdComponents = useMemo(() => usdComponentsOf(group), [group]);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setAmount(suggested != null ? String(suggested) : "");
    const seed: Record<string, string> = {};
    for (const comp of usdComponents) {
      // Estimativa entra como ponto de partida; o usuário confirma o valor real.
      seed[comp.row.key] = comp.estimatedBrl != null ? String(comp.estimatedBrl) : "";
    }
    setUsdInputs(seed);
  }, [open, today, suggested, usdComponents]);

  if (!group) return null;

  const amountResult = resolveStatementPaymentAmount(amount, suggested, { exactRequired });
  const amountMessage = statementPaymentAmountMessage(amountResult);
  const dateValid = isValidPaymentDate(date);
  const reconciliation = buildReconciliation(usdComponents, usdInputs);
  const canSubmit = dateValid && amountResult.state === "ok" && reconciliation.state === "ok";

  const submit = async () => {
    if (!canSubmit || amountResult.state !== "ok" || reconciliation.state !== "ok") return;
    setSaving(true);
    try {
      const ok = await onConfirm({
        group,
        paidDateISO: date,
        paidAmountBrl: amountResult.amountBrl,
        usdComponents: reconciliationPayload(reconciliation.entries),
      });
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagar fatura · {cardDisplayLabel(group.card)}</DialogTitle>
          <DialogDescription>
            {group.dueDate
              ? `Vencimento da fatura: ${formatDayMonth(group.dueDate)}. O vencimento não muda ao registrar o pagamento.`
              : "O vencimento da fatura não muda ao registrar o pagamento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {usdComponents.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Compras em dólar desta fatura</p>
                <p className="text-xs text-muted-foreground">
                  Informe o valor exato cobrado em reais. Cada compra tem seu próprio câmbio.
                </p>
              </div>

              {reconciliation.state === "blocked" ? (
                <p className="text-xs text-destructive">{reconciliation.reason}</p>
              ) : null}

              {usdComponents.map((comp) => {
                const typed = usdInputs[comp.row.key] ?? "";
                const parsed = Number(typed.replace(/\./g, "").replace(",", "."));
                const rate =
                  comp.amountOriginal && comp.amountOriginal > 0 && parsed > 0
                    ? (parsed / comp.amountOriginal).toFixed(6)
                    : null;
                return (
                  <div key={comp.row.key} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label htmlFor={`usd-${comp.row.key}`} className="text-sm">
                        {comp.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {comp.chargeDate ? `Cobrança ${formatDayMonth(comp.chargeDate)} · ` : ""}
                        US$ {comp.amountOriginal ?? "—"}
                        {comp.estimatedBrl != null ? ` · estimativa ${formatBRL(comp.estimatedBrl)}` : ""}
                        {comp.projected ? " · ainda não lançada" : ""}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Input
                        id={`usd-${comp.row.key}`}
                        inputMode="decimal"
                        className="sm:w-36"
                        value={typed}
                        placeholder="Valor em R$"
                        onChange={(e) =>
                          setUsdInputs((prev) => ({ ...prev, [comp.row.key]: e.target.value }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {rate ? `Câmbio efetivo ${rate}` : "Informe o valor real"}
                      </p>
                    </div>
                  </div>
                );
              })}

              {reconciliation.state === "incomplete" && (
                <p className="text-xs text-destructive">
                  Falta o valor real de: {reconciliation.missing.join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pay-statement-date">Data do pagamento</Label>
            <Input
              id="pay-statement-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {!dateValid && (
              <p className="text-xs text-destructive">Informe uma data válida</p>
            )}
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
            {amountMessage && <p className="text-xs text-destructive">{amountMessage}</p>}
            {exactRequired && !amountMessage && (
              <p className="text-xs text-muted-foreground">
                A fatura é paga por inteiro: o valor precisa ser o total de {formatBRL(suggested)}.
              </p>
            )}
          </div>

          {reconciliation.state === "ok" && usdComponents.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Total da fatura</span>
                <span className="font-medium">{formatBRL(suggested)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Total real das compras em dólar</span>
                <span className="font-medium">{formatBRL(reconciliation.totalBrl)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Ajuste cambial identificado</span>
                <span className="font-medium">{formatBRL(reconciliation.drift)}</span>
              </p>
              <p className="text-muted-foreground pt-1">
                Diferenças de IOF, tarifas ou compras não classificadas continuam sendo diferença
                da fatura e não impedem o pagamento.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving ? "Registrando..." : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
