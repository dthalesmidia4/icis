/**
 * Adaptador de `Composição do mês` sobre `FinanceGroupedList`.
 *
 * Aqui só vive a SEMÂNTICA da auditoria: rótulo de data da composição, status
 * da composição e ausência de qualquer ação de pagamento. O layout (tabela
 * desktop, cards mobile, linha de grupo) é o compartilhado.
 */
import { CreditCard } from "lucide-react";
import {
  COST_CENTER_LABELS,
  MonthRow,
  installmentRowLabel,
} from "@/lib/financeModel";
import { RowStatusContext, formatDayMonth, paymentLabel } from "@/lib/financeRowStatus";
import {
  CompositionEntry,
  compositionDateLabel,
  compositionStatusLabel,
} from "@/lib/financeComposition";
import { CompositionGroupBy } from "@/lib/financeGrouping";
import { type OccurrenceLabel } from "@/lib/financeOccurrenceLabels";
import FinanceGroupedList from "./FinanceGroupedList";

interface Props {
  entries: CompositionEntry[];
  statusContext: RowStatusContext;
  loading?: boolean;
  emptyMessage?: string;
  onOpenRow: (row: MonthRow) => void;
  labels?: Map<string, OccurrenceLabel> | null;
  groupBy: CompositionGroupBy;
  expanded: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
}

function purposeLine(row: MonthRow): string {
  const center = COST_CENTER_LABELS[row.item.cost_center] ?? row.item.cost_center;
  const purpose = (row.item.purpose ?? row.item.category ?? "").trim();
  const installment = installmentRowLabel(row);
  return [installment, purpose || null, center].filter(Boolean).join(" · ");
}

function dateText(row: MonthRow): string {
  const { label, date } = compositionDateLabel(row);
  if (!date) return "Sem data definida";
  return `${label} ${formatDayMonth(date)}`;
}

export default function MonthCompositionList({
  entries,
  statusContext,
  loading,
  emptyMessage,
  onOpenRow,
  labels,
  groupBy,
  expanded,
  onToggleGroup,
}: Props) {
  return (
    <FinanceGroupedList
      entries={entries}
      groupBy={groupBy}
      expanded={expanded}
      onToggleGroup={onToggleGroup}
      loading={loading}
      emptyMessage={emptyMessage ?? "Nenhuma despesa neste recorte."}
      labels={labels}
      onOpenRow={onOpenRow}
      descriptionText={purposeLine}
      dateText={dateText}
      originNode={(row) => (
        <span className="flex items-center gap-1.5">
          {row.cardItemId && <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
          {paymentLabel(row, statusContext)}
        </span>
      )}
      status={(entry) => compositionStatusLabel(entry.row, statusContext, entry)}
    />
  );
}
