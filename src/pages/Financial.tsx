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
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  CreditCard,
  Eye,
  EyeOff,

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
import { buildOccurrenceLabels } from "@/lib/financeOccurrenceLabels";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import FinanceSupplementalEntryModal from "@/components/finance/FinanceSupplementalEntryModal";
import FinanceAccessGate from "@/components/finance/FinanceAccessGate";
import FinancePasswordSettingsCard from "@/components/finance/FinancePasswordSettingsCard";
import StatementPanel from "@/components/finance/StatementPanel";
import { LinkedCardItem, buildLinkedCardItems } from "@/lib/financeCardLinkedItems";
import AttentionPanel from "@/components/finance/AttentionPanel";
import MonthAccountsList from "@/components/finance/MonthAccountsList";
import SkippedEntriesPanel from "@/components/finance/SkippedEntriesPanel";

import { iofRowsForStatements, sumRowsBrl } from "@/lib/financeIof";
import MonthCompositionList from "@/components/finance/MonthCompositionList";
import FinanceGroupingControl from "@/components/finance/FinanceGroupingControl";

import SubscriptionsPanel from "@/components/finance/SubscriptionsPanel";
import PaymentQueue from "@/components/finance/PaymentQueue";
import {
  GroupedPayment,
  buildGroupedPayments,
  rowFactDate,
} from "@/lib/financePaymentSchedule";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseLocalizedNumber } from "@/lib/financeNumber";
import { useFinance, currentCompetence, todayISO } from "@/hooks/useFinance";
import { clampToTrackingStart } from "@/lib/financeTrackingPeriod";
import { useFinanceAccessScope } from "@/hooks/useFinanceAccessScope";
import FinanceToolsCockpit from "@/components/finance/FinanceToolsCockpit";
import {
  FinanceView,
  FINANCE_VIEWS as SCOPE_VIEWS,
  resolveFinanceView,
} from "@/lib/financeScope";
import { toSafeCard } from "@/lib/financeSubscriptionMonth";
import {
  FinanceVisibilityProvider,
  useFinanceVisibility,
} from "@/contexts/FinanceVisibilityContext";
import { visibleStatementGroups } from "@/lib/financeCardVisibility";
import {
  COMPOSITION_GROUP_BY_LABELS,
  CompositionGroupBy,
  buildCompositionGroups,
} from "@/lib/financeGrouping";
import FinancePeriodBar from "@/components/finance/FinancePeriodBar";
import {
  categoryFilterOptions,
  filterEntriesByCategory,
  tenantCategoryOptions,
} from "@/lib/financeCategories";
import {
  competenceMonthISO,
  safeStatementStatusesFromRows,
} from "@/lib/financeSafeStatement";

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
import { financeBackTarget } from "@/lib/financeBackTarget";
import PayStatementModal from "@/components/finance/PayStatementModal";
import StatementClosureModal from "@/components/finance/StatementClosureModal";
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
  mergeGroupedPaymentsIntoQueue,
  formatDayMonth,
  isDirectPayableRow,
  isSubscriptionsDomainItem,
  monthFullLabel,
  overdueDirectRows,
  resolveRowStatus,
} from "@/lib/financeRowStatus";

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
    title: "Contas e despesas",
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

/** Visão simples de "Contas e despesas". */
type MainView = "to_pay" | "paid" | "all";

