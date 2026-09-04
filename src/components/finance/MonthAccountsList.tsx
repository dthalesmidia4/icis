/**
 * "Contas e despesas" — lista de baixa carga cognitiva.
 * Desktop: CONTA | QUANDO | VALOR | STATUS | AÇÃO.
 * Mobile: cada linha vira um item empilhado com alvos de toque confortáveis.
 *
 * O status vem SEMPRE de `resolveRowStatus`: cobrança no cartão nunca é
 * apresentada como conta atrasada.
 *
 * Dentro do recorte escolhido na tela (a pagar / pagas / filtros de data), as
 * linhas ficam organizadas por CENTRO DE CUSTO → CATEGORIA — a mesma hierarquia
 * de `Composição do mês`, para que "Administrativo", "Encargos trabalhistas"
 * etc. sejam rastreáveis aqui, sem tela paralela nem outra fonte de dados.
 */
import { Fragment, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  MoreVertical,
  Paperclip,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  MonthRow,
  formatBRL,
  formatCurrencyValue,
} from "@/lib/financeModel";
import { RowStatus, RowStatusContext, StatusTone, paymentLabel, resolveRowStatus, whenLabel } from "@/lib/financeRowStatus";
import { buildAccountGroups } from "@/lib/financeAccountGrouping";
import type { CompositionGroupBy } from "@/lib/financeGrouping";
import { isIofRow } from "@/lib/financeIof";

