/**
 * Central Financeira — história vertical:
 * 1. Como está o mês?  2. O que precisa de atenção?  3. Quero ver detalhes.
 *
 * Progressive disclosure: a primeira leitura é simples; filtros e detalhes
 * aparecem só quando pedidos. Nada de "modo simples/avançado".
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Settings2, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import FinanceItemFormModal from "@/components/finance/FinanceItemFormModal";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import StatementPanel from "@/components/finance/StatementPanel";
import AttentionPanel from "@/components/finance/AttentionPanel";
import MonthAccountsList from "@/components/finance/MonthAccountsList";
import RegistrationsPanel from "@/components/finance/RegistrationsPanel";
import { useFinance, currentCompetence, todayISO } from "@/hooks/useFinance";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { addMonths } from "@/lib/financeCardCycle";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  KIND_LABELS,
  MonthRow,
  StatementGroup,
  applyQuickFilter,
  filterByCostCenter,
  filterByKind,
  formatBRL,
  isStatementRow,
} from "@/lib/financeModel";
import {
  AttentionInsight,
  RowStatusContext,
  buildAttentionInsights,
  monthFullLabel,
  resolveRowStatus,
} from "@/lib/financeRowStatus";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Visão inicial simples de "Contas do mês". */
type MainView = "to_pay" | "paid" | "all";

const MAIN_VIEWS: { value: MainView; label: string }[] = [
  { value: "to_pay", label: "A pagar" },
  { value: "paid", label: "Pagas" },
  { value: "all", label: "Todas" },
];