const MAIN_VIEWS: { value: MainView; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "to_pay", label: "A pagar" },
  { value: "paid", label: "Pagas" },
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

  const [competence, setCompetence] = useState(clampToTrackingStart(currentCompetence()));
  const today = todayISO();

  const finance = useFinance(competence);
  const {
    loading, loadError, rows, statements, settlement, totals, overlaps, items, cards, packages, settings,
    skipped, skipOccurrence, restoreOccurrence,
    saveOccurrence, togglePaid, payStatement, updateStatementClosure, saveSettings, saveItem, setItemActive, refresh,
  } = finance;


  /**
   * `Contas e despesas` é a tela de CONSULTA E GESTÃO do mês: abre em `Todas`.
   * Os recortes operacionais (`A pagar`/`Atrasadas`) só vêm de deep-link
   * explícito de fila/alerta.
   */
  const [mainView, setMainView] = useState<MainView>("all");
  const [advanced, setAdvanced] = useState<AdvancedFilter>("none");
  const [costCenter, setCostCenter] = useState("all");
  const [search, setSearch] = useState("");
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [compositionSearch, setCompositionSearch] = useState("");
  const [compositionOrigin, setCompositionOrigin] = useState("all");
  const [compositionKind, setCompositionKind] = useState("all");
  const [compositionCategory, setCompositionCategory] = useState("all");
  /** Dimensão de agrupamento da composição (categoria x centro de custo). */
  const [compositionGroupBy, setCompositionGroupBy] = useState<CompositionGroupBy>("category");
  /** Organização de `Contas e despesas` — mesma inteligência, tela própria. */
  const [accountsGroupBy, setAccountsGroupBy] = useState<CompositionGroupBy>("category");
  const [accountsExpanded, setAccountsExpanded] = useState<Record<string, boolean>>({});
  const toggleAccountsGroup = (key: string) =>
    setAccountsExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const [compositionFiltersOpen, setCompositionFiltersOpen] = useState(false);
  /**
   * Expansão dos grupos da composição: vive AQUI porque `Agrupar por` e
   * `Expandir tudo` fazem parte do control deck no topo da tela.
   */
  const [compositionExpanded, setCompositionExpanded] = useState<Record<string, boolean>>({});
  const toggleCompositionGroup = (key: string) =>
    setCompositionExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * Privacidade de valores: estado ÚNICO do domínio (ver
   * `FinanceVisibilityProvider`). Começa oculto e atravessa todas as telas.
   */
  const { valuesVisible: showKpis, toggleValuesVisible, money } = useFinanceVisibility();
  /** Máscara única de qualquer montante do Financeiro completo. */
  const kpiText = (value: number | null) => money(value);


  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FinanceItem | null>(null);
  const [initialKind, setInitialKind] = useState<FinanceKind | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<MonthRow | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [payingGroup, setPayingGroup] = useState<StatementGroup | null>(null);
  /** Fechamento da fatura (total + IOF juntos) em consulta/ajuste. */
  const [closureGroup, setClosureGroup] = useState<StatementGroup | null>(null);
  /** Cadastro que vai receber um lançamento SUPLEMENTAR (recarga/extra). */
  const [supplementalItem, setSupplementalItem] = useState<FinanceItem | null>(null);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [highlightIncomplete, setHighlightIncomplete] = useState(false);

  useEffect(() => {
    setBudgetInput(settings.monthlyBudgetBrl != null ? String(settings.monthlyBudgetBrl) : "");
    setRateInput(settings.defaultUsdRate != null ? String(settings.defaultUsdRate) : "");
  }, [settings.monthlyBudgetBrl, settings.defaultUsdRate]);

  /**
   * Rótulos dinâmicos de TODAS as linhas do mês (inclui as cobranças dentro das
   * faturas), calculados num ponto só para tela, composição e fatura nunca
   * divergirem.
   */
  const occurrenceLabels = useMemo(() => {
    const all = new Map<string, MonthRow>();
    for (const row of rows) all.set(row.key, row);
    for (const group of statements) for (const row of group.components) all.set(row.key, row);
    return buildOccurrenceLabels([...all.values()]);
  }, [rows, statements]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  /** Assinaturas só precisam de rótulo/ciclo do cartão — nunca limite ou fatura. */
  const safeCards = useMemo(() => cards.map(toSafeCard), [cards]);
  /**
   * As linhas de fatura entram explicitamente no contexto: sem elas um
   * componente de cartão não encontra a fatura real e cairia em
   * "aguardando fatura" mesmo com a fatura já paga.
   */
  const statementRows = useMemo(
    () => statements.map((g) => g.statementRow).filter((r): r is MonthRow => !!r),
    [statements],
  );
  /**
   * Mesmo estado SEGURO consumido pelo escopo `tools`, derivado das faturas
   * reais já carregadas: garante semântica idêntica de status nos dois cockpits.
   */
  const safeStatementStatuses = useMemo(
    () => safeStatementStatusesFromRows(statementRows),
    [statementRows],
  );
  const statusContext = useMemo<RowStatusContext>(
    () => ({
      rows,
      today,
      cardsById,
      statementRows,
      settlement,
      safeStatementStatuses,
      competenceMonth: competenceMonthISO(competence),
    }),
    [rows, today, cardsById, statementRows, settlement, safeStatementStatuses, competence],
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
  const directPaymentQueue = useMemo(
    () => buildPaymentQueue({ rows, statements, today, cardsById, labels: occurrenceLabels }),
    [rows, statements, today, cardsById, occurrenceLabels],
  );

  /**
   * Saídas de caixa AGRUPADAS: quando a agenda de pagamento do cadastro junta
   * várias ocorrências numa só saída (faxina semanal paga na sexta, por ex.).
   */
  const groupedPayments = useMemo(
    () =>
      buildGroupedPayments({
        rows: operationalRows,
        rules: finance.paymentRules,
        batches: finance.batches,
        entries: finance.batchEntries,
        competence,
      }),
    [operationalRows, finance.paymentRules, finance.batches, finance.batchEntries, competence],
  );

  /**
   * A fila mostra o LOTE quando ele agrupa de fato (2+ ocorrências) e some com
   * as ocorrências absorvidas — nunca as duas coisas ao mesmo tempo.
   */
  const paymentQueue = useMemo(
    () =>
      mergeGroupedPaymentsIntoQueue({
        entries: directPaymentQueue,
        groups: groupedPayments,
        today,
      }),
    [directPaymentQueue, groupedPayments, today],
  );

  const handleGroupedPay = async (group: GroupedPayment) => {
    if (group.batch) {
      await finance.payPaymentBatch(group.batch.id, group.paymentDate ?? today);
      return;
    }
    await finance.createPaymentBatch({
      itemId: group.itemId,
      scheduledDate: group.paymentDate,
      entries: group.rows
        .map((row) => ({ itemId: row.item.id, scheduledDate: rowFactDate(row) }))
        .filter((e): e is { itemId: string; scheduledDate: string } => !!e.scheduledDate),
      payNow: true,
      paidDateISO: group.paymentDate ?? today,
    });
  };



  /** Relação pago x em aberto — derivada apenas dos totais, nunca persistida. */
  const composition = useMemo(() => buildPaidComposition(totals), [totals]);

  /* --------------------- Composição do mês (auditoria) -------------------- */

  /** Recorte bruto: reconcilia exatamente com os KPIs, sem filtros da UI. */
  const compositionEntries = useMemo(
    () => buildMonthComposition({ rows, status: compositionStatus, settlement }),
    [rows, compositionStatus, settlement],
  );

  const compositionOrigins = useMemo(
    () => compositionOriginOptions(rows, cardsById, cardDisplayLabel),
    [rows, cardsById],
  );

  const compositionCategories = useMemo(
    () => categoryFilterOptions(compositionEntries),
    [compositionEntries],
  );
  /** Categorias já usadas pelo tenant — sugestões ao editar o cadastro. */
  const knownCategories = useMemo(() => tenantCategoryOptions(items), [items]);

  const compositionFilterCount =
    (compositionOrigin !== "all" ? 1 : 0) +
    (compositionKind !== "all" ? 1 : 0) +
    (compositionCategory !== "all" ? 1 : 0) +
    (costCenter !== "all" ? 1 : 0);

  const compositionVisible = useMemo(() => {
    let result = compositionEntries;
    if (costCenter !== "all") result = result.filter((e) => e.row.item.cost_center === costCenter);
    if (compositionOrigin !== "all")
      result = result.filter((e) => compositionOriginKey(e.row) === compositionOrigin);
    if (compositionKind !== "all") result = result.filter((e) => e.row.item.kind === compositionKind);
    result = filterEntriesByCategory(result, compositionCategory);
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
  }, [
    compositionEntries,
    costCenter,
    compositionOrigin,
    compositionKind,
    compositionCategory,
    compositionSearch,
  ]);

  const compositionTotals: Record<CompositionStatus, number> = {
    all: totals.expected,
    paid: totals.paid,
    open: totals.open,
  };
  const compositionVisibleTotal = useMemo(() => compositionTotal(compositionVisible), [compositionVisible]);
  /** Grupos do recorte atual — base de `Expandir tudo` (só o que está na tela). */
  const compositionGroups = useMemo(
    () => buildCompositionGroups(compositionVisible, compositionGroupBy),
    [compositionVisible, compositionGroupBy],
  );
  const compositionAllOpen =
    compositionGroups.length > 0 && compositionGroups.every((g) => !!compositionExpanded[g.key]);
  const toggleAllCompositionGroups = () => {
    if (compositionAllOpen) {
      setCompositionExpanded({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const group of compositionGroups) next[group.key] = true;
    setCompositionExpanded(next);
  };
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
      result = applyQuickFilter(
        result,
        advanced as unknown as Parameters<typeof applyQuickFilter>[1],
        today,
        settlement,
      );
    }

    /**
     * Repasse de IOF das faturas PAGAS: fato do banco que não tem cadastro
     * próprio. Entra como linha em `Pagas`/`Todas` (jamais em `A pagar`) e
     * NUNCA traz a ocorrência da fatura inteira, que duplicaria os componentes.
     */
    if (mainView !== "to_pay" && advanced === "none") {
      result = [...result, ...iofRowsForStatements(statements)];
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
  }, [accountRows, statements, mainView, advanced, costCenter, search, today, statusContext, settlement]);

  /** Total das linhas visíveis (inclui os repasses de IOF exibidos). */
  const visibleRowsTotal = useMemo(() => sumRowsBrl(visibleRows), [visibleRows]);

  /**
   * Expansão dos grupos de `Contas e despesas` — mesma mecânica da composição:
   * vazio = todos fechados, e trocar `Agrupar por` fecha tudo de novo.
   */
  const accountsEntries = useMemo(
    () => visibleRows.map((row) => ({ row, value: row.amountBrl ?? 0 })),
    [visibleRows],
  );
  const accountsGroups = useMemo(
    () => buildCompositionGroups(accountsEntries, accountsGroupBy),
    [accountsEntries, accountsGroupBy],
  );
  const accountsAllOpen =
    accountsGroups.length > 0 && accountsGroups.every((g) => !!accountsExpanded[g.key]);
  const toggleAllAccountsGroups = () => {
    if (accountsAllOpen) {
      setAccountsExpanded({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const group of accountsGroups) next[group.key] = true;
    setAccountsExpanded(next);
  };


  /* ------------------------- Números por domínio ------------------------- */

  const accountsSummary = useMemo(() => {
    const pending = accountRows.filter((row) => resolveRowStatus(row, statusContext).kind !== "paid");
    const overdue = overdueDirectRows(accountRows, statusContext);
    const open = pending.reduce((sum, r) => sum + (r.amountBrl ?? 0), 0);
    return { pending: pending.length, overdue: overdue.length, open };
  }, [accountRows, statusContext]);

  /**
   * Cartão inativo sem fato real na competência não aparece na tela
   * operacional — o cadastro continua existindo em `Gerenciar cadastros`.
   */
  const visibleStatements = useMemo(() => visibleStatementGroups(statements), [statements]);

  /**
   * Itens ATIVOS ligados a cada cartão que NÃO compõem a fatura do mês, com o
   * motivo (outro ciclo, data ausente, ciclo não classificável). É apresentação:
   * nada aqui soma no total da fatura.
   */
  const linkedByCard = useMemo(() => {
    const map: Record<string, LinkedCardItem[]> = {};
    for (const group of visibleStatements) {
      map[group.card.id] = buildLinkedCardItems({ group, items, rows, competence });
    }
    return map;
  }, [visibleStatements, items, rows, competence]);

  /**
   * Cartão que realmente precisa ser completado: inativo não projeta nada,
   * então nunca gera pendência de configuração.
   */
  const incompleteCards = useMemo(
    () => visibleStatements.filter((g) => g.configIncomplete && g.card.active),
    [visibleStatements],
  );

  const cardsSummary = useMemo(() => {
    const unpaid = visibleStatements.filter((g) => !g.paid);
    const total = unpaid.reduce((sum, g) => sum + (g.actualTotal ?? g.projectedTotal), 0);
    const overdue = unpaid.filter((g) => g.dueDate && g.dueDate < today).length;
    return { count: visibleStatements.length, total, overdue, incomplete: incompleteCards.length };
  }, [visibleStatements, incompleteCards, today]);

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

  /** Pagamento da fatura pede a DATA REAL — nunca assume `now()`. */
  const handlePayStatement = (group: StatementGroup) => {
    if (!group.statementRow?.occurrence) return;
    setPayingGroup(group);
  };

  const confirmPayStatement = async ({
    group,
    paidDateISO,
    paidAmountBrl,
    usdComponents,
    iofBrl,
    statementAmountBrl,
  }: {
    group: StatementGroup;
    paidDateISO: string;
    paidAmountBrl: number | null;
    usdComponents?: unknown[];
    iofBrl?: number;
    statementAmountBrl?: number | null;
  }): Promise<boolean> => {
    const occ = group.statementRow?.occurrence;
    if (!occ) return false;
    // `due_date` não é enviado: o vencimento é histórico e não muda ao pagar.
    const iof = iofBrl ?? 0;
    return await payStatement(
      occ.id,
      paidAmountBrl ?? Number((group.actualTotal ?? group.projectedTotal).toFixed(2)),
      paidDateISO,
      usdComponents ?? [],
      iof,
      statementAmountBrl ?? null,
    );
  };

  const confirmStatementClosure = async (payload: {
    occurrenceId: string;
    amountBrl: number | null;
    iofBrl: number;
  }): Promise<boolean> =>
    await updateStatementClosure(payload.occurrenceId, payload.amountBrl, payload.iofBrl);


  /** Fatura só tem UM lugar de dados do fechamento: total e IOF juntos. */
  const handleOpenStatement = (group: StatementGroup) => {
    if (group.statementRow?.occurrence) setClosureGroup(group);
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




  // Barra de período compartilhada (`FinancePeriodBar`): mesmo eixo visual em
  // todas as views do Financeiro e no cockpit `tools`.
  const periodBar = (
    <FinancePeriodBar competence={competence} onChange={setCompetence} today={today} />
  );

  /* ---------------------- APROFUNDAMENTOS (sem valores) ---------------------- */

  const shortcuts = [
    {
      view: "accounts" as View,
      icon: Receipt,
      title: "Contas e despesas",
      meta:
        accountRows.length === 1
          ? "1 lançamento no mês"
          : `${accountRows.length} lançamentos no mês`,
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
    if (entry.type === "grouped" && entry.group) {
      void handleGroupedPay(entry.group);
      return;
    }
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

  const backTarget = financeBackTarget(view);
  const headerBackTo = backTarget.kind === "route" ? backTarget.to : undefined;
  const headerOnBack =
    backTarget.kind === "internal" ? () => goTo(backTarget.view) : undefined;

  if (loadError) {
    return (
      <div className="pb-16">
        <PageHeader
          containerClassName={FINANCE_SHELL_WIDTH}
          title={VIEW_TITLES[view].title}
          subtitle={VIEW_TITLES[view].subtitle}
          backTo={headerBackTo}
          onBack={headerOnBack}
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
        backTo={headerBackTo}
        onBack={headerOnBack}
        actions={
          view === "overview"
            ? [
                {
                  label: "Novo lançamento",
                  // Sem `initialKind`: o passo de intenção decide o que é.
                  onClick: () => openItemModal(null, null),
                  icon: <Plus className="w-4 h-4" />,
                },
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
                        // O destino operacional é decidido pela FORMA DE
                        // PAGAMENTO (o formulário pode escolher cartão), não
                        // pelo botão de origem.
                        label: "Nova conta ou despesa",
                        onClick: () => openItemModal(null, "expense"),
                        icon: <Plus className="w-4 h-4" />,
                      },
                    ]

                  : []
        }
      />

      <div className={`${FINANCE_SHELL} py-5 space-y-5`}>
        {view !== "composition" && periodBar}

        {/* =========================== OVERVIEW =========================== */}
        {view === "overview" && (
          <>
            {/* B. Resumo do mês — UM único painel coeso */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Resumo de {monthLabel}</h2>
                {/* Um único olho para os três números: privacidade em tela aberta. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleValuesVisible}
                  aria-label={showKpis ? "Ocultar valores do resumo" : "Exibir valores do resumo"}
                  aria-pressed={showKpis}
                >
                  {showKpis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>


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
                      {kpiText(totals.expected)}
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
                      {kpiText(totals.paid)}
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
                      {kpiText(totals.open)}
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
                      {money(totals.expected)} de {money(settings.monthlyBudgetBrl)} planejados
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
                      ? `${money(overBudget!)} acima do planejado`
                      : `${money(Math.abs(overBudget!))} ainda disponíveis no planejamento`}
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
                      onClick={() => {
                        if (shortcut.view === "accounts") {
                          // Atalho normal: consulta do mês inteiro, sem recorte.
                          setMainView("all");
                          setAdvanced("none");
                          setCostCenter("all");
                        }
                        goTo(shortcut.view);
                      }}
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
          <section className="space-y-3">
            {/* LINHA 1 — contexto + recorte: período, os três totais canônicos
                em segmented control compacto e o olho colado ao resumo. */}
            <div className="flex flex-wrap items-center gap-2">
              {periodBar}
              <div
                role="tablist"
                aria-label="Recorte da composição"
                className="flex flex-wrap items-stretch gap-1 rounded-lg border bg-muted/30 p-1 min-h-10"
              >
                {COMPOSITION_STATUSES.map((status) => {
                  const active = compositionStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => goToComposition(status)}
                      className={`inline-flex items-baseline gap-1.5 rounded-md px-3 min-h-8 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        active
                          ? "border border-primary bg-primary/10 text-foreground"
                          : "border border-transparent hover:bg-muted/60"
                      }`}
                    >
                      <span className="text-muted-foreground">{COMPOSITION_TAB_LABELS[status]}</span>
                      <span className="font-semibold whitespace-nowrap">
                        {money(compositionTotals[status])}
                      </span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={toggleValuesVisible}
                aria-label={showKpis ? "Ocultar valores do resumo" : "Exibir valores do resumo"}
                aria-pressed={showKpis}
              >
                {showKpis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>

            {/* LINHA 2 — exploração: hint flexível à esquerda, controles à direita. */}
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 min-w-[180px] text-sm text-muted-foreground">
                {COMPOSITION_HINTS[compositionStatus]}
              </p>
              <Input
                placeholder="Buscar despesa..."
                value={compositionSearch}
                onChange={(e) => setCompositionSearch(e.target.value)}
                className="h-10 w-full sm:w-52"
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
                  <div>
                    <Label className="text-sm">Categoria</Label>
                    <Select value={compositionCategory} onValueChange={setCompositionCategory}>
                      <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {compositionCategories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
                      setCompositionCategory("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </PopoverContent>
              </Popover>

              <FinanceGroupingControl
                groupBy={compositionGroupBy}
                onGroupByChange={(value) => {
                  setCompositionGroupBy(value);
                  setCompositionExpanded({});
                }}
                allOpen={compositionAllOpen}
                onToggleAll={toggleAllCompositionGroups}
              />


              {compositionNarrowed && (
                <span className="w-full text-sm text-muted-foreground">
                  Exibindo {money(compositionVisibleTotal)} de{" "}
                  {money(compositionTotals[compositionStatus])} deste recorte
                </span>
              )}
            </div>

            <MonthCompositionList
              entries={compositionVisible}
              statusContext={statusContext}
              loading={loading}
              emptyMessage="Nenhuma despesa neste recorte com esses filtros."
              onOpenRow={setOccurrenceRow}
              labels={occurrenceLabels}
              groupBy={compositionGroupBy}
              expanded={compositionExpanded}
              onToggleGroup={toggleCompositionGroup}
            />
          </section>
        )}

        {/* ====================== PAGAMENTOS DIRETOS ====================== */}
        {view === "accounts" && (
          <section className="space-y-4">
            {/* Resumo agregado: é o único bloco desta view sujeito ao olho. */}
            <Card className="p-4 flex flex-wrap items-start gap-x-8 gap-y-2">
              <div>
                <p className="text-sm text-muted-foreground">A pagar em {monthLabel}</p>
                <p className="text-xl font-bold">{money(accountsSummary.open)}</p>
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto -mt-1"
                onClick={toggleValuesVisible}
                aria-label={showKpis ? "Ocultar valores do resumo" : "Exibir valores do resumo"}
                aria-pressed={showKpis}
              >
                {showKpis ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
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

              <FinanceGroupingControl
                groupBy={accountsGroupBy}
                onGroupByChange={(value) => {
                  setAccountsGroupBy(value);
                  setAccountsExpanded({});
                }}
                allOpen={accountsAllOpen}
                onToggleAll={toggleAllAccountsGroups}
              />
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {visibleRows.length === 1 ? "1 linha" : `${visibleRows.length} linhas`} neste recorte
              </p>
              <p className="text-sm font-semibold">Total: {formatBRL(visibleRowsTotal)}</p>
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
              labels={occurrenceLabels}
              onTogglePaid={togglePaid}
              onEditItem={(item) => openItemModal(item)}
              groupBy={accountsGroupBy}
              expanded={accountsExpanded}
              onToggleGroup={toggleAccountsGroup}
            />


            {/* Ausência explicada: o que foi ignorado fica registrado e reversível. */}
            <SkippedEntriesPanel entries={skipped} onRestore={restoreOccurrence} />
          </section>

        )}

        {/* ====================== CARTÕES E FATURAS ====================== */}
        {view === "cards" && (
          <section className="space-y-4">
            {/* Sem resumo agregado nesta view: valores detalhados são sempre
                visíveis, logo não existe olho aqui. */}
            <p className="text-sm text-muted-foreground">
              A <strong>fatura</strong> é a conta que sai do seu caixa. As cobranças listadas dentro dela
              apenas explicam o valor — elas não são somadas duas vezes no total do mês.
            </p>

            {visibleStatements.length === 0 ? (
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
                groups={visibleStatements}
                competence={competence}
                today={today}
                focusCardId={focusCardId}
                highlightIncomplete={highlightIncomplete}
                onOpenRow={setOccurrenceRow}
                labels={occurrenceLabels}
                onOpenStatement={handleOpenStatement}
                onPayStatement={handlePayStatement}
                onEditCard={(card) => openItemModal(card)}
                linkedItems={linkedByCard}
                onEditItem={(item) => openItemModal(item)}
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
              {incompleteCards.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os cartões estão completos.</p>
              ) : (
                incompleteCards.map((g) => (
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
        competence={competence}
        knownCategories={knownCategories}
        paymentRules={finance.paymentRules}
        onSave={saveItem}
        onAfterDelete={refresh}
      />

      <FinanceOccurrenceModal
        open={!!occurrenceRow}
        onOpenChange={(open) => !open && setOccurrenceRow(null)}
        row={occurrenceRow}
        cards={cards}
        defaultUsdRate={settings.defaultUsdRate}
        statusContext={statusContext}
        labels={occurrenceLabels}
        onSave={saveOccurrence}
        onSkip={(row) => skipOccurrence(row)}
        onRefresh={refresh}

        onAddSupplemental={(item) => {
          setOccurrenceRow(null);
          setSupplementalItem(item);
        }}
        onEditItem={(item) => {
          setOccurrenceRow(null);
          openItemModal(item);
        }}
      />

      <FinanceSupplementalEntryModal
        open={!!supplementalItem}
        onOpenChange={(open) => { if (!open) setSupplementalItem(null); }}
        item={supplementalItem}
        cards={cards}
        today={today}
        defaultUsdRate={settings.defaultUsdRate}
        onCreate={finance.createSupplementalOccurrence}
      />

      <PayStatementModal
        open={!!payingGroup}
        onOpenChange={(open) => { if (!open) setPayingGroup(null); }}
        group={payingGroup}
        today={today}
        onConfirm={confirmPayStatement}
      />

      <StatementClosureModal
        open={!!closureGroup}
        onOpenChange={(open) => { if (!open) setClosureGroup(null); }}
        group={closureGroup}
        onConfirm={confirmStatementClosure}
      />

    </div>
  );
}

/**
 * Trava de senha do Financeiro.
 *
 * A senha protege apenas o escopo `full`: envolve TODO o cockpit completo, de
 * forma que nenhum número aparece (nem consulta financeira acontece) antes de
 * `FinanceAccessGate` liberar o acesso — e esse desbloqueio vive apenas em
 * memória, então cada nova entrada pede a senha.
 *
 * Escopo `tools` (Assinaturas e ferramentas) NÃO passa pela senha: abre direto
 * o cockpit de ferramentas, sem consultar `finance_password_status` e sem poder
 * criar/configurar a senha financeira.
 */
export default function Financial() {
  const { canAccessFullFinance, canAccessTools, isLoading } = useFinanceAccessScope();
  const navigate = useNavigate();

  // O gate nunca pode ser montado antes de o escopo estar resolvido.
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

  // `full` prevalece sobre `tools` e exige senha a cada entrada.
  if (canAccessFullFinance) {
    return (
      <FinanceAccessGate>
        <FinanceVisibilityProvider>
          <FinancialCockpit />
        </FinanceVisibilityProvider>
      </FinanceAccessGate>
    );
  }

  return <FinanceToolsCockpit />;
}

