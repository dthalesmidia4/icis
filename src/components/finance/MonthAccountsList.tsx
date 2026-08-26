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
import { Fragment } from "react";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, MoreVertical, Paperclip } from "lucide-react";
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
  installmentRowLabel,
} from "@/lib/financeModel";
import { RowStatus, RowStatusContext, StatusTone, resolveRowStatus, whenLabel } from "@/lib/financeRowStatus";
import { buildAccountGroups } from "@/lib/financeAccountGrouping";
import { isIofRow } from "@/lib/financeIof";

interface Props {
  rows: MonthRow[];
  statusContext: RowStatusContext;
  cards: FinanceItem[];
  overlaps: Map<string, string[]>;
  today: string;
  loading?: boolean;
  emptyMessage?: string;
  onOpenRow: (row: MonthRow) => void;
  onTogglePaid: (row: MonthRow, paid: boolean) => void;
  onEditItem: (item: FinanceItem) => void;
  /** `false` mantém a lista corrida, sem hierarquia. */
  grouped?: boolean;
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
  onTogglePaid,
  onEditItem,
  grouped = true,
}: Props) {
  const metaFor = (row: MonthRow) => {
    const center = COST_CENTER_LABELS[row.item.cost_center] ?? row.item.cost_center;
    const payment = row.cardItemId
      ? cards.find((c) => c.id === row.cardItemId)?.name ?? "Cartão de crédito"
      : row.paymentMethod ?? "Forma de pagamento não definida";
    const installment = installmentRowLabel(row);
    return [installment, center, payment].filter(Boolean).join(" · ");
  };

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
    ? buildAccountGroups(rows)
    : [{ key: "__flat__", label: "", total: 0, rows, categories: [{ key: "__flat__", label: "", rows, total: 0 }] }];

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
            <span className="text-[15px] font-semibold text-foreground">{row.item.name}</span>
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

          <p className="text-sm text-muted-foreground flex items-center gap-1">
            {row.cardItemId && <CreditCard className="w-3.5 h-3.5" />}
            {locked ? row.item.purpose : metaFor(row)}
          </p>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">{whenLabel(row, today)}</TableCell>
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
            <p className="text-[15px] font-semibold text-foreground">{row.item.name}</p>
            <p className="text-sm text-muted-foreground">{locked ? row.item.purpose : metaFor(row)}</p>
            {!row.item.active && !locked && (
              <p className="text-xs text-muted-foreground">Cadastro inativo</p>
            )}
          </div>

          <span className="text-[15px] font-semibold whitespace-nowrap">
            {formatBRL(row.amountBrl)}
          </span>
        </div>
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
              <TableHead className="text-xs uppercase tracking-wider font-bold">Conta</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Quando</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Valor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={`g-${group.key}`}>
                {grouped && (
                  <TableRow key={`cc-${group.key}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={4} className="py-2 text-xs font-bold uppercase tracking-wider">
                      {group.label}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm font-semibold whitespace-nowrap">
                      {formatBRL(group.total)}
                    </TableCell>
                  </TableRow>
                )}
                {group.categories.map((category) => (
                  <Fragment key={`c-${group.key}-${category.key}`}>
                    {grouped && (
                      <TableRow
                        key={`cat-${group.key}-${category.key}`}
                        className="hover:bg-transparent"
                      >
                        <TableCell colSpan={4} className="py-1.5 pl-6 text-sm text-muted-foreground">
                          {category.label}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-sm text-muted-foreground whitespace-nowrap">
                          {formatBRL(category.total)}
                        </TableCell>
                      </TableRow>
                    )}
                    {category.rows.map(desktopRow)}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ------------------------------- MOBILE ------------------------------ */}
      <div className="md:hidden space-y-4">
        {groups.map((group) => (
          <div key={`m-${group.key}`} className="space-y-3">
            {grouped && (
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider">{group.label}</p>
                <p className="text-sm font-semibold">{formatBRL(group.total)}</p>
              </div>
            )}
            {group.categories.map((category) => (
              <div key={`m-${group.key}-${category.key}`} className="space-y-2">
                {grouped && (
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{category.label}</p>
                    <p className="text-sm text-muted-foreground">{formatBRL(category.total)}</p>
                  </div>
                )}
                {category.rows.map(mobileRow)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
