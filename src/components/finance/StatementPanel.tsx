/**
 * Fatura do cartão: composição, diferença a classificar e liquidação.
 * A fatura é saída de caixa — nunca é somada às despesas que a compõem.
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CreditCard, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MonthRow,
  StatementGroup,
  formatBRL,
  formatCurrencyValue,
  formatDateBR,
} from "@/lib/financeModel";

interface Props {
  groups: StatementGroup[];
  onOpenRow: (row: MonthRow) => void;
  onOpenStatement: (group: StatementGroup) => void;
  onPayStatement: (group: StatementGroup) => void;
}

export default function StatementPanel({ groups, onOpenRow, onOpenStatement, onPayStatement }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const open = !!expanded[group.card.id];
        return (
          <Card key={group.card.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <button
                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                onClick={() => setExpanded((prev) => ({ ...prev, [group.card.id]: !open }))}
              >
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <CreditCard className="w-4 h-4 text-primary" />
                <span className="font-semibold truncate">{group.card.name}</span>
                <Badge variant="outline" className="ml-1">Fatura</Badge>
                {group.paid && (
                  <Badge className="bg-primary/10 text-primary border-primary/30">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Paga
                  </Badge>
                )}
              </button>

              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Composição</p>
                  <p className="font-semibold">{formatBRL(group.projectedTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Fatura</p>
                  <p className="font-semibold">{group.actualTotal != null ? formatBRL(group.actualTotal) : "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Vencimento</p>
                  <p className="font-semibold">{formatDateBR(group.dueDate)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenStatement(group)}>
                  Lançar fatura
                </Button>
                <Button
                  size="sm"
                  disabled={group.paid || !group.statementRow?.occurrence}
                  onClick={() => onPayStatement(group)}
                >
                  {group.paid ? "Fatura paga" : "Pagar fatura"}
                </Button>
              </div>
            </div>

            {group.configIncomplete && (
              <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Configuração incompleta: {group.incompleteReason}</span>
              </div>
            )}

            {!group.configIncomplete && group.difference != null && Math.abs(group.difference) >= 0.01 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-muted text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <span>
                  Diferença a classificar: <strong>{formatBRL(group.difference)}</strong> entre a fatura e a composição conhecida.
                </span>
              </div>
            )}

            {open && (
              <div className="border-t divide-y">
                {group.components.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nenhuma despesa vinculada a este cartão nesta fatura.
                  </p>
                ) : (
                  group.components.map((row) => (
                    <button
                      key={row.key}
                      onClick={() => onOpenRow(row)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-muted/50 text-left"
                    >
                      <span className="truncate">
                        {row.item.name}
                        {row.projected && <span className="text-muted-foreground"> · previsto</span>}
                      </span>
                      <span className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-muted-foreground">{formatDateBR(row.chargeDate)}</span>
                        {row.currency === "USD" && (
                          <span className="text-muted-foreground">
                            {formatCurrencyValue(row.amountOriginal, "USD")}
                          </span>
                        )}
                        <span className="font-medium">{formatBRL(row.amountBrl)}</span>
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
