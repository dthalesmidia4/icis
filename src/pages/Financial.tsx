/**
 * Central Financeira POR DOMÍNIO.
 *
 * `/financeiro` não é mais uma tela operacional: é um hub onde o usuário
 * escolhe o ASSUNTO (pagamentos diretos, cartões e faturas, assinaturas e
 * ferramentas, ajustes). `Composição do mês` é o drill-down do resumo. Só dentro do domínio aparecem tabelas e filtros.
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
import { FinanceLoadErrorState } from "@/components/finance/FinanceLoadErrorState";
import { PageHeader } from "@/components/PageHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import FinanceItemFormModal from "@/components/finance/FinanceItemFormModal";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import FinanceAccessGate from "@/components/finance/FinanceAccessGate";
import FinancePasswordSettingsCard from "@/components/finance/FinancePasswordSettingsCard";
import StatementPanel from "@/components/finance/StatementPanel";
import AttentionPanel from "@/components/finance/AttentionPanel";
import MonthAccountsList from "@/components/finance/MonthAccountsList";
import MonthCompositionList from "@/components/finance/MonthCompositionList";
import SubscriptionsPanel from "@/components/finance/SubscriptionsPanel";
import PaymentQueue from "@/components/finance/PaymentQueue";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseLocalizedNumber } from "@/lib/financeNumber";
import { useFinance, currentCompetence, todayISO } from "@/hooks/useFinance";
import { useFinanceAccessScope } from "@/hooks/useFinanceAccessScope";
import FinanceToolsCockpit from "@/components/finance/FinanceToolsCockpit";
import {
  FinanceView,
  FINANCE_VIEWS as SCOPE_VIEWS,
  resolveFinanceView,
} from "@/lib/financeScope";
import { toSafeCard } from "@/lib/financeSubscriptionMonth";
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
import { FINANCE_SHELL, FINANCE_SHELL_WIDTH } from "@/lib/financeShell";
import {
  COMPOSITION_HINTS,
  COMPOSITION_KINDS,
  COMPOSITION_STATUSES,
  COMPOSITION_TAB_LABELS,
  CompositionStatus,
  buildMonthComposition,
  compositionOriginKey,
  compositionOriginOptions,
  compositionTotal,
  normalizeCompositionStatus,
} from "@/lib/financeComposition";
import {
  AttentionInsight,
  RowStatusContext,
  PaymentQueueEntry,
  buildAttentionInsights,
  buildPaidComposition,
  buildPaymentQueue,
  formatDayMonth,
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

/** Domínios do Financeiro — a URL manda, o escopo filtra (ver `financeScope`). */
type View = FinanceView;

const VIEWS: View[] = SCOPE_VIEWS;

