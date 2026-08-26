/**
 * Pagamento da FATURA do cartão, com RECONCILIAÇÃO CAMBIAL.
 *
 * O FECHAMENTO da fatura (total + IOF incluído nele) é capturado aqui, junto,
 * como um único dado — nunca em duas telas separadas. A data informada é o FATO
 * do pagamento (`paid_at`); o vencimento (`due_date`) é histórico e NUNCA é
 * alterado por este fluxo. O `Valor pago` não é digitado de novo: ele É o total
 * do fechamento (a fatura é paga por inteiro).
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
import { parseLocalizedNumber } from "@/lib/financeNumber";
import {
  buildStatementConference,
  iofInputMessage,
  parseIofInput,
} from "@/lib/financeIof";
import {
  CLOSURE_IOF_LABEL,
  CLOSURE_SECTION_LABEL,
  CLOSURE_TOTAL_LABEL,
  resolveStatementClosure,
  seedStatementClosure,
  statementClosureMessage,
} from "@/lib/financeStatementClosure";
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
    /** Repasse de IOF cobrado junto com a fatura (0 quando não houver). */
    iofBrl: number;
    /** Total do FECHAMENTO informado aqui (null = mantém o total conhecido). */
    statementAmountBrl: number | null;
  }) => Promise<boolean>;
}

