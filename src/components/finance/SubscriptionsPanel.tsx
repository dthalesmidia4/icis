/**
 * Domínio `Assinaturas e ferramentas`.
 *
 * Concentra ferramentas (`tool`), pacotes (`package`) e recursos incluídos.
 * Quando a assinatura é paga no cartão, ela também aparece como COMPONENTE da
 * fatura em `Cartões e faturas` — referência cruzada intencional, não
 * duplicação contábil (a fatura nunca é somada às despesas).
 */
import { Pencil, Power, CreditCard, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  MonthRow,
  RECURRENCE_LABELS,
  cardDisplayLabel,
  cycleGapLabel,
  formatBRL,
  formatCurrencyValue,
} from "@/lib/financeModel";
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
  const term = search.trim().toLowerCase();
  const matches = (item: FinanceItem) =>
    !term ||
    item.name.toLowerCase().includes(term) ||
    (item.purpose ?? "").toLowerCase().includes(term) ||
    (item.category ?? "").toLowerCase().includes(term);

  const tools = items.filter((i) => i.kind === "tool" && matches(i));
  const packages = items.filter((i) => i.kind === "package" && matches(i));
  const included = items.filter((i) => i.kind === "included_resource" && matches(i));

  const renderItem = (item: FinanceItem) => {
    const card = item.card_item_id ? cards.find((c) => c.id === item.card_item_id) : null;
    const payment = card ? cardDisplayLabel(card) : item.payment_method ?? "Forma de pagamento não definida";
    const cycleGap = card ? cycleGapLabel(card) : null;
    const next = nextCharge(item, competence);
    const row = rows.find((r) => r.item.id === item.id) ?? null;
    const status = row ? resolveRowStatus(row, statusContext) : null;
    const showPay = !!row && !!status && status.canPayDirectly && !isCardCharge(row);

    return (
      <Card key={item.id} className={`flex flex-wrap items-center gap-3 p-4 ${item.active ? "" : "opacity-70"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{item.name}</span>
            <Badge variant={item.active ? "outline" : "secondary"} className="text-sm">
              {item.active ? "Ativa" : "Inativa"}
            </Badge>
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
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
            {card && <CreditCard className="w-3.5 h-3.5" />}
            {payment}
            {next ? ` · Próxima cobrança em ${formatDayMonth(next)}` : ""}
          </p>

          {cycleGap && (
            <button
              type="button"
              className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground"
              onClick={() => card && onEdit(card)}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Dados da fatura incompletos · {cycleGap}
            </button>
          )}
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
      </Card>
    );
  };

  const Section = ({
    title,
    description,
    list,
  }: {
    title: string;
    description: string;
    list: FinanceItem[];
  }) =>
    list.length === 0 ? null : (
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-2">{list.map(renderItem)}</div>
      </section>
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar assinatura ou ferramenta..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full sm:w-72"
        />
        <Card className="px-4 py-2">
          <p className="text-sm text-muted-foreground">Ferramentas e IA neste mês</p>
          <p className="text-[15px] font-semibold">{formatBRL(monthlyTotal)}</p>
        </Card>
      </div>

      <Section
        title="Assinaturas e ferramentas"
        description="Serviços contratados por mês ou por ano."
        list={tools}
      />
      <Section title="Pacotes" description="Planos que já incluem vários serviços." list={packages} />
      <Section
        title="Recursos incluídos em pacotes"
        description="Não geram custo próprio — apenas documentam o que o pacote cobre."
        list={included}
      />

      {tools.length === 0 && packages.length === 0 && included.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma assinatura ou ferramenta encontrada. Use “+ Nova assinatura ou ferramenta”.
        </Card>
      )}
    </div>
  );
}
