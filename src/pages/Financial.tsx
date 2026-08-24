/**
 * Central Financeira POR DOMÍNIO.
 *
 * `/financeiro` não é mais uma tela operacional: é um hub onde o usuário
 * escolhe o ASSUNTO (contas a pagar, cartões e faturas, assinaturas e
 * ferramentas, ajustes). Só dentro do domínio aparecem tabelas e filtros.
 *
 * A view atual vive na URL (`?view=`), então voltar do navegador funciona e o
 * link pode ser compartilhado.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  Receipt,
  Repeat,
  Settings2,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageHeader } from "@/components/PageHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import FinanceItemFormModal from "@/components/finance/FinanceItemFormModal";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import StatementPanel from "@/components/finance/StatementPanel";
import AttentionPanel from "@/components/finance/AttentionPanel";
import MonthAccountsList from "@/components/finance/MonthAccountsList";
import SubscriptionsPanel from "@/components/finance/SubscriptionsPanel";
import PaymentQueue from "@/components/finance/PaymentQueue";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFinance, currentCompetence, todayISO } from "@/hooks/useFinance";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { addMonths } from "@/lib/financeCardCycle";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  FinanceKind,
  MonthRow,
  StatementGroup,
  applyQuickFilter,
  cardDisplayLabel,
  filterByCostCenter,
  formatBRL,
  isStatementRow,
} from "@/lib/financeModel";
import {
  AttentionInsight,
  RowStatusContext,
  PaymentQueueEntry,
  buildAttentionInsights,
  buildPaymentQueue,
  isDirectPayableRow,
  isSubscriptionsDomainItem,
  monthFullLabel,
  overdueDirectRows,
  resolveRowStatus,
} from "@/lib/financeRowStatus";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Domínios do Financeiro — a URL manda. */
type View = "overview" | "accounts" | "cards" | "subscriptions" | "settings";

const VIEWS: View[] = ["overview", "accounts", "cards", "subscriptions", "settings"];

const VIEW_TITLES: Record<View, { title: string; subtitle: string }> = {
  overview: {
    title: "Financeiro",
    subtitle: "Acompanhe o mês e veja o que precisa ser pago.",
  },
  accounts: {
    title: "Contas a pagar",
    subtitle:
      "Aqui estão os pagamentos que você faz diretamente. Compras no cartão são pagas pela fatura.",
  },
  cards: {
    title: "Cartões e faturas",
    subtitle: "Seus cartões, o limite de cada um e a fatura que precisa ser paga.",
  },
  subscriptions: {
    title: "Assinaturas e ferramentas",
    subtitle: "Serviços recorrentes, ferramentas e pacotes.",
  },
  settings: {
    title: "Ajustes do financeiro",
    subtitle: "Câmbio de referência, orçamento mensal e dados que faltam nos cartões.",
  },
};

/** Visão simples de "Contas a pagar". */
type MainView = "to_pay" | "paid" | "all";

const MAIN_VIEWS: { value: MainView; label: string }[] = [
  { value: "to_pay", label: "A pagar" },
  { value: "paid", label: "Pagas" },
  { value: "all", label: "Todas" },
];

type AdvancedFilter = "none" | "today" | "tomorrow" | "overdue" | "next7" | "recurring";

const ADVANCED_FILTERS: { value: AdvancedFilter; label: string }[] = [
  { value: "none", label: "Sem filtro de data" },
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "overdue", label: "Atrasadas" },
  { value: "next7", label: "Próximos 7 dias" },
  { value: "recurring", label: "Recorrentes" },
];