export default function PayStatementModal({ open, onOpenChange, group, today, onConfirm }: Props) {
  const [date, setDate] = useState(today);
  /** Total do fechamento (o mesmo valor que será pago). */
  const [total, setTotal] = useState("");
  const [saving, setSaving] = useState(false);
  /** IOF é SEMPRE perguntado, com padrão 0 — exista ou não compra em dólar. */
  const [iof, setIof] = useState("0");
  /** Valor exato em reais por compra USD, indexado pela chave da linha. */
  const [usdInputs, setUsdInputs] = useState<Record<string, string>>({});

  const knownTotal = group?.actualTotal ?? null;
  /** Fatura com valor real informado: o total é fato, não pode pagar parcial. */
  const exactRequired = group?.actualTotal != null;

  const usdComponents = useMemo(() => usdComponentsOf(group), [group]);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    const seed = seedStatementClosure(group);
    // Fechamento já conhecido abre predefinido: total real + IOF classificado.
    setTotal(seed.total);
    setIof(seed.iof);
    const usdSeed: Record<string, string> = {};
    for (const comp of usdComponents) {
      // Estimativa entra como ponto de partida; o usuário confirma o valor real.
      usdSeed[comp.row.key] = comp.estimatedBrl != null ? String(comp.estimatedBrl) : "";
    }
    setUsdInputs(usdSeed);
  }, [open, today, group, usdComponents]);

  if (!group) return null;

  const closure = resolveStatementClosure({ total, iof, knownTotalBrl: knownTotal });
  const closureMessage = statementClosureMessage(closure);
  const iofResult = parseIofInput(iof);
  const iofMessage = iofInputMessage(iofResult);
  const iofBrl = iofResult.state === "ok" ? iofResult.value : 0;
  /** Total confirmado no fechamento; sem digitação, cai no total conhecido. */
  const closureTotalBrl = closure.state === "ok" ? closure.totalBrl : null;
  const suggested = closureTotalBrl ?? knownTotal ?? group.projectedTotal;
  /**
   * O `Valor pago` NÃO é um campo próprio: a fatura é paga por inteiro, então
   * ele é sempre o total do fechamento acima.
   */
  const amount = total.trim();

  /** Total da fatura: o IOF já está contido nele, não é somado por cima. */
  const expected = suggested != null ? Number(suggested.toFixed(2)) : null;

  const amountResult = resolveStatementPaymentAmount(amount, expected, { exactRequired });
  const amountMessage = statementPaymentAmountMessage(amountResult);
  const dateValid = isValidPaymentDate(date);
  const reconciliation = buildReconciliation(usdComponents, usdInputs);
  const classifiedComponentsBrl =
    reconciliation.state === "ok"
      ? Number(
          group.components
            .reduce((sum, row) => {
              if (row.currency !== "USD") return sum + (row.amountBrl ?? 0);
              const typed = usdInputs[row.key] ?? "";
              const parsed = parseLocalizedNumber(typed);
              return sum + (parsed ?? 0);
            }, 0)
            .toFixed(2),
        )
      : null;
  const conference = buildStatementConference({
    statementBrl: suggested,
    componentsBrl: classifiedComponentsBrl,
    iofBrl,
    paidBrl: amountResult.state === "ok" ? amountResult.amountBrl ?? expected : null,
  });
  const canSubmit =
    dateValid &&
    closure.state === "ok" &&
    iofResult.state === "ok" &&
    amountResult.state === "ok" &&
    reconciliation.state === "ok";

  const submit = async () => {
    if (!canSubmit || amountResult.state !== "ok" || reconciliation.state !== "ok") return;
    setSaving(true);
    try {
      const ok = await onConfirm({
        group,
        paidDateISO: date,
        paidAmountBrl: amountResult.amountBrl,
        usdComponents: reconciliationPayload(reconciliation.entries),
        iofBrl,
        statementAmountBrl: closureTotalBrl,
      });

      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Pagar fatura · {cardDisplayLabel(group.card)}</DialogTitle>
          <DialogDescription>
            {group.dueDate
              ? `Vencimento da fatura: ${formatDayMonth(group.dueDate)}. O vencimento não muda ao registrar o pagamento.`
              : "O vencimento da fatura não muda ao registrar o pagamento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
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
                // Mesma leitura segura do resto do Financeiro: "341.15" e "341,15"
                // valem 341,15 — nunca 34115.
                const parsed = parseLocalizedNumber(typed);
                const rate =
                  comp.amountOriginal && comp.amountOriginal > 0 && parsed != null && parsed > 0
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
                        className="w-full min-w-0 max-w-full sm:w-36"
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
              className="w-full min-w-0 max-w-full"
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

          {/* FECHAMENTO: total e IOF são o mesmo dado, sempre juntos. */}
          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{CLOSURE_SECTION_LABEL}</p>
              <p className="text-xs text-muted-foreground">
                O IOF já está dentro do total: ele é classificação, não acréscimo.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-statement-amount">{CLOSURE_TOTAL_LABEL}</Label>
              <Input
                id="pay-statement-amount"
                inputMode="decimal"
                className="w-full min-w-0 max-w-full"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder={suggested != null ? formatBRL(suggested) : "0,00"}
              />
              {closureMessage && <p className="text-xs text-destructive">{closureMessage}</p>}
              {amountMessage && !closureMessage && (
                <p className="text-xs text-destructive">{amountMessage}</p>
              )}
              {exactRequired && !closureMessage && !amountMessage && (
                <p className="text-xs text-muted-foreground">
                  A fatura é paga por inteiro: o valor precisa ser o total de {formatBRL(expected)}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-statement-iof">{CLOSURE_IOF_LABEL}</Label>
              <Input
                id="pay-statement-iof"
                inputMode="decimal"
                className="w-full min-w-0 max-w-full"
                value={iof}
                onChange={(e) => setIof(e.target.value)}
                placeholder="0,00"
              />
              {iofMessage ? (
                <p className="text-xs text-destructive">{iofMessage}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  IOF cobrado pelo banco junto com esta fatura. Use 0 quando não houver.
                </p>
              )}
            </div>

            <p className="flex justify-between gap-3 border-t pt-2 text-sm">
              <span className="text-muted-foreground">Valor que será pago</span>
              <span className="font-semibold">{formatBRL(expected)}</span>
            </p>
          </div>


          {reconciliation.state === "ok" && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Total da fatura</span>
                <span className="font-medium">{formatBRL(conference.statementBrl)}</span>
              </p>
              {usdComponents.length > 0 && (
                <>
                  <p className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Compras em dólar corrigidas</span>
                    <span className="font-medium">{formatBRL(conference.componentsBrl)}</span>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Ajuste cambial identificado</span>
                    <span className="font-medium">{formatBRL(reconciliation.drift)}</span>
                  </p>
                </>
              )}
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Repasse de IOF</span>
                <span className="font-medium">{formatBRL(conference.iofBrl)}</span>
              </p>
              <p className="flex justify-between gap-3 border-t pt-1">
                <span className="text-muted-foreground">Total classificado</span>
                <span className="font-semibold">{formatBRL(conference.classifiedBrl)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Valor cobrado/pago</span>
                <span className="font-medium">{formatBRL(conference.paidBrl)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Diferença ainda a classificar</span>
                <span className="font-medium">{formatBRL(conference.unclassifiedBrl)}</span>
              </p>
              <p className="text-muted-foreground pt-1">
                O IOF já está classificado acima: só sobra como diferença o que vier de tarifas ou
                compras ainda não cadastradas.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
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
