/**
 * Domínio `Assinaturas e ferramentas` — VISÃO MENSAL.
 *
 * A tela responde “o que faz parte deste mês?”. Cadastro inativo sem fato real
 * no mês não aparece aqui (isso é catálogo, não fechamento) e recursos
 * incluídos vivem DENTRO do pacote, nunca como cobrança própria.
 *
 * Quando a assinatura é paga no cartão, ela também aparece como componente da
 * fatura em `Cartões e faturas` — referência cruzada, não duplicação contábil.
 */
import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CreditCard,
  HelpCircle,
  Layers,
  Pencil,
  Power,
  Wallet,
} from "lucide-react";
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
import {
  SafeCard,
  SubscriptionEntry,
  SubscriptionMonthGroup,
  buildSubscriptionMonthView,
} from "@/lib/financeSubscriptionMonth";
import { Competence, dateInMonth } from "@/lib/financeCardCycle";
import { RowStatusContext, formatDayMonth, isCardCharge, resolveRowStatus } from "@/lib/financeRowStatus";
import { findSafeStatementStatus, groupStatementNotice } from "@/lib/financeSafeStatement";

import SubscriptionCatalogModal from "@/components/finance/SubscriptionCatalogModal";

interface Props {
  items: FinanceItem[];
  /** Cartões em formato seguro (rótulo e ciclo apenas). */
  cards: SafeCard[];
  rows: MonthRow[];
  statusContext: RowStatusContext;
  overlaps: Map<string, string[]>;
  competence: Competence;
  search: string;
  onSearchChange: (value: string) => void;
  onEdit: (item: FinanceItem) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onOpenRow: (row: MonthRow) => void;
  onTogglePaid: (row: MonthRow, paid: boolean) => void;
  /** Permite editar/desativar cadastros (escopo `tools` ou `full`). */
  canManage?: boolean;
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
  search,
  onSearchChange,
  onEdit,
  onToggleActive,
  onOpenRow,
  onTogglePaid,
  canManage = true,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({});
  const [catalogOpen, setCatalogOpen] = useState(false);

  const view = buildSubscriptionMonthView({ items, rows, cards, competence, search });

  const renderChildren = (entry: SubscriptionEntry) => {
    const open = !!expandedPackages[entry.item.id];
    return (
      <div className="pl-4 sm:pl-8 pb-3">
        <button
          type="button"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          aria-expanded={open}
          onClick={() =>
            setExpandedPackages((prev) => ({ ...prev, [entry.item.id]: !prev[entry.item.id] }))
          }
        >
          <Layers className="w-3.5 h-3.5" />
          Inclui {entry.children.length}{" "}
          {entry.children.length === 1 ? "recurso" : "recursos"}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>

        {open && (
          <div className="mt-2 rounded-md border bg-muted/30 divide-y">
            {entry.children.map((child) => (
              <div key={child.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{child.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    Incluído no pacote — sem custo adicional
                  </span>
                </span>
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label={`Editar ${child.name}`}
                    onClick={() => onEdit(child)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderEntry = (entry: SubscriptionEntry) => {
    const item = entry.item;
    const next = nextCharge(item, competence);
    const row = entry.row;
    const status = row ? resolveRowStatus(row, statusContext) : null;
    const showPay = !!row && !!status && status.canPayDirectly && !isCardCharge(row);

    return (
      <div key={item.id} className="border-t first:border-t-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-foreground">{item.name}</span>
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
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[15px] font-semibold">{formatBRL(entry.amountBrl)}</p>
            {item.currency === "USD" && (
              <p className="text-sm text-muted-foreground">
                {formatCurrencyValue(row?.amountOriginal ?? item.default_amount_original, "USD")}
              </p>
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
            {canManage && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10"
                  aria-label="Editar"
                  onClick={() => onEdit(item)}
                >
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
              </>
            )}
          </div>
        </div>

        {item.kind === "package" && entry.children.length > 0 && renderChildren(entry)}
      </div>
    );
  };

  const renderGroup = (group: SubscriptionMonthGroup) => {
    const open = !collapsed[group.key];
    const Icon = group.kind === "card" ? CreditCard : group.kind === "direct" ? Wallet : HelpCircle;
    /**
     * Fatura real da competência manda no cabeçalho: se ela existe, "Dados da
     * fatura incompletos" não pode ser apresentado como o estado da fatura.
     */
    const notice = groupStatementNotice({
      safe:
        group.kind === "card"
          ? findSafeStatementStatus(
              statusContext.safeStatementStatuses,
              group.card?.id,
              statusContext.competenceMonth,
            )
          : null,
      cycleWarning: group.warning,
      today: statusContext.today,
    });

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
                    {group.entries.length} {group.entries.length === 1 ? "assinatura" : "assinaturas"}
                  </span>
                  {notice.statementText && (
                    <Badge
                      variant="outline"
                      className={
                        notice.statementTone === "danger"
                          ? "bg-destructive/10 text-destructive border-destructive/40 text-sm"
                          : notice.statementTone === "positive"
                            ? "bg-primary/10 text-primary border-primary/30 text-sm"
                            : "text-sm"
                      }
                    >
                      {notice.statementText}
                    </Badge>
                  )}
                </div>
                {notice.projectionWarning && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {notice.projectionWarning}
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
            <div>{group.entries.map(renderEntry)}</div>
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
          <span className="text-[15px] font-semibold">{formatBRL(view.total)}</span>
        </div>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10 sm:ml-auto"
            onClick={() => setCatalogOpen(true)}
          >
            Gerenciar cadastros
          </Button>
        )}
      </Card>

      <div className="space-y-3">{view.groups.map(renderGroup)}</div>

      {view.groups.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nenhuma assinatura ou ferramenta faz parte deste mês. Use “+ Nova assinatura ou ferramenta”
          {canManage ? " ou abra “Gerenciar cadastros” para reativar algo." : "."}
        </Card>
      )}

      <SubscriptionCatalogModal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        items={items}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
      />
    </div>
  );
}
