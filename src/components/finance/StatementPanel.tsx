/**
 * Domínio `Cartões e faturas`.
 *
 * Cada cartão aparece primeiro como ENTIDADE (final, limite, fechamento,
 * vencimento) mesmo quando a fatura do mês ainda não foi materializada.
 * A FATURA é a obrigação de pagamento (saída de caixa) e as cobranças apenas
 * explicam do que ela é composta — nunca são somadas duas vezes.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FinanceItem,
  MonthRow,
  StatementGroup,
  cardDisplayLabel,
  cycleGapLabel,
  formatBRL,
  formatCurrencyValue,
} from "@/lib/financeModel";
import { statementIofBrl } from "@/lib/financeIof";
import {
  CARD_CHARGE_DATE_MISSING,
  cardChargeDateLabel,
  CARD_CLOSING_FACT_LABEL,
  CARD_DUE_FACT_LABEL,
} from "@/lib/financeCardLabels";
import {
  LINKED_CARD_FIX_LABELS,
  LinkedCardItem,
} from "@/lib/financeCardLinkedItems";
import { Competence } from "@/lib/financeCardCycle";
import { formatDayMonth, monthFullLabel, statementValueLabel } from "@/lib/financeRowStatus";
import { paymentTimestampToDate } from "@/lib/financePaymentDate";

interface Props {
  groups: StatementGroup[];
  competence: Competence;
  today: string;
  /** Cartões que devem abrir expandidos / destacados (vindos do bloco de atenção). */
  focusCardId?: string | null;
  highlightIncomplete?: boolean;
  onOpenRow: (row: MonthRow) => void;
  onOpenStatement: (group: StatementGroup) => void;
  onPayStatement: (group: StatementGroup) => void;
  onAdjustIof: (group: StatementGroup) => void;
  onEditCard: (card: FinanceItem) => void;
  /**
   * Itens ATIVOS ligados ao cartão que não compõem esta fatura, por `card.id`.
   * Só apresentação: nada aqui soma no total da fatura.
   */
  linkedItems?: Record<string, LinkedCardItem[]>;
  onEditItem?: (item: FinanceItem) => void;
}