/** Filtros avançados, escondidos até serem pedidos. */
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
  const [competence, setCompetence] = useState(currentCompetence());
  const today = todayISO();

  const finance = useFinance(competence);
  const {
    loading, rows, statements, totals, overlaps, items, cards, packages, settings,
    saveOccurrence, togglePaid, payStatement, saveSettings, saveItem, setItemActive,
  } = finance;

  const [tab, setTab] = useState("contas");
  const [mainView, setMainView] = useState<MainView>("to_pay");
  const [advanced, setAdvanced] = useState<AdvancedFilter>("none");
  const [costCenter, setCostCenter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FinanceItem | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<MonthRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [rateInput, setRateInput] = useState("");
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [highlightIncomplete, setHighlightIncomplete] = useState(false);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const statusContext = useMemo<RowStatusContext>(
    () => ({ rows, today, cardsById }),
    [rows, today, cardsById],
  );

  const operationalRows = useMemo(() => rows.filter((row) => !isStatementRow(row)), [rows]);

  const insights = useMemo(
    () => buildAttentionInsights({ rows, statements, today, cardsById }),
    [rows, statements, today, cardsById],
  );

  const advancedActiveCount = useMemo(
    () =>
      (advanced !== "none" ? 1 : 0) + (costCenter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0),
    [advanced, costCenter, kindFilter],
  );

  const visibleRows = useMemo(() => {
    let result = operationalRows;

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
    result = filterByKind(result, kindFilter);

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
  }, [operationalRows, mainView, advanced, costCenter, kindFilter, search, today, statusContext]);

  const pendingCount = useMemo(
    () => operationalRows.filter((row) => resolveRowStatus(row, statusContext).kind !== "paid").length,
    [operationalRows, statusContext],
  );

  const budgetUsage = useMemo(() => {
    if (!settings.monthlyBudgetBrl) return null;
    return Math.min(100, Math.round((totals.expected / settings.monthlyBudgetBrl) * 100));
  }, [settings.monthlyBudgetBrl, totals.expected]);

  const monthLabel = monthFullLabel(competence);

  const openSettings = () => {
    setBudgetInput(settings.monthlyBudgetBrl != null ? String(settings.monthlyBudgetBrl) : "");
    setRateInput(settings.defaultUsdRate != null ? String(settings.defaultUsdRate) : "");
    setSettingsOpen(true);
  };

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
      setTab("contas");
      setMainView("to_pay");
      setAdvanced("overdue");
      setCostCenter("all");
      setKindFilter("all");
      return;
    }
    if (action.type === "open_cards") {
      setTab("cartoes");
      setHighlightIncomplete(true);
      setFocusCardId(null);
      return;
    }
    setTab("cartoes");
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

  const overBudget =
    settings.monthlyBudgetBrl != null ? totals.expected - settings.monthlyBudgetBrl : null;

  return (
    <div className="pb-16">
      <PageHeader
        title="Financeiro"
        subtitle="Veja o que foi pago, o que ainda vence e como estão os gastos do mês."
        backTo="/"
        actions={[
          {
            label: "Adicionar",
            onClick: () => {
              setEditingItem(null);
              setItemModalOpen(true);
            },
            icon: <Plus className="w-4 h-4" />,
          },
          {
            label: "Ajustes do financeiro",
            onClick: openSettings,
            icon: <Settings2 className="w-4 h-4" />,
            variant: "ghost",
          },
        ]}
      />

      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-10">
        {/* ============================ 1. O MÊS ============================ */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                aria-label="Mês anterior"
                onClick={() => setCompetence(addMonths(competence, -1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-center min-w-[170px]">
                <p className="text-lg font-bold">
                  {MONTH_LABELS[competence.month - 1]} {competence.year}
                </p>
                <p className="text-sm text-muted-foreground">Resumo deste mês</p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                aria-label="Mês seguinte"
                onClick={() => setCompetence(addMonths(competence, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="min-h-10" onClick={() => setCompetence(currentCompetence())}>
              Mês atual
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">A pagar</p>
              <p className="text-2xl font-bold">{formatBRL(totals.open)}</p>
              <p className="text-sm text-muted-foreground">
                {pendingCount === 1 ? "1 conta pendente" : `${pendingCount} contas pendentes`}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Já pago</p>
              <p className="text-2xl font-bold text-primary">{formatBRL(totals.paid)}</p>
              <p className="text-sm text-muted-foreground">até agora em {monthLabel}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Total do mês</p>
              <p className="text-2xl font-bold">{formatBRL(totals.expected)}</p>
              <p className="text-sm text-muted-foreground">
                {settings.monthlyBudgetBrl != null && overBudget != null
                  ? overBudget > 0
                    ? `${formatBRL(overBudget)} acima do planejado`
                    : `${formatBRL(Math.abs(overBudget))} abaixo do planejado`
                  : "todas as despesas previstas"}
              </p>
            </Card>
          </div>

          {settings.monthlyBudgetBrl != null && (
            <Card className="p-5 space-y-2">
              <p className="text-sm text-foreground">
                Orçamento de {monthLabel}: <strong>{formatBRL(settings.monthlyBudgetBrl)}</strong>
              </p>
              <p className="text-sm text-foreground">
                Gasto previsto: <strong>{formatBRL(totals.expected)}</strong>
              </p>
              <p className={`text-sm font-semibold ${overBudget! > 0 ? "text-destructive" : "text-primary"}`}>
                {overBudget! > 0
                  ? `${formatBRL(overBudget!)} acima do planejado`
                  : `${formatBRL(Math.abs(overBudget!))} abaixo do planejado`}
              </p>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${overBudget! > 0 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${budgetUsage ?? 0}%` }}
                />
              </div>
            </Card>
          )}
        </section>

        {/* ========================= 2. ATENÇÃO ========================= */}
        <AttentionPanel insights={insights} onAction={handleInsightAction} />

        {/* ========================= 3. DETALHES ======================== */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="contas">Contas do mês</TabsTrigger>
            <TabsTrigger value="cartoes">Cartões</TabsTrigger>
            <TabsTrigger value="cadastros">Contas fixas e assinaturas</TabsTrigger>
          </TabsList>

          {/* --------------------- CONTAS DO MÊS --------------------- */}
          <TabsContent value="contas" className="space-y-4 mt-5">
            <div className="flex flex-wrap items-center gap-2">
              {MAIN_VIEWS.map((view) => (
                <Button
                  key={view.value}
                  size="sm"
                  className="min-h-10"
                  variant={mainView === view.value ? "default" : "outline"}
                  onClick={() => setMainView(view.value)}
                >
                  {view.label}
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
                  <div>
                    <Label className="text-sm">Tipo</Label>
                    <Select value={kindFilter} onValueChange={setKindFilter}>
                      <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="expense">{KIND_LABELS.expense}</SelectItem>
                        <SelectItem value="tool">{KIND_LABELS.tool}</SelectItem>
                        <SelectItem value="package">{KIND_LABELS.package}</SelectItem>
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
                      setKindFilter("all");
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
              onEditItem={(item) => {
                setEditingItem(item);
                setItemModalOpen(true);
              }}
            />
          </TabsContent>

          {/* ------------------------- CARTÕES ------------------------- */}
          <TabsContent value="cartoes" className="mt-5">
            {statements.length === 0 ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                Nenhum cartão cadastrado. Use “+ Adicionar” e escolha “Cartão de crédito” para
                acompanhar suas faturas.
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
              />
            )}
          </TabsContent>

          {/* --------------- CONTAS FIXAS E ASSINATURAS --------------- */}
          <TabsContent value="cadastros" className="mt-5">
            <RegistrationsPanel
              items={items}
              cards={cards}
              overlaps={overlaps}
              competence={competence}
              toolsAndAiTotal={totals.toolsAndAi}
              onEdit={(item) => {
                setEditingItem(item);
                setItemModalOpen(true);
              }}
              onToggleActive={setItemActive}
            />
          </TabsContent>
        </Tabs>
      </div>

      <FinanceItemFormModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        item={editingItem}
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustes do financeiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Orçamento mensal (R$)</Label>
              <Input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} inputMode="decimal" className="h-10" />
            </div>
            <div>
              <Label>Câmbio de referência (R$ por US$)</Label>
              <Input value={rateInput} onChange={(e) => setRateInput(e.target.value)} inputMode="decimal" className="h-10" />
              <p className="text-sm text-muted-foreground mt-1">
                Usado apenas quando o mês não tem câmbio próprio informado.
              </p>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Cartões que precisam de configuração</p>
              {statements.filter((g) => g.configIncomplete).length === 0 ? (
                <p className="text-sm text-muted-foreground">Todos os cartões estão configurados.</p>
              ) : (
                statements
                  .filter((g) => g.configIncomplete)
                  .map((g) => (
                    <div key={g.card.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate">{g.card.name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-10"
                        onClick={() => {
                          setSettingsOpen(false);
                          setEditingItem(g.card);
                          setItemModalOpen(true);
                        }}
                      >
                        Completar
                      </Button>
                    </div>
                  ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                const budget = Number(budgetInput.replace(/\./g, "").replace(",", "."));
                const rate = Number(rateInput.replace(/\./g, "").replace(",", "."));
                const ok = await saveSettings({
                  monthlyBudgetBrl: Number.isFinite(budget) ? budget : null,
                  defaultUsdRate: Number.isFinite(rate) ? rate : null,
                });
                if (ok) setSettingsOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
