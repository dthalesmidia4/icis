/**
 * Adaptador de `Contas e despesas` sobre `FinanceGroupedList`.
 *
 * Aqui só vive a SEMÂNTICA operacional: data de vencimento (`whenLabel`), status
 * canônico (`resolveRowStatus`), badges do cadastro e as ações de Pagar/Desfazer
 * e Editar/Detalhes. O layout é o compartilhado com a Composição.
 */
import { CreditCard, MoreVertical, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COST_CENTER_LABELS, FinanceItem, MonthRow } from "@/lib/financeModel";
import { RowStatus, RowStatusContext, resolveRowStatus, whenLabel } from "@/lib/financeRowStatus";
import type { CompositionGroupBy } from "@/lib/financeGrouping";
import { isIofRow } from "@/lib/financeIof";
import { type OccurrenceLabel } from "@/lib/financeOccurrenceLabels";
import FinanceGroupedList from "./FinanceGroupedList";

interface Props {
  rows: MonthRow[];
  statusContext: RowStatusContext;
  cards: FinanceItem[];
  overlaps: Map<string, string[]>;
  today: string;
  loading?: boolean;
  emptyMessage?: string;
  onOpenRow: (row: MonthRow) => void;
  /** Rótulos dinâmicos do mês (renovação/recargas/1-4). */
  labels?: Map<string, OccurrenceLabel> | null;
  onTogglePaid: (row: MonthRow, paid: boolean) => void;
  onEditItem: (item: FinanceItem) => void;
  /** Dimensão do primeiro nível: natureza (categoria) ou área (centro de custo). */
  groupBy?: CompositionGroupBy;
  expanded: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}

export default function MonthAccountsList({
  rows,
  statusContext,
  cards,
  overlaps,
  today,
  loading,
  emptyMessage,
  onOpenRow,
  labels,
  onTogglePaid,
  onEditItem,
  groupBy = "category",
  expanded,
  onToggleGroup,
}: Props) {
  /** Entries com a MESMA forma da composição: valor em BRL da linha. */
  const entries = rows.map((row) => ({ row, value: row.amountBrl ?? 0 }));

  const purposeLine = (row: MonthRow) => {
    const center = COST_CENTER_LABELS[row.item.cost_center] ?? row.item.cost_center;
    const purpose = (row.item.purpose ?? row.item.category ?? "").trim();
    return [purpose || null, center].filter(Boolean).join(" · ");
  };

  const originLabel = (row: MonthRow) =>
    row.cardItemId
      ? cards.find((c) => c.id === row.cardItemId)?.name ?? "Cartão de crédito"
      : row.paymentMethod ?? "Forma de pagamento não definida";

  /** Repasse de IOF é fato do banco: não tem cadastro nem baixa manual. */
  const readOnly = (row: MonthRow) => isIofRow(row);

  const payButton = (row: MonthRow, status: RowStatus, className: string) =>
    status.canPayDirectly ? (
      <Button
        size="sm"
        className={className}
        variant={status.kind === "paid" ? "outline" : "default"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePaid(row, status.kind !== "paid");
        }}
      >
        {status.kind === "paid" ? "Desfazer" : "Pagar"}
      </Button>
    ) : null;

  return (
    <FinanceGroupedList
      entries={entries}
      groupBy={groupBy}
      expanded={expanded}
      onToggleGroup={onToggleGroup}
      loading={loading}
      emptyMessage={emptyMessage ?? "Nenhuma conta para este filtro neste mês."}
      labels={labels}
      onOpenRow={onOpenRow}
      descriptionText={purposeLine}
      dateText={(row) => whenLabel(row, today)}
      originNode={(row) => (
        <span className="flex items-center gap-1.5">
          {row.cardItemId && <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
          {originLabel(row)}
        </span>
      )}
      status={(entry) => resolveRowStatus(entry.row, statusContext)}
      countLabel={(count) => (count === 1 ? "1 linha" : `${count} linhas`)}
      rowLocked={readOnly}
      nameExtras={(row) => {
        const locked = readOnly(row);
        return (
          <>
            {overlaps.has(row.item.id) && (
              <Badge variant="outline" className="text-destructive border-destructive/40">
                Duplicidade
              </Badge>
            )}
            {/* Cadastro inativado: o fato deste mês é real, mas não se repete. */}
            {!row.item.active && !locked && (
              <Badge variant="outline" className="text-muted-foreground">
                Cadastro inativo
              </Badge>
            )}
            {row.occurrence?.attachment_url && !locked && (
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </>
        );
      }}
      action={{
        header: "Ação",
        desktop: (row, status, locked) =>
          locked ? (
            <span className="text-xs text-muted-foreground">Cobrado na fatura</span>
          ) : (
            <div className="flex items-center justify-end gap-1">
              {payButton(row, status, "min-h-10")}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onOpenRow(row)}>
                    Ver detalhes do mês
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditItem(row.item)}>
                    Editar cadastro
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        mobile: (row, status, locked) =>
          locked ? null : (
            <div className="flex items-center gap-2">
              {payButton(row, status, "flex-1 min-h-11")}
              <Button
                size="sm"
                variant="outline"
                className="flex-1 min-h-11"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditItem(row.item);
                }}
              >
                Editar cadastro
              </Button>
            </div>
          ),
      }}
    />
  );
}