function Fact({ label, value, tone, hint }: { label: string; value: string; tone?: "muted" | "warning"; hint?: string }) {
  return (
    <div className="min-w-[130px]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`text-[15px] font-semibold ${
          tone === "warning" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function StatementPanel({
  groups,
  competence,
  today,
  focusCardId,
  highlightIncomplete,
  onOpenRow,
  onOpenStatement,
  onPayStatement,
  onAdjustIof,
  onEditCard,
  linkedItems,
  onEditItem,
}: Props) {
  /** Mesma decisão global de visibilidade de valores do domínio Financeiro. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [linkedOpen, setLinkedOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (focusCardId) setExpanded((prev) => ({ ...prev, [focusCardId]: true }));
  }, [focusCardId]);

  if (groups.length === 0) return null;
  const monthLabel = monthFullLabel(competence);

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const card = group.card;
        const open = !!expanded[card.id];
        const overdue = !group.paid && !!group.dueDate && group.dueDate < today;
        const focused = card.id === focusCardId || (highlightIncomplete && group.configIncomplete);
        const gap = cycleGapLabel(card);
        const linked = linkedItems?.[card.id] ?? [];
        const linkedIsOpen = !!linkedOpen[card.id];
        const needsFix = linked.filter((l) => l.needsChargeDateCorrection).length;
        const limit = card.card_limit_brl ?? null;
        const usageBase = group.actualTotal ?? (group.projectedTotal > 0 ? group.projectedTotal : null);
        const valueLabel = statementValueLabel(group);
        const classifiedIof = statementIofBrl(group);
        // `Pago em` é FATO; `Vence em` é histórico. Os dois coexistem.
        const paidOn = paymentTimestampToDate(group.statementRow?.occurrence?.paid_at);
        const usagePercent =
          limit != null && limit > 0 && usageBase != null
            ? Math.min(100, Math.round((usageBase / limit) * 100))
            : null;

        return (
          <Card key={card.id} className={`overflow-hidden ${focused ? "ring-2 ring-primary" : ""}`}>
            {/* ------------------------- O CARTÃO ------------------------- */}
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CreditCard className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold truncate">{cardDisplayLabel(card)}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        card.bank_name || null,
                        card.card_last4 ? `Final ${card.card_last4}` : "Final não informado",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>

                {group.paid ? (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Fatura paga
                  </Badge>
                ) : overdue ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/40 text-sm">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Fatura atrasada
                  </Badge>
                ) : group.actualTotal == null ? (
                  <Badge variant="outline" className="text-sm">
                    {group.configIncomplete ? "Projeção indisponível" : "Fatura ainda não informada"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-sm">Fatura a pagar</Badge>
                )}

                <Button variant="outline" size="sm" className="min-h-10" onClick={() => onEditCard(card)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  {group.configIncomplete ? "Completar dados" : "Editar cartão"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Fact
                  label="Limite do cartão"
                  value={limit != null ? formatBRL(limit) : "Limite não informado"}
                  tone={limit != null ? undefined : "muted"}
                />
                <Fact
                  label={CARD_CLOSING_FACT_LABEL}
                  value={card.statement_closing_day != null ? `Dia ${card.statement_closing_day}` : "Não informado"}
                  tone={card.statement_closing_day != null ? undefined : "warning"}
                />
                <Fact
                  label={CARD_DUE_FACT_LABEL}
                  value={card.statement_due_day != null ? `Dia ${card.statement_due_day}` : "Não informado"}
                  tone={card.statement_due_day != null ? undefined : "warning"}
                />
                <Fact
                  label={
                    valueLabel.label === "Fatura"
                      ? `Fatura de ${monthLabel}`
                      : valueLabel.label
                  }
                  value={valueLabel.value != null ? formatBRL(valueLabel.value) : "Ainda não informada"}
                  tone={valueLabel.value == null ? "muted" : undefined}
                  hint={valueLabel.hint ?? undefined}
                />
                <Fact
                  label={
                    group.paid && group.dueDate && group.dueDate < today
                      ? "Fatura venceu em"
                      : "Fatura vence em"
                  }
                  value={group.dueDate ? formatDayMonth(group.dueDate) : "Não informado"}
                  tone={group.dueDate ? undefined : "muted"}
                />
                {group.paid && (
                  <Fact label="Pago em" value={paidOn ? formatDayMonth(paidOn) : "Data não registrada"} tone={paidOn ? undefined : "muted"} />
                )}
                {group.paid && classifiedIof > 0 && (
                  <Fact label="IOF classificado" value={formatBRL(classifiedIof)} />
                )}
              </div>

              {limit != null && usageBase != null && (
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    {group.actualTotal != null
                      ? `Fatura: ${formatBRL(usageBase)} de ${formatBRL(limit)} de limite`
                      : `Projeção no ICIS: ${formatBRL(usageBase)} de ${formatBRL(limit)} de limite`}
                    {usagePercent != null ? ` · ${usagePercent}%` : ""}
                  </p>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${usagePercent! >= 100 ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${usagePercent ?? 0}%` }}
                    />
                  </div>
                  {group.actualTotal == null && (
                    <p className="text-sm text-muted-foreground">
                      A projeção considera apenas as cobranças cadastradas aqui. Compras feitas fora do
                      sistema não entram nesta conta.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  onClick={() => setExpanded((prev) => ({ ...prev, [card.id]: !open }))}
                >
                  {open ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                  Nesta fatura ({group.components.length})
                </Button>
                {linked.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-10"
                    onClick={() => setLinkedOpen((prev) => ({ ...prev, [card.id]: !linkedIsOpen }))}
                  >
                    {linkedIsOpen ? (
                      <ChevronDown className="w-4 h-4 mr-1" />
                    ) : (
                      <ChevronRight className="w-4 h-4 mr-1" />
                    )}
                    Outros vinculados ({linked.length})
                  </Button>
                )}
                <Button variant="outline" size="sm" className="min-h-10" onClick={() => onOpenStatement(group)}>
                  {group.paid ? "Ver detalhes" : "Informar valor da fatura"}
                </Button>
                {group.paid ? (
                  <Button
                    size="sm"
                    className="min-h-10"
                    disabled={!group.statementRow?.occurrence}
                    onClick={() => onAdjustIof(group)}
                  >
                    {classifiedIof > 0 ? "Ajustar IOF" : "Informar IOF"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="min-h-10"
                    disabled={!group.statementRow?.occurrence}
                    onClick={() => onPayStatement(group)}
                  >
                    Pagar fatura
                  </Button>
                )}
              </div>
            </div>

            {gap && (
              <div className="px-4 py-3 bg-destructive/10 text-destructive text-sm">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {gap}
                </p>
                <p>
                  Sem fechamento e vencimento não é possível projetar as próximas faturas. O limite é
                  opcional e não interfere nessa projeção.
                </p>
              </div>
            )}

            {!group.configIncomplete && group.difference != null && Math.abs(group.difference) >= 0.01 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-muted text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <span>
                  Diferença a classificar: <strong>{formatBRL(group.difference)}</strong> entre o valor da
                  fatura e as cobranças conhecidas.
                </span>
              </div>
            )}

            {open && (
              <div className="border-t divide-y">
                {group.components.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nenhuma cobrança vinculada a este cartão nesta fatura.
                  </p>
                ) : (
                  group.components.map((row) => (
                    <button
                      key={row.key}
                      onClick={() => onOpenRow(row)}
                      className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50 text-left"
                    >
                      <span className="truncate text-foreground">
                        {row.item.name}
                        {row.projected && <span className="text-muted-foreground"> · prevista</span>}
                      </span>
                      <span className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={
                            row.chargeDate ? "text-muted-foreground" : "text-destructive"
                          }
                        >
                          {cardChargeDateLabel({
                            chargeDate: row.chargeDate,
                            projected: row.projected,
                          })}
                        </span>
                        {row.currency === "USD" && (
                          <span className="text-muted-foreground">
                            {formatCurrencyValue(row.amountOriginal, "USD")}
                          </span>
                        )}
                        <span className="font-semibold">{formatBRL(row.amountBrl)}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {needsFix > 0 && (
              <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 text-amber-700 dark:text-amber-500 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {needsFix === 1
                    ? "1 lançamento deste cartão está sem data de cobrança"
                    : `${needsFix} lançamentos deste cartão estão sem data de cobrança`}{" "}
                  e por isso não entram em nenhuma fatura. Abra em <strong>Outros vinculados</strong>{" "}
                  para corrigir.
                </span>
              </div>
            )}

            {linkedIsOpen && linked.length > 0 && (
              <div className="border-t bg-muted/30">
                <p className="px-4 pt-3 text-sm text-muted-foreground">
                  Ligados a este cartão, mas <strong>fora da fatura de {monthLabel}</strong>. Não
                  somam no valor desta fatura.
                </p>
                <div className="divide-y mt-2">
                  {linked.map((entry) => {
                    const fixLabel = LINKED_CARD_FIX_LABELS[entry.fix];
                    return (
                      <div
                        key={entry.item.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{entry.item.name}</p>
                          <p
                            className={
                              entry.reason === "next_statement" || entry.reason === "other_statement"
                                ? "text-xs text-muted-foreground"
                                : "text-xs text-destructive"
                            }
                          >
                            {entry.label}
                          </p>
                          {entry.detail && (
                            <p className="text-xs text-muted-foreground">{entry.detail}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {entry.row && (
                            <span className="text-muted-foreground">
                              {entry.row.chargeDate
                                ? cardChargeDateLabel({
                                    chargeDate: entry.row.chargeDate,
                                    projected: entry.row.projected,
                                  })
                                : CARD_CHARGE_DATE_MISSING}
                            </span>
                          )}
                          {fixLabel && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-10"
                              onClick={() => {
                                if (entry.fix === "fix_charge_date" && entry.row) {
                                  onOpenRow(entry.row);
                                  return;
                                }
                                onEditItem?.(entry.item);
                              }}
                            >
                              {fixLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
