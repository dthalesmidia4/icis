/**
 * Cartões: a FATURA é a obrigação de pagamento (saída de caixa) e as cobranças
 * apenas explicam do que ela é composta.
 * A fatura nunca é somada às despesas que a compõem.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CreditCard, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MonthRow,
  StatementGroup,
  formatBRL,
  formatCurrencyValue,
} from "@/lib/financeModel";
import { Competence } from "@/lib/financeCardCycle";
import { formatDayMonth, monthFullLabel } from "@/lib/financeRowStatus";

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
        const open = !!expanded[group.card.id];
        const overdue = !group.paid && !!group.dueDate && group.dueDate < today;
        const focused =
          group.card.id === focusCardId || (highlightIncomplete && group.configIncomplete);
        return (
          <Card
            key={group.card.id}
            className={`overflow-hidden ${focused ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <CreditCard className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold truncate">{group.card.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Fatura de {monthLabel}
                    {group.dueDate ? ` · Vence em ${formatDayMonth(group.dueDate)}` : ""}
                  </p>
                </div>
                {group.paid ? (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Pago
                  </Badge>
                ) : overdue ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/40 text-sm">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Atrasada
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-sm">A pagar</Badge>
                )}
              </div>

              <div className="flex items-center gap-5 text-sm">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Valor da fatura</p>
                  <p className="text-[15px] font-semibold">
                    {group.actualTotal != null ? formatBRL(group.actualTotal) : "Ainda não informado"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Soma das cobranças</p>
                  <p className="text-[15px] font-semibold">{formatBRL(group.projectedTotal)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  onClick={() => setExpanded((prev) => ({ ...prev, [group.card.id]: !open }))}
                >
                  {open ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                  Ver cobranças
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

            {group.configIncomplete && (
              <div className="px-4 py-3 bg-destructive/10 text-destructive text-sm">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Configuração incompleta
                </p>
                <p>Complete fechamento e vencimento para projetar as próximas faturas.</p>
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
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50 text-left"
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
