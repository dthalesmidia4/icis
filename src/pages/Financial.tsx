/**
 * Central Financeira — tela única.
 *
 * Mês competência + filtros rápidos + movimentação real + faturas de cartão +
 * cadastro permanente. Nada de meses pré-criados: o futuro é projeção.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Paperclip,
  Power,
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { LoadingScreen } from "@/components/LoadingScreen";
import FinanceItemFormModal from "@/components/finance/FinanceItemFormModal";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import StatementPanel from "@/components/finance/StatementPanel";
import { useFinance, currentCompetence, todayISO } from "@/hooks/useFinance";
import { useFinanceAccess } from "@/hooks/useFinanceAccess";
import { addMonths } from "@/lib/financeCardCycle";
import {
  COST_CENTER_LABELS,
  FinanceItem,
  KIND_LABELS,
  MonthRow,
  QUICK_FILTERS,
  QuickFilter,
  RECURRENCE_LABELS,
  StatementGroup,
  applyQuickFilter,
  effectivePaid,
  filterByCostCenter,
  filterByKind,
  formatBRL,
  formatCurrencyValue,
  formatDateBR,
  isStatementRow,
} from "@/lib/financeModel";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
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

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [costCenter, setCostCenter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FinanceItem | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<MonthRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [rateInput, setRateInput] = useState("");

  const visibleRows = useMemo(() => {
    let result = rows.filter((row) => !isStatementRow(row));
    result = applyQuickFilter(result, quickFilter, today);
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
  }, [rows, quickFilter, costCenter, kindFilter, search, today]);

  const budgetUsage = useMemo(() => {
    if (!settings.monthlyBudgetBrl) return null;
    return Math.min(100, Math.round((totals.expected / settings.monthlyBudgetBrl) * 100));
  }, [settings.monthlyBudgetBrl, totals.expected]);

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

  return (
    <div className="pb-12">
      <PageHeader
        title="Financeiro"
        subtitle="Central única de contas, ferramentas e faturas"
        backTo="/"
        actions={[
          {
            label: "Novo cadastro",
            onClick: () => {
              setEditingItem(null);
              setItemModalOpen(true);
            },
            icon: <Plus className="w-4 h-4" />,
          },
          {
            label: "Configurações",
            onClick: openSettings,
            icon: <Settings2 className="w-4 h-4" />,
            variant: "outline",
          },
        ]}
      />

      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Competência */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCompetence(addMonths(competence, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-[180px]">
              <p className="text-lg font-bold">
                {MONTH_LABELS[competence.month - 1]} {competence.year}
              </p>
              <p className="text-xs text-muted-foreground">Competência</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => setCompetence(addMonths(competence, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCompetence(currentCompetence())}>
            Mês atual
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Previsto</p>
            <p className="text-xl font-bold">{formatBRL(totals.expected)}</p>
            <p className="text-xs text-muted-foreground">sem faturas de cartão</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pago</p>
            <p className="text-xl font-bold text-primary">{formatBRL(totals.paid)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Em aberto</p>
            <p className="text-xl font-bold">{formatBRL(totals.open)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ferramentas e IA</p>
            <p className="text-xl font-bold">{formatBRL(totals.toolsAndAi)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Faturas do mês</p>
            <p className="text-xl font-bold">{formatBRL(totals.statements)}</p>
            <p className="text-xs text-muted-foreground">saída de caixa</p>
          </Card>
        </div>

        {settings.monthlyBudgetBrl != null && (
          <Card className="p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">
                Orçamento mensal · {formatBRL(settings.monthlyBudgetBrl)}
              </span>
              <span className={totals.expected > settings.monthlyBudgetBrl ? "text-destructive font-semibold" : "text-muted-foreground"}>
                {formatBRL(totals.expected)} previstos
                {totals.expected > settings.monthlyBudgetBrl && " · acima do orçamento"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${totals.expected > settings.monthlyBudgetBrl ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${budgetUsage ?? 0}%` }}
              />
            </div>
          </Card>
        )}

        <Tabs defaultValue="movimentacao">
          <TabsList>
            <TabsTrigger value="movimentacao">Movimentação</TabsTrigger>
            <TabsTrigger value="faturas">Faturas ({statements.length})</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros ({items.length})</TabsTrigger>
          </TabsList>

          {/* ------------------------- MOVIMENTAÇÃO ------------------------- */}
          <TabsContent value="movimentacao" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={quickFilter === filter.value ? "default" : "outline"}
                  onClick={() => setQuickFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Buscar por nome, finalidade ou categoria..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={costCenter} onValueChange={setCostCenter}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os centros de custo</SelectItem>
                  {Object.entries(COST_CENTER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="expense">{KIND_LABELS.expense}</SelectItem>
                  <SelectItem value="tool">{KIND_LABELS.tool}</SelectItem>
                  <SelectItem value="package">{KIND_LABELS.package}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="overflow-hidden">
              {loading ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : visibleRows.length === 0 ? (
                <p className="text-center py-16 text-muted-foreground">
                  Nenhum lançamento para este filtro neste mês.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="text-xs uppercase tracking-wider font-bold">Item</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider font-bold">Vencimento</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider font-bold">Centro</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider font-bold">Pagamento</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Valor</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider font-bold">Situação</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const paid = effectivePaid(row, rows);
                        const ref = row.dueDate ?? row.chargeDate;
                        const overdue = !paid && !!ref && ref < today;
                        return (
                          <TableRow
                            key={row.key}
                            className="cursor-pointer"
                            onClick={() => setOccurrenceRow(row)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{row.item.name}</span>
                                {overlaps.has(row.item.id) && (
                                  <Badge variant="outline" className="text-destructive border-destructive/40">
                                    Duplicidade
                                  </Badge>
                                )}
                                {row.occurrence?.attachment_url && <Paperclip className="w-3 h-3 text-muted-foreground" />}
                              </div>
                              {row.item.purpose && (
                                <p className="text-xs text-muted-foreground">{row.item.purpose}</p>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{formatDateBR(ref)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {COST_CENTER_LABELS[row.item.cost_center] ?? row.item.cost_center}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {row.cardItemId
                                ? cards.find((c) => c.id === row.cardItemId)?.name ?? "Cartão"
                                : row.item.payment_method ?? "—"}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className="font-semibold">{formatBRL(row.amountBrl)}</span>
                              {row.currency === "USD" && (
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrencyValue(row.amountOriginal, "USD")}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {paid ? (
                                <Badge className="bg-primary/10 text-primary border-primary/30">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Pago
                                </Badge>
                              ) : overdue ? (
                                <Badge variant="destructive">
                                  <AlertTriangle className="w-3 h-3 mr-1" /> Atrasada
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {row.projected ? "Previsto" : "Em aberto"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {!row.cardItemId && (
                                <Button
                                  size="sm"
                                  variant={paid ? "outline" : "default"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePaid(row, !paid);
                                  }}
                                >
                                  {paid ? "Desfazer" : "Pagar"}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ---------------------------- FATURAS ---------------------------- */}
          <TabsContent value="faturas" className="mt-4">
            {statements.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                Nenhum cartão cadastrado. Crie um cadastro do tipo “Cartão” para acompanhar faturas.
              </Card>
            ) : (
              <StatementPanel
                groups={statements}
                onOpenRow={setOccurrenceRow}
                onOpenStatement={handleOpenStatement}
                onPayStatement={handlePayStatement}
              />
            )}
          </TabsContent>

          {/* --------------------------- CADASTROS -------------------------- */}
          <TabsContent value="cadastros" className="mt-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wider font-bold">Nome</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-bold">Tipo</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-bold">Recorrência</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-bold">Centro</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-bold text-right">Referência</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-bold">Situação</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className={item.active ? "" : "opacity-60"}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.name}</span>
                            {overlaps.has(item.id) && (
                              <Badge variant="outline" className="text-destructive border-destructive/40">
                                Já incluída em {overlaps.get(item.id)!.join(", ")}
                              </Badge>
                            )}
                          </div>
                          {item.purpose && <p className="text-xs text-muted-foreground">{item.purpose}</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{KIND_LABELS[item.kind] ?? item.kind}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {RECURRENCE_LABELS[item.recurrence_type] ?? item.recurrence_type}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {COST_CENTER_LABELS[item.cost_center] ?? item.cost_center}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {item.kind === "included_resource" ? (
                            <span className="text-xs text-muted-foreground">incluso no pacote</span>
                          ) : (
                            <>
                              <span>{formatBRL(item.default_amount_brl)}</span>
                              {item.currency === "USD" && (
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrencyValue(item.default_amount_original, "USD")}
                                </p>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.active ? "outline" : "secondary"}>
                            {item.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingItem(item);
                              setItemModalOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setItemActive(item.id, !item.active)}>
                            <Power className={`w-4 h-4 ${item.active ? "text-destructive" : "text-primary"}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
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
            <DialogTitle>Configurações do Financeiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Orçamento mensal (R$)</Label>
              <Input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <Label>Câmbio padrão (R$ por US$)</Label>
              <Input value={rateInput} onChange={(e) => setRateInput(e.target.value)} inputMode="decimal" />
              <p className="text-xs text-muted-foreground mt-1">
                Usado apenas quando o mês não tem câmbio próprio informado.
              </p>
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
