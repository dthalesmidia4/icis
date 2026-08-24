/**
 * Domínio `Assinaturas e ferramentas`.
 *
 * Concentra ferramentas (`tool`), pacotes (`package`) e recursos incluídos.
 * A lista principal é AGRUPADA POR ORIGEM DE PAGAMENTO (cartão real ou forma
 * direta), derivada em tempo real de `card_item_id` / `payment_method`.
 *
 * Quando a assinatura é paga no cartão, ela também aparece como COMPONENTE da
 * fatura em `Cartões e faturas` — referência cruzada intencional, não
 * duplicação contábil (a fatura nunca é somada às despesas).
 */
import { useState } from "react";
import { Pencil, Power, CreditCard, AlertTriangle, ChevronDown, Wallet, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  MonthRow,
  RECURRENCE_LABELS,
  formatBRL,
  formatCurrencyValue,
} from "@/lib/financeModel";
import { buildSubscriptionGroups, SubscriptionGroup } from "@/lib/financeSubscriptionGroups";
import { Competence, dateInMonth } from "@/lib/financeCardCycle";
import {
  RowStatusContext,
  formatDayMonth,
  isCardCharge,
  resolveRowStatus,
} from "@/lib/financeRowStatus";

interface Props {
  items: FinanceItem[];
  cards: FinanceItem[];
  rows: MonthRow[];
  statusContext: RowStatusContext;
  overlaps: Map<string, string[]>;
  competence: Competence;
  monthlyTotal: number;
  search: string;
  onSearchChange: (value: string) => void;
  onEdit: (item: FinanceItem) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onOpenRow: (row: MonthRow) => void;
  onTogglePaid: (row: MonthRow, paid: boolean) => void;
}

function nextCharge(item: FinanceItem, competence: Competence): string | null {
  const day = item.charge_day ?? item.due_day ?? null;
  if (day == null || item.recurrence_type === "one_off") return null;
  if (item.recurrence_type === "annual") {
    if (!item.subscription_date) return null;
    const month = Number(item.subscription_date.slice(5, 7));
    return dateInMonth({ year: competence.year, month }, day);
  }
  return dateInMonth(competence, day);
}

