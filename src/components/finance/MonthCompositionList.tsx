/**
 * Lista analítica de `Composição do mês`.
 *
 * Responde uma única pergunta: "que gasto é esse?". Não tem ação de pagar —
 * é auditoria. Clicar na linha abre o detalhe da despesa.
 */
import { AlertTriangle, CheckCircle2, Clock, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  COST_CENTER_LABELS,
  MonthRow,
  formatBRL,
  formatCurrencyValue,
  installmentRowLabel,
} from "@/lib/financeModel";
import {
  RowStatus,
  RowStatusContext,
  StatusTone,
  formatDayMonth,
  paymentLabel,
} from "@/lib/financeRowStatus";
import {
  CompositionEntry,
  compositionDateLabel,
  compositionStatusLabel,
} from "@/lib/financeComposition";

interface Props {
  entries: CompositionEntry[];
  statusContext: RowStatusContext;
  loading?: boolean;
  emptyMessage?: string;
  onOpenRow: (row: MonthRow) => void;
}

const TONE_ICON: Record<StatusTone, typeof Clock> = {
  positive: CheckCircle2,
  danger: AlertTriangle,
  warning: Clock,
  neutral: Clock,
};

function StatusBadge({ status }: { status: RowStatus }) {
  const Icon = TONE_ICON[status.tone];
  const className =
    status.tone === "positive"
      ? "bg-primary/10 text-primary border-primary/30"
      : status.tone === "danger"
        ? "bg-destructive/10 text-destructive border-destructive/40"
        : status.tone === "warning"
          ? "bg-muted text-foreground border-border"
          : "bg-transparent text-foreground border-border";
  return (
    <Badge variant="outline" className={`text-sm font-medium whitespace-nowrap ${className}`}>
      <Icon className="w-3.5 h-3.5 mr-1" />
      {status.label}
    </Badge>
  );
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
}: Props) {
  if (loading) {
    return (
      <Card className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        {emptyMessage ?? "Nenhuma despesa neste recorte."}
      </Card>
    );
  }

  return (
    <>
      {/* ------------------------------ DESKTOP ------------------------------ */}
      <Card className="hidden md:block overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Despesa</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Data</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Origem</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Valor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const row = entry.row;
              const status = compositionStatusLabel(row, statusContext, entry);
              return (
                <TableRow
                  key={row.key}
                  tabIndex={0}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => onOpenRow(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenRow(row);
                    }
                  }}
                >
                  <TableCell className="py-3">
                    <p className="text-[15px] font-semibold text-foreground">{row.item.name}</p>
                    <p className="text-sm text-muted-foreground">{purposeLine(row)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{dateText(row)}</TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5">
                      {row.cardItemId && <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
                      {paymentLabel(row, statusContext)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className="text-[15px] font-semibold">{formatBRL(entry.value)}</span>
                    {row.currency === "USD" && (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrencyValue(row.amountOriginal, "USD")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ------------------------------- MOBILE ------------------------------ */}
      <div className="md:hidden space-y-3">
        {entries.map((entry) => {
          const row = entry.row;
          const status = compositionStatusLabel(row, statusContext, entry);
          return (
            <Card
              key={row.key}
              role="button"
              tabIndex={0}
              className="p-4 space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenRow(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenRow(row);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">{row.item.name}</p>
                  <p className="text-sm text-muted-foreground">{purposeLine(row)}</p>
                </div>
                <span className="text-[15px] font-semibold whitespace-nowrap">
                  {formatBRL(entry.value)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                {row.cardItemId && <CreditCard className="w-3.5 h-3.5" />}
                {paymentLabel(row, statusContext)}
              </p>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-sm text-muted-foreground">{dateText(row)}</span>
                <StatusBadge status={status} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
