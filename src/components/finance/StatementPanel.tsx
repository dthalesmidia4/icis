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
import { Competence } from "@/lib/financeCardCycle";
import { formatDayMonth, monthFullLabel, statementValueLabel } from "@/lib/financeRowStatus";

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
  onEditCard: (card: FinanceItem) => void;
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
  onEditCard,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
        const limit = card.card_limit_brl ?? null;
        const usageBase = group.actualTotal ?? (group.projectedTotal > 0 ? group.projectedTotal : null);
        const valueLabel = statementValueLabel(group);
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
                  label="Fechamento"
                  value={card.statement_closing_day != null ? `Dia ${card.statement_closing_day}` : "Não informado"}
                  tone={card.statement_closing_day != null ? undefined : "warning"}
                />
                <Fact
                  label="Vencimento"
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
                  label="Vence em"
                  value={group.dueDate ? formatDayMonth(group.dueDate) : "Não informado"}
                  tone={group.dueDate ? undefined : "muted"}
                />
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
                  Ver cobranças ({group.components.length})
                </Button>
                <Button variant="outline" size="sm" className="min-h-10" onClick={() => onOpenStatement(group)}>
                  Informar valor da fatura
                </Button>
                <Button
                  size="sm"
                  className="min-h-10"
                  disabled={group.paid || !group.statementRow?.occurrence}
                  onClick={() => onPayStatement(group)}
                >
                  {group.paid ? "Fatura paga" : "Pagar fatura"}
                </Button>
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
                        <span className="text-muted-foreground">
                          Cobrança em {formatDayMonth(row.chargeDate)}
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
          </Card>
        );
      })}
    </div>
  );
}