export default function SubscriptionsPanel({
  items,
  cards,
  rows,
  statusContext,
  overlaps,
  competence,
  monthlyTotal,
  search,
  onSearchChange,
  onEdit,
  onToggleActive,
  onOpenRow,
  onTogglePaid,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const term = search.trim().toLowerCase();
  const matches = (item: FinanceItem) =>
    !term ||
    item.name.toLowerCase().includes(term) ||
    (item.purpose ?? "").toLowerCase().includes(term) ||
    (item.category ?? "").toLowerCase().includes(term);

  // Recursos incluídos nunca são cobranças independentes: ficam subordinados
  // ao pacote, fora do agrupamento por pagamento.
  const chargeable = items.filter(
    (i) => (i.kind === "tool" || i.kind === "package") && matches(i),
  );
  const included = items.filter((i) => i.kind === "included_resource" && matches(i));

  const groups = buildSubscriptionGroups({ items: chargeable, cards });

  const renderItem = (item: FinanceItem, group?: SubscriptionGroup) => {
    const next = nextCharge(item, competence);
    const row = rows.find((r) => r.item.id === item.id) ?? null;
    const status = row ? resolveRowStatus(row, statusContext) : null;
    const showPay = !!row && !!status && status.canPayDirectly && !isCardCharge(row);

    return (
      <div
        key={item.id}
        className={`flex flex-wrap items-center gap-3 px-4 py-3 border-t first:border-t-0 ${
          item.active ? "" : "opacity-70"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{item.name}</span>
            {!item.active && (
              <Badge variant="secondary" className="text-sm">
                Inativa
              </Badge>
            )}
            {item.kind === "package" && (
              <Badge variant="outline" className="text-sm">
                Pacote
              </Badge>
            )}
            {overlaps.has(item.id) && (
              <Badge variant="outline" className="text-destructive border-destructive/40">
                Já incluída em {overlaps.get(item.id)!.join(", ")}
              </Badge>
            )}
            {status && (
              <Badge
                variant="outline"
                className={
                  status.tone === "danger"
                    ? "bg-destructive/10 text-destructive border-destructive/40 text-sm"
                    : status.tone === "positive"
                      ? "bg-primary/10 text-primary border-primary/30 text-sm"
                      : "text-sm"
                }
              >
                {status.label}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {[
              item.purpose || item.category || null,
              COST_CENTER_LABELS[item.cost_center] ?? item.cost_center,
              RECURRENCE_LABELS[item.recurrence_type],
              next ? `Próxima cobrança em ${formatDayMonth(next)}` : null,
              // A forma de pagamento já está no cabeçalho do grupo; só repetimos
              // como metadado discreto quando o item está fora de um grupo.
              !group && item.payment_method ? item.payment_method : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="text-right">
          {item.kind === "included_resource" ? (
            <span className="text-sm text-muted-foreground">Incluído no pacote</span>
          ) : (
            <>
              <p className="text-[15px] font-semibold">{formatBRL(item.default_amount_brl)}</p>
              {item.currency === "USD" && (
                <p className="text-sm text-muted-foreground">
                  {formatCurrencyValue(item.default_amount_original, "USD")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {showPay && (
            <Button
              size="sm"
              className="min-h-10"
              variant={status!.kind === "paid" ? "outline" : "default"}
              onClick={() => onTogglePaid(row!, status!.kind !== "paid")}
            >
              {status!.kind === "paid" ? "Desfazer" : "Pagar"}
            </Button>
          )}
          {row && (
            <Button size="sm" variant="ghost" className="min-h-10" onClick={() => onOpenRow(row)}>
              Detalhes do mês
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Editar" onClick={() => onEdit(item)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10"
            aria-label={item.active ? "Desativar" : "Reativar"}
            onClick={() => onToggleActive(item.id, !item.active)}
          >
            <Power className={`w-4 h-4 ${item.active ? "text-destructive" : "text-primary"}`} />
          </Button>
        </div>
      </div>
    );
  };

  const renderGroup = (group: SubscriptionGroup) => {
    const open = !collapsed[group.key];
    const Icon = group.kind === "card" ? CreditCard : group.kind === "direct" ? Wallet : HelpCircle;

    return (
      <Collapsible
        key={group.key}
        open={open}
        onOpenChange={(next) => setCollapsed((prev) => ({ ...prev, [group.key]: !next }))}
        asChild
      >
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left bg-muted/40 hover:bg-muted/60 transition-colors"
            >
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold">{group.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? "assinatura" : "assinaturas"}
                  </span>
                </div>
                {group.warning && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Dados da fatura incompletos · {group.warning}
                    {group.card && (
                      <span
                        role="link"
                        tabIndex={0}
                        className="underline hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(group.card!);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            onEdit(group.card!);
                          }
                        }}
                      >
                        completar
                      </span>
                    )}
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">{formatBRL(group.total)}</span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div>{group.items.map((item) => renderItem(item, group))}</div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <Input
          placeholder="Buscar assinatura ou ferramenta..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full sm:w-80"
        />
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-muted-foreground">Ferramentas e IA neste mês</span>
          <span className="text-[15px] font-semibold">{formatBRL(monthlyTotal)}</span>
        </div>
      </Card>

      <div className="space-y-3">{groups.map(renderGroup)}</div>

      {included.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-base font-semibold">Recursos incluídos em pacotes</h3>
            <p className="text-sm text-muted-foreground">
              Não geram custo próprio — apenas documentam o que o pacote cobre.
            </p>
          </div>
          <Card className="overflow-hidden">{included.map((item) => renderItem(item))}</Card>
        </section>
      )}

      {groups.length === 0 && included.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma assinatura ou ferramenta encontrada. Use “+ Nova assinatura ou ferramenta”.
        </Card>
      )}
    </div>
  );
}