import {
  type OccurrenceLabel,
  occurrenceDisplayName,
} from "@/lib/financeOccurrenceLabels";

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
  /** `false` mantém a lista corrida, sem hierarquia. */
  grouped?: boolean;
  /** Dimensão do primeiro nível: natureza (categoria) ou área (centro de custo). */
  groupBy?: CompositionGroupBy;
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
  grouped = true,
  groupBy = "category",
}: Props) {
  /** Expandir é só apresentação: vazio significa que todos iniciam fechados. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => setExpanded(new Set()), [groupBy]);
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const purposeLine = (row: MonthRow) => {
    const center = COST_CENTER_LABELS[row.item.cost_center] ?? row.item.cost_center;
    const purpose = (row.item.purpose ?? row.item.category ?? "").trim();
    return [purpose || null, center].filter(Boolean).join(" · ");
  };
  const originLabel = (row: MonthRow) =>
    row.cardItemId
      ? cards.find((c) => c.id === row.cardItemId)?.name ?? "Cartão de crédito"
      : row.paymentMethod ?? "Forma de pagamento não definida";

  if (loading) {
    return (
      <Card className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        {emptyMessage ?? "Nenhuma conta para este filtro neste mês."}
      </Card>
    );
  }

  /** Repasse de IOF é fato do banco: não tem cadastro nem baixa manual. */
  const readOnly = (row: MonthRow) => isIofRow(row);

  const groups = grouped
    ? buildAccountGroups(rows, groupBy)
    : [
        {
          key: "__flat__",
          label: "",
          total: 0,
          rows,
          items: [
            { key: "__flat__", label: "", rows, total: 0, multiple: false },
          ],
        },
      ];


  const desktopRow = (row: MonthRow) => {
    const status = resolveRowStatus(row, statusContext);
    const locked = readOnly(row);
    return (
      <TableRow
        key={row.key}
        className={locked ? "" : "cursor-pointer"}
        onClick={() => (locked ? undefined : onOpenRow(row))}
      >
        <TableCell className="py-3">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{occurrenceDisplayName(row, labels)}</span>
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
          </div>

          <p className="text-sm text-muted-foreground">{purposeLine(row)}</p>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">{whenLabel(row, today)}</TableCell>
        <TableCell className="text-sm">
          <span className="flex items-center gap-1.5">
            {row.cardItemId && <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />}
            {originLabel(row)}
          </span>
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          <span className="text-[15px] font-semibold">{formatBRL(row.amountBrl)}</span>
          {row.currency === "USD" && (
            <p className="text-sm text-muted-foreground">
              {formatCurrencyValue(row.amountOriginal, "USD")}
            </p>
          )}
        </TableCell>
        <TableCell><StatusBadge status={status} /></TableCell>
        <TableCell className="text-right whitespace-nowrap">
          {locked ? (
            <span className="text-xs text-muted-foreground">Cobrado na fatura</span>
          ) : (
            <div className="flex items-center justify-end gap-1">
              {status.canPayDirectly && (
                <Button
                  size="sm"
                  className="min-h-10"
                  variant={status.kind === "paid" ? "outline" : "default"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePaid(row, status.kind !== "paid");
                  }}
                >
                  {status.kind === "paid" ? "Desfazer" : "Pagar"}
                </Button>
              )}
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
          )}
        </TableCell>
      </TableRow>
    );
  };

  const mobileRow = (row: MonthRow) => {
    const status = resolveRowStatus(row, statusContext);
    const locked = readOnly(row);
    return (
      <Card
        key={row.key}
        className="p-4 space-y-3"
        onClick={() => (locked ? undefined : onOpenRow(row))}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground">{occurrenceDisplayName(row, labels)}</p>
            <p className="text-sm text-muted-foreground">{purposeLine(row)}</p>
            {!row.item.active && !locked && (
              <p className="text-xs text-muted-foreground">Cadastro inativo</p>
            )}
          </div>

          <span className="text-[15px] font-semibold whitespace-nowrap">
            {formatBRL(row.amountBrl)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          {row.cardItemId && <CreditCard className="w-3.5 h-3.5" />}
          {originLabel(row)}
        </p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="text-sm text-muted-foreground">{whenLabel(row, today)}</span>
          <StatusBadge status={status} />
        </div>
        {!locked && (
          <div className="flex items-center gap-2">
            {status.canPayDirectly && (
              <Button
                size="sm"
                className="flex-1 min-h-11"
                variant={status.kind === "paid" ? "outline" : "default"}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePaid(row, status.kind !== "paid");
                }}
              >
                {status.kind === "paid" ? "Desfazer" : "Pagar"}
              </Button>
            )}
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
        )}
      </Card>
    );
  };

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
              <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const isExpanded = !grouped || expanded.has(group.key);
              return (
                <Fragment key={`g-${group.key}`}>
                  {grouped && (
                    <TableRow key={`gh-${group.key}`} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={3} className="py-2">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                          onClick={() => toggleGroup(group.key)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          {group.label}
                          <span className="font-normal normal-case text-muted-foreground">
                            {group.rows.length === 1 ? "1 linha" : `${group.rows.length} linhas`}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm font-semibold whitespace-nowrap">
                        {formatBRL(group.total)}
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                  {isExpanded &&
                    group.items.map((item) => (
                      <Fragment key={`i-${group.key}-${item.key}`}>
                        {grouped && item.multiple && (
                          <TableRow
                            key={`ih-${group.key}-${item.key}`}
                            className="hover:bg-transparent"
                          >
                            <TableCell colSpan={3} className="py-1.5 pl-6 text-sm text-muted-foreground">
                              {item.label}
                              {" · "}
                              {item.rows.length} lançamentos no mês
                            </TableCell>
                            <TableCell className="py-1.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                              {formatBRL(item.total)}
                            </TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        )}
                        {item.rows.map((row) => desktopRow(row))}
                      </Fragment>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ------------------------------- MOBILE ------------------------------ */}
      <div className="md:hidden space-y-4">
        {groups.map((group) => {
          const isExpanded = !grouped || expanded.has(group.key);
          return (
            <div key={`m-${group.key}`} className="space-y-3">
              {grouped && (
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 min-h-10"
                  onClick={() => toggleGroup(group.key)}
                >
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    {group.label}
                  </span>
                  <span className="text-sm font-semibold">{formatBRL(group.total)}</span>
                </button>
              )}
              {isExpanded &&
                group.items.map((item) => (
                  <div key={`m-${group.key}-${item.key}`} className="space-y-2">
                    {grouped && item.multiple && (
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                          {item.label} · {item.rows.length} lançamentos
                        </p>
                        <p className="text-sm text-muted-foreground">{formatBRL(item.total)}</p>
                      </div>
                    )}
                    {item.rows.map((row) => mobileRow(row))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