export default function Financial() {
  const navigate = useNavigate();
  const { canAccess, isLoading: accessLoading } = useFinanceAccess();
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.includes(params.get("view") as View)
    ? (params.get("view") as View)
    : "overview";
  const goTo = (next: View) => {
    const copy = new URLSearchParams(params);
    if (next === "overview") copy.delete("view");
    else copy.set("view", next);
    setParams(copy);
  };

  const [competence, setCompetence] = useState(currentCompetence());
  const today = todayISO();

  const finance = useFinance(competence);
  const {
    loading, rows, statements, totals, overlaps, items, cards, packages, settings,
    saveOccurrence, togglePaid, payStatement, saveSettings, saveItem, setItemActive,
  } = finance;

  const [mainView, setMainView] = useState<MainView>("to_pay");
  const [advanced, setAdvanced] = useState<AdvancedFilter>("none");
  const [costCenter, setCostCenter] = useState("all");
  const [search, setSearch] = useState("");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FinanceItem | null>(null);
  const [initialKind, setInitialKind] = useState<FinanceKind | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<MonthRow | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [highlightIncomplete, setHighlightIncomplete] = useState(false);

  useEffect(() => {
    setBudgetInput(settings.monthlyBudgetBrl != null ? String(settings.monthlyBudgetBrl) : "");
    setRateInput(settings.defaultUsdRate != null ? String(settings.defaultUsdRate) : "");
  }, [settings.monthlyBudgetBrl, settings.defaultUsdRate]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const statusContext = useMemo<RowStatusContext>(
    () => ({ rows, today, cardsById }),
    [rows, today, cardsById],
  );

  const operationalRows = useMemo(() => rows.filter((row) => !isStatementRow(row)), [rows]);
  const accountRows = useMemo(() => operationalRows.filter(isDirectPayableRow), [operationalRows]);
  const subscriptionRows = useMemo(
    () => operationalRows.filter((row) => isSubscriptionsDomainItem(row.item)),
    [operationalRows],
  );

  const insights = useMemo(
    () => buildAttentionInsights({ rows, statements, today, cardsById }),
    [rows, statements, today, cardsById],
  );

  /** Fila de próximos pagamentos (hoje/futuro). Atrasos ficam nas exceções. */
  const paymentQueue = useMemo(
    () => buildPaymentQueue({ rows, statements, today, cardsById }),
    [rows, statements, today, cardsById],
  );

  const openItemModal = (item: FinanceItem | null, kind?: FinanceKind) => {
    setEditingItem(item);
    setInitialKind(item ? null : kind ?? null);
    setItemModalOpen(true);
  };

  const advancedActiveCount = useMemo(
    () => (advanced !== "none" ? 1 : 0) + (costCenter !== "all" ? 1 : 0),
    [advanced, costCenter],
  );

  const visibleRows = useMemo(() => {
    let result = accountRows;

    if (mainView === "to_pay") {
      result = result.filter((row) => resolveRowStatus(row, statusContext).kind !== "paid");
    } else if (mainView === "paid") {
      result = result.filter((row) => resolveRowStatus(row, statusContext).kind === "paid");
    }

    if (advanced === "overdue") {
      result = result.filter((row) => resolveRowStatus(row, statusContext).kind === "overdue");
    } else if (advanced !== "none") {
      result = applyQuickFilter(result, advanced as unknown as Parameters<typeof applyQuickFilter>[1], today);
    }

    result = filterByCostCenter(result, costCenter);

    const term = search.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (row) =>
          row.item.name.toLowerCase().includes(term) ||
          (row.item.purpose ?? "").toLowerCase().includes(term) ||
          (row.item.category ?? "").toLowerCase().includes(term),
      );
    }
    return result;
  }, [accountRows, mainView, advanced, costCenter, search, today, statusContext]);

  /* ------------------------- Números por domínio ------------------------- */

  const accountsSummary = useMemo(() => {
    const pending = accountRows.filter((row) => resolveRowStatus(row, statusContext).kind !== "paid");
    const overdue = overdueDirectRows(accountRows, statusContext);
    const open = pending.reduce((sum, r) => sum + (r.amountBrl ?? 0), 0);
    return { pending: pending.length, overdue: overdue.length, open };
  }, [accountRows, statusContext]);

  const cardsSummary = useMemo(() => {
    const unpaid = statements.filter((g) => !g.paid);
    const total = unpaid.reduce((sum, g) => sum + (g.actualTotal ?? g.projectedTotal), 0);
    const overdue = unpaid.filter((g) => g.dueDate && g.dueDate < today).length;
    const incomplete = statements.filter((g) => g.configIncomplete).length;
    return { count: cards.length, total, overdue, incomplete };
  }, [statements, cards.length, today]);

  const subscriptionsSummary = useMemo(() => {
    const active = items.filter((i) => isSubscriptionsDomainItem(i) && i.active);
    return { count: active.length, total: totals.toolsAndAi, overlaps: overlaps.size };
  }, [items, totals.toolsAndAi, overlaps]);

  const monthLabel = monthFullLabel(competence);
  const overBudget =
    settings.monthlyBudgetBrl != null ? totals.expected - settings.monthlyBudgetBrl : null;
  const budgetUsage =
    settings.monthlyBudgetBrl != null && settings.monthlyBudgetBrl > 0
      ? Math.min(100, Math.round((totals.expected / settings.monthlyBudgetBrl) * 100))
      : null;

  const handlePayStatement = async (group: StatementGroup) => {
    const occ = group.statementRow?.occurrence;
    if (!occ) return;
    await payStatement(occ.id, group.actualTotal ?? group.projectedTotal);
  };

  const handleOpenStatement = (group: StatementGroup) => {
    if (group.statementRow) setOccurrenceRow(group.statementRow);
  };

  const handleInsightAction = (insight: AttentionInsight) => {
    const action = insight.action;
    if (!action) return;
    if (action.type === "filter_overdue") {
      goTo("accounts");
      setMainView("to_pay");
      setAdvanced("overdue");
      setCostCenter("all");
      return;
    }
    if (action.type === "open_subscriptions") {
      goTo("subscriptions");
      return;
    }
    if (action.type === "open_cards") {
      goTo("cards");
      setHighlightIncomplete(true);
      setFocusCardId(null);
      return;
    }
    goTo("cards");
    setHighlightIncomplete(false);
    setFocusCardId(action.cardId);
  };

  if (accessLoading) return <LoadingScreen title="Verificando acesso ao Financeiro..." />;

  if (!canAccess) {
    return (
      <div className="container max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          O Financeiro está disponível apenas para administradores da agência e gestores autorizados.
        </p>
        <Button onClick={() => navigate("/")}>Voltar para o início</Button>
      </div>
    );
  }

  const currentComp = currentCompetence();
  const isCurrentMonth =
    competence.year === currentComp.year && competence.month === currentComp.month;

  // Seletor compacto de competência: é CONTEÚDO da página, logo abaixo do
  // header único — nunca uma segunda barra de cabeçalho.
  const monthSwitcher = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-md border bg-card px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Mês anterior"
          onClick={() => setCompetence(addMonths(competence, -1))}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="px-2 text-[15px] font-semibold min-w-[130px] text-center">
          {MONTH_LABELS[competence.month - 1]} {competence.year}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Mês seguinte"
          onClick={() => setCompetence(addMonths(competence, 1))}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      {!isCurrentMonth && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9"
          onClick={() => setCompetence(currentCompetence())}
        >
          Voltar ao mês atual
        </Button>
      )}
    </div>
  );

  /* ---------------------- APROFUNDAMENTOS (sem valores) ---------------------- */

  const shortcuts = [
    {
      view: "accounts" as View,
      icon: Receipt,
      title: "Contas a pagar",
      description: "Veja vencimentos e marque pagamentos diretos.",
      meta:
        accountsSummary.pending === 1
          ? "1 pendente"
          : `${accountsSummary.pending} pendentes`,
    },
    {
      view: "cards" as View,
      icon: CreditCard,
      title: "Cartões e faturas",
      description: "Veja faturas, limites e cobranças de cada cartão.",
      meta:
        cardsSummary.incomplete > 0
          ? `${cardsSummary.count} ${cardsSummary.count === 1 ? "cartão" : "cartões"} · ${cardsSummary.incomplete} ${
              cardsSummary.incomplete === 1 ? "precisa de dados" : "precisam de dados"
            }`
          : `${cardsSummary.count} ${cardsSummary.count === 1 ? "cartão" : "cartões"}`,
    },
    {
      view: "subscriptions" as View,
      icon: Repeat,
      title: "Assinaturas e ferramentas",
      description: "Gerencie gastos recorrentes, ferramentas e pacotes.",
      meta:
        subscriptionsSummary.count === 1
          ? "1 ativa"
          : `${subscriptionsSummary.count} ativas`,
    },
  ];

  const handleQueueSelect = (entry: PaymentQueueEntry) => {
    if (entry.type === "statement") {
      goTo("cards");
      setHighlightIncomplete(false);
      setFocusCardId(entry.cardId ?? null);
      return;
    }
    goTo("accounts");
    setMainView("to_pay");
    setAdvanced("none");
    setCostCenter("all");
    if (entry.row) setOccurrenceRow(entry.row);
  };

  return (
    <div className="pb-16">
      <PageHeader
        containerClassName={FINANCE_SHELL_WIDTH}
        title={VIEW_TITLES[view].title}
        subtitle={VIEW_TITLES[view].subtitle}
        backTo={view === "overview" ? "/" : undefined}
        onBack={view === "overview" ? undefined : () => goTo("overview")}
        actions={
          view === "overview"
            ? [
                {
                  label: "Ajustes",
                  onClick: () => goTo("settings"),
                  icon: <Settings2 className="w-4 h-4" />,
                  variant: "ghost" as const,
                },
              ]
            : view === "cards"
              ? [
                  {
                    label: "Novo cartão",
                    onClick: () => openItemModal(null, "card"),
                    icon: <Plus className="w-4 h-4" />,
                  },
                ]
              : view === "subscriptions"
                ? [
                    {
                      label: "Nova assinatura ou ferramenta",
                      onClick: () => openItemModal(null, "tool"),
                      icon: <Plus className="w-4 h-4" />,
                    },
                  ]
                : view === "accounts"
                  ? [
                      {
                        label: "Nova conta",
                        onClick: () => openItemModal(null, "expense"),
                        icon: <Plus className="w-4 h-4" />,
                      },
                    ]
                  : []
        }
      />

      <div className={`${FINANCE_SHELL} py-5 space-y-7`}>
        {monthSwitcher}

        {/* =========================== OVERVIEW =========================== */}
        {view === "overview" && (
          <>
            {/* B. Resumo do mês — UM único painel coeso */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Resumo de {monthLabel}</h2>

              <Card className="p-5 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border gap-5 sm:gap-0">
                  <div className="sm:pr-6">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-muted-foreground">Gastos previstos</p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Como os gastos são somados"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px]">
                            Compras no cartão entram como despesa aqui; a fatura não é somada
                            novamente.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-[26px] sm:text-[28px] font-bold leading-tight mt-1">
                      {formatBRL(totals.expected)}
                    </p>
                    <p className="text-sm text-muted-foreground">estimativa para o mês</p>
                  </div>

                  <div className="sm:px-6">
                    <p className="text-sm text-muted-foreground">Já pago</p>
                    <p className="text-[26px] sm:text-[28px] font-bold leading-tight mt-1">
                      {formatBRL(totals.paid)}
                    </p>
                    <p className="text-sm text-muted-foreground">pagamentos já realizados</p>
                  </div>

                  <div className="sm:pl-6">
                    <p className="text-sm text-muted-foreground">Em aberto</p>
                    <p className="text-[26px] sm:text-[28px] font-bold leading-tight mt-1">
                      {formatBRL(totals.open)}
                    </p>
                    <p className="text-sm text-muted-foreground">despesas ainda não liquidadas</p>
                  </div>
                </div>

                {/* Relação pago x em aberto — derivada só dos totais */}
                <div className="space-y-1.5">
                  <div
                    className="h-2 rounded-full bg-muted overflow-hidden flex"
                    role="img"
                    aria-label={composition.label}
                  >
                    {composition.hasBase && (
                      <div className="h-full bg-primary" style={{ width: `${composition.paidPct}%` }} />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{composition.label}</p>
                </div>
              </Card>

              {/* C. Orçamento — SEPARADO do painel e nunca ligado a limite de cartão */}
              {settings.monthlyBudgetBrl != null ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">Orçamento do mês</p>
                    <p className="text-sm text-muted-foreground">
                      {formatBRL(totals.expected)} de {formatBRL(settings.monthlyBudgetBrl)} planejados
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${overBudget! > 0 ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${budgetUsage ?? 0}%` }}
                    />
                  </div>
                  <p className={`text-sm ${overBudget! > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {overBudget! > 0
                      ? `${formatBRL(overBudget!)} acima do planejado`
                      : `${formatBRL(Math.abs(overBudget!))} ainda disponíveis no planejamento`}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-muted-foreground">Orçamento mensal ainda não definido</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm"
                    onClick={() => goTo("settings")}
                  >
                    Definir
                  </Button>
                </div>
              )}
            </section>

            {/* D. Próximos pagamentos — centro operacional */}
            <PaymentQueue entries={paymentQueue} today={today} onSelect={handleQueueSelect} />

            {/* E. Exceções */}
            <AttentionPanel insights={insights} onAction={handleInsightAction} />

            {/* F. Navegação secundária compacta */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Consultar e gerenciar</h2>
              <Card className="divide-y md:divide-y-0 md:grid md:grid-cols-3 md:divide-x">
                {shortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <button
                      key={shortcut.view}
                      onClick={() => goTo(shortcut.view)}
                      className="text-left w-full px-4 py-4 min-h-[72px] flex items-center gap-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold truncate">
                          {shortcut.title}
                        </span>
                        <span className="block text-sm text-muted-foreground truncate">
                          {shortcut.meta}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </Card>
            </section>
          </>
        )}


        {/* ======================== CONTAS A PAGAR ======================== */}
        {view === "accounts" && (
          <section className="space-y-4">
            <Card className="p-4 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-sm text-muted-foreground">A pagar em {monthLabel}</p>
                <p className="text-xl font-bold">{formatBRL(accountsSummary.open)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contas pendentes</p>
                <p className="text-xl font-bold">{accountsSummary.pending}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Atrasadas</p>
                <p className={`text-xl font-bold ${accountsSummary.overdue > 0 ? "text-destructive" : ""}`}>
                  {accountsSummary.overdue}
                </p>
              </div>
            </Card>

            <p className="text-sm text-muted-foreground">
              Cobranças feitas no cartão não aparecem aqui como conta atrasada: elas vencem junto com a
              fatura, em <button className="underline" onClick={() => goTo("cards")}>Cartões e faturas</button>.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {MAIN_VIEWS.map((v) => (
                <Button
                  key={v.value}
                  size="sm"
                  className="min-h-10"
                  variant={mainView === v.value ? "default" : "outline"}
                  onClick={() => setMainView(v.value)}
                >
                  {v.label}
                </Button>
              ))}

              <Input
                placeholder="Buscar conta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full sm:w-56"
              />

              <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-10">
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filtros
                    {advancedActiveCount > 0 && (
                      <Badge className="ml-2 bg-primary/10 text-primary border-primary/30" variant="outline">
                        {advancedActiveCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] space-y-4">
                  <div>
                    <Label className="text-sm">Data</Label>
                    <Select value={advanced} onValueChange={(v) => setAdvanced(v as AdvancedFilter)}>
                      <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADVANCED_FILTERS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Centro de custo</Label>
                    <Select value={costCenter} onValueChange={setCostCenter}>
                      <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {Object.entries(COST_CENTER_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full min-h-10"
                    onClick={() => {
                      setAdvanced("none");
                      setCostCenter("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </PopoverContent>
              </Popover>
            </div>

            <MonthAccountsList
              rows={visibleRows}
              statusContext={statusContext}
              cards={cards}
              overlaps={overlaps}
              today={today}
              loading={loading}
              emptyMessage={
                mainView === "to_pay"
                  ? "Nada pendente com esses filtros neste mês."
                  : "Nenhuma conta para este filtro neste mês."
              }
              onOpenRow={setOccurrenceRow}
              onTogglePaid={togglePaid}
              onEditItem={(item) => openItemModal(item)}
            />
          </section>
        )}

        {/* ====================== CARTÕES E FATURAS ====================== */}
        {view === "cards" && (
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A <strong>fatura</strong> é a conta que sai do seu caixa. As cobranças listadas dentro dela
              apenas explicam o valor — elas não são somadas duas vezes no total do mês.
            </p>

            {statements.length === 0 ? (
              <Card className="p-10 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Nenhum cartão cadastrado. Cadastre o cartão para acompanhar limite, fechamento,
                  vencimento e fatura.
                </p>
                <Button className="min-h-10" onClick={() => openItemModal(null, "card")}>
                  <Plus className="w-4 h-4 mr-2" /> Novo cartão
                </Button>
              </Card>
            ) : (
              <StatementPanel
                groups={statements}
                competence={competence}
                today={today}
                focusCardId={focusCardId}
                highlightIncomplete={highlightIncomplete}
                onOpenRow={setOccurrenceRow}
                onOpenStatement={handleOpenStatement}
                onPayStatement={handlePayStatement}
                onEditCard={(card) => openItemModal(card)}
              />
            )}
          </section>
        )}

        {/* =================== ASSINATURAS E FERRAMENTAS ================== */}
        {view === "subscriptions" && (
          <SubscriptionsPanel
            items={items}
            cards={cards}
            rows={subscriptionRows}
            statusContext={statusContext}
            overlaps={overlaps}
            competence={competence}
            monthlyTotal={totals.toolsAndAi}
            search={subscriptionSearch}
            onSearchChange={setSubscriptionSearch}
            onEdit={(item) => openItemModal(item)}
            onToggleActive={setItemActive}
            onOpenRow={setOccurrenceRow}
            onTogglePaid={togglePaid}
          />
        )}

        {/* =========================== AJUSTES =========================== */}
        {view === "settings" && (
          <section className="space-y-4 max-w-2xl">
            <Card className="p-5 space-y-4">
              <div>
                <Label>Orçamento mensal (R$)</Label>
                <Input
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  inputMode="decimal"
                  className="h-10"
                  placeholder="Deixe vazio para não usar orçamento"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  É o quanto você pretende gastar por mês. Não é limite de cartão — o limite fica no
                  cadastro de cada cartão.
                </p>
              </div>
              <div>
                <Label>Câmbio de referência (R$ por US$)</Label>
                <Input
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  inputMode="decimal"
                  className="h-10"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Usado apenas quando o mês não tem câmbio próprio informado.
                </p>
              </div>
              <Button
                className="min-h-10"
                onClick={async () => {
                  const budget = Number(budgetInput.replace(/\./g, "").replace(",", "."));
                  const rate = Number(rateInput.replace(/\./g, "").replace(",", "."));
                  await saveSettings({
                    monthlyBudgetBrl: budgetInput.trim() && Number.isFinite(budget) ? budget : null,
                    defaultUsdRate: rateInput.trim() && Number.isFinite(rate) ? rate : null,
                  });
                }}
              >
                Salvar ajustes
              </Button>
            </Card>

            <Card className="p-5 space-y-3">
              <div>
                <p className="text-[15px] font-semibold">Cartões com dados incompletos</p>
                <p className="text-sm text-muted-foreground">
                  Sem fechamento e vencimento não é possível projetar as próximas faturas.
                </p>
              </div>
              {statements.filter((g) => g.configIncomplete).length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os cartões estão completos.</p>
              ) : (
                statements
                  .filter((g) => g.configIncomplete)
                  .map((g) => (
                    <div key={g.card.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{cardDisplayLabel(g.card)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-10"
                        onClick={() => openItemModal(g.card)}
                      >
                        Completar
                      </Button>
                    </div>
                  ))
              )}
            </Card>
          </section>
        )}
      </div>

      <FinanceItemFormModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        item={editingItem}
        initialKind={initialKind}
        cards={cards}
        packages={packages}
        defaultUsdRate={settings.defaultUsdRate}
        onSave={saveItem}
      />

      <FinanceOccurrenceModal
        open={!!occurrenceRow}
        onOpenChange={(open) => !open && setOccurrenceRow(null)}
        row={occurrenceRow}
        defaultUsdRate={settings.defaultUsdRate}
        onSave={saveOccurrence}
      />
    </div>
  );
}
