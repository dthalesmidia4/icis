/**
 * LISTA AGRUPADA DO FINANCEIRO — única implementação do layout.
 *
 * `Composição do mês` e `Contas e despesas` são a MESMA apresentação:
 * `Despesa | Data | Origem | Valor | Situação` (+ `Ação` opcional), com linha de
 * grupo (chevron, quantidade, subtotal) e versão mobile empilhada.
 *
 * O que muda entre as telas é só SEMÂNTICA (rótulo de data, cálculo de status,
 * existência de ação) — e isso entra por props. Nenhuma das telas duplica JSX.
 *
 * Os grupos vêm de `buildCompositionGroups`, então o total de um grupo é a soma
 * exata das suas linhas e a soma dos grupos é o total da lista.
 */
import { Fragment, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthRow, formatBRL, formatCurrencyValue } from "@/lib/financeModel";
import { RowStatus, StatusTone } from "@/lib/financeRowStatus";
import { CompositionGroupBy, buildCompositionGroups } from "@/lib/financeGrouping";
import { type OccurrenceLabel, occurrenceDisplayName } from "@/lib/financeOccurrenceLabels";

export interface FinanceGroupedEntry {
  row: MonthRow;
  value: number;
}

export interface FinanceGroupedListProps<E extends FinanceGroupedEntry> {
  entries: E[];
  groupBy: CompositionGroupBy;
  /** Expansão CONTROLADA pelo control deck da tela (grupos iniciam fechados). */
  expanded: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** Rótulos dinâmicos do mês (`FAXINA 1/4`, `Recarga 1/2`...). */
  labels?: Map<string, OccurrenceLabel> | null;
  onOpenRow: (row: MonthRow) => void;
  /** Segunda linha da despesa: natureza/purpose + centro de custo. */
  descriptionText: (row: MonthRow) => string;
  /** Semântica de data da tela (`Vence em 11 set` x `Previsto 11/09`). */
  dateText: (row: MonthRow) => string;
  /** Forma de pagamento / cartão. */
  originNode: (row: MonthRow) => ReactNode;
  status: (entry: E) => RowStatus;
  /** Badges extras ao lado do nome (duplicidade, cadastro inativo, anexo). */
  nameExtras?: (row: MonthRow) => ReactNode;
  /** Linha sem abertura/ações (ex.: repasse de IOF). */
  rowLocked?: (row: MonthRow) => boolean;
  /** Coluna `Ação` — omitida quando a tela é só auditoria. */
  action?: {
    header?: string;
    desktop: (row: MonthRow, status: RowStatus, locked: boolean) => ReactNode;
    mobile?: (row: MonthRow, status: RowStatus, locked: boolean) => ReactNode;
  };
  /** Texto de quantidade do grupo. */
  countLabel?: (count: number) => string;
}

const TONE_ICON: Record<StatusTone, typeof Clock> = {
  positive: CheckCircle2,
  danger: AlertTriangle,
  warning: Clock,
  neutral: Clock,
};

export function FinanceStatusBadge({ status }: { status: RowStatus }) {
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

const defaultCountLabel = (count: number) => (count === 1 ? "1 despesa" : `${count} despesas`);

export default function FinanceGroupedList<E extends FinanceGroupedEntry>({
  entries,
  groupBy,
  expanded,
  onToggleGroup,
  loading,
  emptyMessage,
  labels,
  onOpenRow,
  descriptionText,
  dateText,
  originNode,
  status,
  nameExtras,
  rowLocked,
  action,
  countLabel = defaultCountLabel,
}: FinanceGroupedListProps<E>) {
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

  const groups = buildCompositionGroups(entries, groupBy);
  const locked = (row: MonthRow) => (rowLocked ? rowLocked(row) : false);

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
              {action && (
                <TableHead className="text-xs uppercase tracking-wider font-bold text-right">
                  {action.header ?? "Ação"}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const open = !!expanded[group.key];
              return (
                <Fragment key={group.key}>
                  <TableRow
                    tabIndex={0}
                    aria-expanded={open}
                    className="bg-muted/30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => onToggleGroup(group.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleGroup(group.key);
                      }
                    }}
                  >
                    <TableCell className="py-3" colSpan={3}>
                      <span className="flex items-center gap-2">
                        {open ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="text-[15px] font-bold text-foreground">{group.label}</span>
                        <span className="text-sm text-muted-foreground">{countLabel(group.count)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-[15px] font-bold">
                      {formatBRL(group.total)}
                    </TableCell>
                    <TableCell colSpan={action ? 2 : 1} />
                  </TableRow>

                  {open &&
                    group.entries.map((entry) => {
                      const row = entry.row;
                      const rowStatus = status(entry);
                      const isLocked = locked(row);
                      return (
                        <TableRow
                          key={row.key}
                          tabIndex={isLocked ? undefined : 0}
                          className={
                            isLocked
                              ? ""
                              : "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          }
                          onClick={() => (isLocked ? undefined : onOpenRow(row))}
                          onKeyDown={(e) => {
                            if (isLocked) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenRow(row);
                            }
                          }}
                        >
                          <TableCell className="py-3 pl-10">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-semibold text-foreground">
                                {occurrenceDisplayName(row, labels)}
                              </span>
                              {nameExtras?.(row)}
                            </div>
                            <p className="text-sm text-muted-foreground">{descriptionText(row)}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{dateText(row)}</TableCell>
                          <TableCell className="text-sm">{originNode(row)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <span className="text-[15px] font-semibold">{formatBRL(entry.value)}</span>
                            {row.currency === "USD" && (
                              <p className="text-sm text-muted-foreground">
                                {formatCurrencyValue(row.amountOriginal, "USD")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <FinanceStatusBadge status={rowStatus} />
                          </TableCell>
                          {action && (
                            <TableCell className="text-right whitespace-nowrap">
                              {action.desktop(row, rowStatus, isLocked)}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ------------------------------- MOBILE ------------------------------ */}
      <div className="md:hidden space-y-3">
        {groups.map((group) => {
          const open = !!expanded[group.key];
          return (
            <div key={group.key} className="space-y-2">
              <Card
                role="button"
                tabIndex={0}
                aria-expanded={open}
                className="p-4 flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onToggleGroup(group.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleGroup(group.key);
                  }
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold truncate">{group.label}</span>
                    <span className="block text-sm text-muted-foreground">{countLabel(group.count)}</span>
                  </span>
                </span>
                <span className="text-[15px] font-bold whitespace-nowrap">{formatBRL(group.total)}</span>
              </Card>

              {open &&
                group.entries.map((entry) => {
                  const row = entry.row;
                  const rowStatus = status(entry);
                  const isLocked = locked(row);
                  return (
                    <Card
                      key={row.key}
                      role={isLocked ? undefined : "button"}
                      tabIndex={isLocked ? undefined : 0}
                      className="ml-3 p-4 space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => (isLocked ? undefined : onOpenRow(row))}
                      onKeyDown={(e) => {
                        if (isLocked) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenRow(row);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-foreground">
                            {occurrenceDisplayName(row, labels)}
                          </p>
                          <p className="text-sm text-muted-foreground">{descriptionText(row)}</p>
                          {nameExtras?.(row)}
                        </div>
                        <span className="text-[15px] font-semibold whitespace-nowrap">
                          {formatBRL(entry.value)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{originNode(row)}</p>
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <span className="text-sm text-muted-foreground">{dateText(row)}</span>
                        <FinanceStatusBadge status={rowStatus} />
                      </div>
                      {action?.mobile?.(row, rowStatus, isLocked)}
                    </Card>
                  );
                })}
            </div>
          );
        })}
      </div>
    </>
  );
}