const VIEW_TITLES: Record<View, { title: string; subtitle: string }> = {
  overview: {
    title: "Financeiro",
    subtitle: "Acompanhe o mês e veja o que precisa ser pago.",
  },
  composition: {
    title: "Composição do mês",
    subtitle: "Veja exatamente quais despesas formam os valores do resumo.",
  },
  accounts: {
    title: "Pagamentos diretos",
    subtitle: "Pix, boletos, transferências e outras despesas pagas fora do cartão.",
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

/** Visão simples de "Pagamentos diretos". */
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

function FinancialCockpit() {
  const [params, setParams] = useSearchParams();
  // Escopo `full` neste cockpit: a view proibida nunca é montada.
  const view: View = resolveFinanceView("full", params.get("view"));
  const goTo = (next: View) => {
    const copy = new URLSearchParams(params);
    if (next === "overview") copy.delete("view");
    else copy.set("view", next);
    // `status` só faz sentido na composição — evita param stale nos outros domínios.
    if (next !== "composition") copy.delete("status");
    setParams(copy);
  };

  /** Recorte analítico da composição (fonte da verdade é a URL). */
  const compositionStatus: CompositionStatus = normalizeCompositionStatus(params.get("status"));
  const goToComposition = (status: CompositionStatus) => {
    const copy = new URLSearchParams(params);
    copy.set("view", "composition");
    copy.set("status", status);
    setParams(copy);
  };

  const [competence, setCompetence] = useState(currentCompetence());
  const today = todayISO();

  const finance = useFinance(competence);
  const {
    loading, loadError, rows, statements, totals, overlaps, items, cards, packages, settings,
    saveOccurrence, togglePaid, payStatement, saveSettings, saveItem, setItemActive, refresh,
  } = finance;

  const [mainView, setMainView] = useState<MainView>("to_pay");
  const [advanced, setAdvanced] = useState<AdvancedFilter>("none");
  const [costCenter, setCostCenter] = useState("all");
  const [search, setSearch] = useState("");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [compositionSearch, setCompositionSearch] = useState("");
  const [compositionOrigin, setCompositionOrigin] = useState("all");
  const [compositionKind, setCompositionKind] = useState("all");
  const [compositionFiltersOpen, setCompositionFiltersOpen] = useState(false);
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
  /** Assinaturas só precisam de rótulo/ciclo do cartão — nunca limite ou fatura. */
  const safeCards = useMemo(() => cards.map(toSafeCard), [cards]);
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

  /** Relação pago x em aberto — derivada apenas dos totais, nunca persistida. */
  const composition = useMemo(() => buildPaidComposition(totals), [totals]);

  /* --------------------- Composição do mês (auditoria) -------------------- */

  /** Recorte bruto: reconcilia exatamente com os KPIs, sem filtros da UI. */
  const compositionEntries = useMemo(
    () => buildMonthComposition({ rows, status: compositionStatus }),
    [rows, compositionStatus],
  );

  const compositionOrigins = useMemo(
    () => compositionOriginOptions(rows, cardsById, cardDisplayLabel),
    [rows, cardsById],
  );

  const compositionFilterCount =
    (compositionOrigin !== "all" ? 1 : 0) + (compositionKind !== "all" ? 1 : 0) + (costCenter !== "all" ? 1 : 0);

  const compositionVisible = useMemo(() => {
    let result = compositionEntries;
    if (costCenter !== "all") result = result.filter((e) => e.row.item.cost_center === costCenter);
    if (compositionOrigin !== "all")
      result = result.filter((e) => compositionOriginKey(e.row) === compositionOrigin);
    if (compositionKind !== "all") result = result.filter((e) => e.row.item.kind === compositionKind);
    const term = compositionSearch.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (e) =>
          e.row.item.name.toLowerCase().includes(term) ||
          (e.row.item.purpose ?? "").toLowerCase().includes(term) ||
          (e.row.item.category ?? "").toLowerCase().includes(term),
      );
    }
    return result;
  }, [compositionEntries, costCenter, compositionOrigin, compositionKind, compositionSearch]);

  const compositionTotals: Record<CompositionStatus, number> = {
    all: totals.expected,
    paid: totals.paid,
    open: totals.open,
  };
  const compositionVisibleTotal = useMemo(() => compositionTotal(compositionVisible), [compositionVisible]);
  const compositionNarrowed = compositionVisible.length !== compositionEntries.length;

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
    if (action.type === "open_accounts") {
      goTo("accounts");
      setMainView("to_pay");
      setAdvanced("none");
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
      {isCurrentMonth ? (
        <span className="text-sm text-muted-foreground">Hoje, {formatDayMonth(today)}</span>
      ) : (
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
      title: "Pagamentos diretos",
      meta:
        accountsSummary.pending === 1
          ? "1 pendente"
          : `${accountsSummary.pending} pendentes`,
    },
    {
      view: "cards" as View,
      icon: CreditCard,
      title: "Cartões e faturas",
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

  if (loadError) {
    return (
      <div className="pb-16">
        <PageHeader
          containerClassName={FINANCE_SHELL_WIDTH}
          title={VIEW_TITLES[view].title}
          subtitle={VIEW_TITLES[view].subtitle}
          backTo="/"
        />
        <div className={`${FINANCE_SHELL_WIDTH} mt-6`}>
          <FinanceLoadErrorState message={loadError} onRetry={refresh} />
        </div>
      </div>
    );
  }

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
                        label: "Nova despesa direta",
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
                {/* Cada métrica é porta de auditoria: abre a composição no recorte. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border gap-2 sm:gap-0">
                  <button
                    type="button"
                    onClick={() => goToComposition("all")}
                    aria-label="Gastos previstos — ver composição do mês"
                    className="text-left rounded-md -m-1 p-1 sm:mr-5 sm:pr-5 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">Gastos previstos</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label="Como os gastos são somados"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Info className="w-4 h-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px]">
                            Compras no cartão entram como despesa aqui; a fatura não é somada
                            novamente.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="block text-[26px] sm:text-[28px] font-bold leading-tight mt-1">
                      {formatBRL(totals.expected)}
                    </span>
                    <span className="block text-sm text-muted-foreground">estimativa para o mês</span>
                    <span className="block text-sm text-primary mt-1">Ver composição →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => goToComposition("paid")}
                    aria-label="Já pago — ver pagamentos do mês"
                    className="text-left rounded-md -m-1 p-1 sm:mx-5 sm:px-5 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block text-sm text-muted-foreground">Já pago</span>
                    <span className="block text-[26px] sm:text-[28px] font-bold leading-tight mt-1">
                      {formatBRL(totals.paid)}
                    </span>
                    <span className="block text-sm text-muted-foreground">pagamentos já realizados</span>
                    <span className="block text-sm text-primary mt-1">Ver pagamentos →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => goToComposition("open")}
                    aria-label="Em aberto — ver pendências do mês"
                    className="text-left rounded-md -m-1 p-1 sm:ml-5 sm:pl-5 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block text-sm text-muted-foreground">Em aberto</span>
                    <span className="block text-[26px] sm:text-[28px] font-bold leading-tight mt-1">
                      {formatBRL(totals.open)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      despesas ainda não liquidadas
                    </span>
                    <span className="block text-sm text-primary mt-1">Ver pendências →</span>
                  </button>
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


        {/* ====================== COMPOSIÇÃO DO MÊS ====================== */}
        {view === "composition" && (
          <section className="space-y-4">
            {/* Tabs com os totais canônicos — nunca recomputados aqui. */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {COMPOSITION_STATUSES.map((status) => {
                const active = compositionStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => goToComposition(status)}
                    aria-pressed={active}
                    className={`flex-shrink-0 rounded-md border px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active ? "border-primary bg-primary/10" : "bg-card hover:bg-muted/50"
                    }`}
                  >
                    <span className="block text-sm text-muted-foreground">
                      {COMPOSITION_TAB_LABELS[status]}
                    </span>
                    <span className="block text-[15px] font-semibold whitespace-nowrap">
                      {formatBRL(compositionTotals[status])}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-muted-foreground">{COMPOSITION_HINTS[compositionStatus]}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Buscar despesa..."
                value={compositionSearch}
                onChange={(e) => setCompositionSearch(e.target.value)}
                className="h-10 w-full sm:w-56"
              />

              <Popover open={compositionFiltersOpen} onOpenChange={setCompositionFiltersOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-10">
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filtros
                    {compositionFilterCount > 0 && (
                      <Badge className="ml-2 bg-primary/10 text-primary border-primary/30" variant="outline">
                        {compositionFilterCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] space-y-4">
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
                  <div>
                    <Label className="text-sm">Origem de pagamento</Label>
                    <Select value={compositionOrigin} onValueChange={setCompositionOrigin}>
                      <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {compositionOrigins.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Tipo</Label>
                    <Select value={compositionKind} onValueChange={setCompositionKind}>
                      <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {COMPOSITION_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full min-h-10"
                    onClick={() => {
                      setCostCenter("all");
                      setCompositionOrigin("all");
                      setCompositionKind("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </PopoverContent>
              </Popover>

              {compositionNarrowed && (
                <span className="text-sm text-muted-foreground">
                  Exibindo {formatBRL(compositionVisibleTotal)} de{" "}
                  {formatBRL(compositionTotals[compositionStatus])} deste recorte
                </span>
              )}
            </div>

            <MonthCompositionList
              entries={compositionVisible}
              statusContext={statusContext}
              loading={loading}
              emptyMessage="Nenhuma despesa neste recorte com esses filtros."
              onOpenRow={setOccurrenceRow}
            />
          </section>
        )}

        {/* ====================== PAGAMENTOS DIRETOS ====================== */}
        {view === "accounts" && (
          <section className="space-y-4">
            <Card className="p-4 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <p className="text-sm text-muted-foreground">A pagar em {monthLabel}</p>
                <p className="text-xl font-bold">{formatBRL(accountsSummary.open)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pagamentos pendentes</p>
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
                placeholder="Buscar despesa..."
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
            cards={safeCards}
            rows={subscriptionRows}
            statusContext={statusContext}
            overlaps={overlaps}
            competence={competence}
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
                  await saveSettings({
                    monthlyBudgetBrl: parseLocalizedNumber(budgetInput),
                    defaultUsdRate: parseLocalizedNumber(rateInput),
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

            <FinancePasswordSettingsCard />
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
        allItems={items}
        defaultUsdRate={settings.defaultUsdRate}
        onSave={saveItem}
      />

      <FinanceOccurrenceModal
        open={!!occurrenceRow}
        onOpenChange={(open) => !open && setOccurrenceRow(null)}
        row={occurrenceRow}
        cards={cards}
        defaultUsdRate={settings.defaultUsdRate}
        onSave={saveOccurrence}
        onEditItem={(item) => {
          setOccurrenceRow(null);
          openItemModal(item);
        }}
      />

    </div>
  );
}

/**
 * A trava de senha envolve TODO o cockpit: nenhum número aparece (nem consulta
 * financeira acontece) antes de `FinanceAccessGate` liberar o acesso — e esse
 * desbloqueio vive apenas em memória, então cada nova entrada pede a senha.
 */
export default function Financial() {
  const { canAccessFullFinance, canAccessTools, isLoading } = useFinanceAccessScope();
  const navigate = useNavigate();

  if (isLoading) return <LoadingScreen title="Verificando acesso ao Financeiro..." />;

  if (!canAccessTools) {
    return (
      <div className="container max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          O Financeiro está disponível apenas para administradores da agência e pessoas autorizadas.
        </p>
        <Button onClick={() => navigate("/")}>Voltar para o início</Button>
      </div>
    );
  }

  // A senha é exigida nos DOIS escopos — ela não concede autorização, só protege.
  return (
    <FinanceAccessGate>
      {canAccessFullFinance ? <FinancialCockpit /> : <FinanceToolsCockpit />}
    </FinanceAccessGate>
  );
}
