/**
 * "Contas fixas e assinaturas" — o cadastro permanente organizado em seções
 * compreensíveis, com resumo secundário de ferramentas e IA.
 */
import { Pencil, Power } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  RECURRENCE_LABELS,
  formatBRL,
  formatCurrencyValue,
} from "@/lib/financeModel";
import { Competence, dateInMonth } from "@/lib/financeCardCycle";
import { formatDayMonth } from "@/lib/financeRowStatus";

interface Props {
  items: FinanceItem[];
  cards: FinanceItem[];
  overlaps: Map<string, string[]>;
  competence: Competence;
  toolsAndAiTotal: number;
  onEdit: (item: FinanceItem) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

function nextExpected(item: FinanceItem, competence: Competence): string | null {
  if (item.kind === "card") {
    return item.statement_due_day != null ? dateInMonth(competence, item.statement_due_day) : null;
  }
  const day = item.charge_day ?? item.due_day ?? null;
  if (day == null) return null;
  if (item.recurrence_type === "one_off") return null;
  if (item.recurrence_type === "annual") {
    if (!item.subscription_date) return null;
    const month = Number(item.subscription_date.slice(5, 7));
    return dateInMonth({ year: competence.year, month }, day);
  }
  return dateInMonth(competence, day);
}

function Section({
  title,
  description,
  items,
  cards,
  overlaps,
  competence,
  onEdit,
  onToggleActive,
}: {
  title: string;
  description: string;
  items: FinanceItem[];
  cards: FinanceItem[];
  overlaps: Map<string, string[]>;
  competence: Competence;
  onEdit: (item: FinanceItem) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const card = item.card_item_id ? cards.find((c) => c.id === item.card_item_id) : null;
          const payment = card?.name ?? item.payment_method ?? null;
          const next = nextExpected(item, competence);
          return (
            <Card
              key={item.id}
              className={`flex flex-wrap items-center gap-3 p-4 ${item.active ? "" : "opacity-70"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-foreground">{item.name}</span>
                  <Badge variant={item.active ? "outline" : "secondary"} className="text-sm">
                    {item.active ? "Ativo" : "Inativo"}
                  </Badge>
                  {overlaps.has(item.id) && (
                    <Badge variant="outline" className="text-destructive border-destructive/40">
                      Já incluída em {overlaps.get(item.id)!.join(", ")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[
                    COST_CENTER_LABELS[item.cost_center] ?? item.cost_center,
                    item.kind === "card" ? null : RECURRENCE_LABELS[item.recurrence_type],
                    payment,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {next && (
                  <p className="text-sm text-muted-foreground">
                    {item.kind === "card" ? "Próxima fatura vence em " : "Próxima cobrança em "}
                    {formatDayMonth(next)}
                  </p>
                )}
              </div>

              <div className="text-right">
                {item.kind === "included_resource" ? (
                  <span className="text-sm text-muted-foreground">Incluído no pacote</span>
                ) : item.kind === "card" ? (
                  <span className="text-sm text-muted-foreground">
                    {item.statement_closing_day != null && item.statement_due_day != null
                      ? `Fecha dia ${item.statement_closing_day} · vence dia ${item.statement_due_day}`
                      : "Configuração incompleta"}
                  </span>
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
                <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => onEdit(item)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10"
                  onClick={() => onToggleActive(item.id, !item.active)}
                >
                  <Power className={`w-4 h-4 ${item.active ? "text-destructive" : "text-primary"}`} />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export default function RegistrationsPanel({
  items,
  cards,
  overlaps,
  competence,
  toolsAndAiTotal,
  onEdit,
  onToggleActive,
}: Props) {
  const tools = items.filter((i) => i.kind === "tool");
  const recurring = items.filter((i) => i.kind === "expense");
  const packages = items.filter((i) => i.kind === "package" || i.kind === "included_resource");
  const cardItems = items.filter((i) => i.kind === "card");

  return (
    <div className="space-y-8">
      <Section
        title="Assinaturas e ferramentas"
        description="Serviços contratados por mês ou por ano."
        items={tools}
        cards={cards}
        overlaps={overlaps}
        competence={competence}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
      />
      <Section
        title="Contas recorrentes"
        description="Contas e despesas que voltam a cada período."
        items={recurring}
        cards={cards}
        overlaps={overlaps}
        competence={competence}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
      />
      <Section
        title="Pacotes"
        description="Planos que já incluem vários serviços."
        items={packages}
        cards={cards}
        overlaps={overlaps}
        competence={competence}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
      />
      <Section
        title="Cartões"
        description="Cartões usados para pagar as cobranças."
        items={cardItems}
        cards={cards}
        overlaps={overlaps}
        competence={competence}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
      />

      {items.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhum cadastro ainda. Use “+ Adicionar” para começar.
        </Card>
      )}

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Ferramentas e IA neste mês</p>
        <p className="text-lg font-semibold">{formatBRL(toolsAndAiTotal)}</p>
      </Card>
    </div>
  );
}
