/**
 * "Contas do mês" — lista de baixa carga cognitiva.
 * Desktop: CONTA | QUANDO | VALOR | STATUS | AÇÃO.
 * Mobile: cada linha vira um item empilhado com alvos de toque confortáveis.
 *
 * O status vem SEMPRE de `resolveRowStatus`: cobrança no cartão nunca é
 * apresentada como conta atrasada.
 */
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
import { useFinanceVisibility } from "@/contexts/FinanceVisibilityContext";

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
}: Props) {
  const { money } = useFinanceVisibility();
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
            {rows.map((row) => {
              const status = resolveRowStatus(row, statusContext);
              return (
                <TableRow key={row.key} className="cursor-pointer" onClick={() => onOpenRow(row)}>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">{row.item.name}</span>
                      {overlaps.has(row.item.id) && (
                        <Badge variant="outline" className="text-destructive border-destructive/40">
                          Duplicidade
                        </Badge>
                      )}
                      {row.occurrence?.attachment_url && (
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      {row.cardItemId && <CreditCard className="w-3.5 h-3.5" />}
                      {metaFor(row)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{whenLabel(row, today)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className="text-[15px] font-semibold">{money(row.amountBrl)}</span>
                    {row.currency === "USD" && (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrencyValue(row.amountOriginal, "USD")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={status} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* ------------------------------- MOBILE ------------------------------ */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => {
          const status = resolveRowStatus(row, statusContext);
          return (
            <Card key={row.key} className="p-4 space-y-3" onClick={() => onOpenRow(row)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">{row.item.name}</p>
                  <p className="text-sm text-muted-foreground">{metaFor(row)}</p>
                </div>
                <span className="text-[15px] font-semibold whitespace-nowrap">
                  {money(row.amountBrl)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-sm text-muted-foreground">{whenLabel(row, today)}</span>
                <StatusBadge status={status} />
              </div>
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
            </Card>
          );
        })}
      </div>
    </>
  );
}
