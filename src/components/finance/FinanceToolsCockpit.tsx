/**
 * Financeiro no escopo `tools`: SOMENTE `Assinaturas e ferramentas`.
 *
 * Nada de resumo do mês, orçamento, faturas ou despesas administrativas — nem
 * na tela, nem em consulta. Os cartões vêm da RPC segura (rótulo e ciclo).
 */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { FINANCE_SHELL, FINANCE_SHELL_WIDTH } from "@/lib/financeShell";
import SubscriptionsPanel from "@/components/finance/SubscriptionsPanel";
import FinancePeriodBar from "@/components/finance/FinancePeriodBar";
import FinanceItemFormModal from "@/components/finance/FinanceItemFormModal";
import FinanceOccurrenceModal from "@/components/finance/FinanceOccurrenceModal";
import { useFinanceTools } from "@/hooks/useFinanceTools";
import { currentCompetence, todayISO } from "@/hooks/useFinance";
import { clampToTrackingStart } from "@/lib/financeTrackingPeriod";
import { FinanceItem, MonthRow } from "@/lib/financeModel";
import { buildSafeSettlementIndex } from "@/lib/financeSettlement";
import { RowStatusContext } from "@/lib/financeRowStatus";
import { competenceMonthISO, findSafeStatementStatus } from "@/lib/financeSafeStatement";


import { FinanceLoadErrorState } from "@/components/finance/FinanceLoadErrorState";

export default function FinanceToolsCockpit() {
  const [competence, setCompetence] = useState(clampToTrackingStart(currentCompetence()));
  const today = todayISO();
  const {
    items, rows, cards, packages, overlaps, loadError, refresh, statementStatuses,
    saveOccurrence, togglePaid, saveItem, setItemActive,
  } = useFinanceTools(competence);

  const [search, setSearch] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FinanceItem | null>(null);
  const [occurrenceRow, setOccurrenceRow] = useState<MonthRow | null>(null);

  /**
   * Cartões “seguros” em forma de cadastro apenas para RÓTULO e CICLO.
   * Nunca carrega limite nem valor de fatura.
   */
  const safeCardItems = useMemo(
    () =>
      cards.map(
        (c) =>
          ({
            id: c.id,
            kind: "card",
            name: c.bank_name ?? "Cartão",
            bank_name: c.bank_name ?? null,
            card_last4: c.card_last4 ?? null,
            statement_closing_day: c.statement_closing_day ?? null,
            statement_due_day: c.statement_due_day ?? null,
            active: true,
          }) as unknown as FinanceItem,
      ),
    [cards],
  );

  const cardsById = useMemo(
    () => new Map(safeCardItems.map((c) => [c.id, c])),
    [safeCardItems],
  );
  /**
   * O status da fatura vem da RPC segura (existência, vencimento e pagamento).
   * Nenhum valor, limite ou orçamento entra neste escopo.
   */
  const competenceMonth = competenceMonthISO(competence);
  /**
   * Liquidação por fatura no escopo `tools`: se a fatura real do cartão daquela
   * competência está paga, os lançamentos exibidos naquele grupo constam pagos.
   * Nada é persistido e nenhum valor da fatura é lido.
   */
  const settlement = useMemo(
    () =>
      buildSafeSettlementIndex({
        rows,
        competence,
        cardsById,
        isPaidCard: (cardId) =>
          !!findSafeStatementStatus(statementStatuses, cardId, competenceMonth)?.paid,
      }),
    [rows, statementStatuses, competenceMonth, competence, cardsById],
  );

  const statusContext = useMemo<RowStatusContext>(
    () => ({
      rows,
      today,
      cardsById,
      settlement,
      safeStatementStatuses: statementStatuses,
      competenceMonth,
    }),
    [rows, today, cardsById, settlement, statementStatuses, competenceMonth],
  );


  const openItemModal = (item: FinanceItem | null) => {
    setEditingItem(item);
    setItemModalOpen(true);
  };

  if (loadError) {
    return (
      <div className="pb-16 pt-4">
        <FinanceLoadErrorState message={loadError} onRetry={refresh} />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        containerClassName={FINANCE_SHELL_WIDTH}
        title="Assinaturas e ferramentas"
        subtitle="Serviços recorrentes, ferramentas e pacotes."
        backTo="/"
        actions={[
          {
            label: "Nova assinatura ou ferramenta",
            onClick: () => openItemModal(null),
            icon: <Plus className="w-4 h-4" />,
          },
        ]}
      />

      <div className={`${FINANCE_SHELL} py-5 space-y-4`}>
        {/* Mesmo eixo de período do Financeiro completo. */}
        <FinancePeriodBar competence={competence} onChange={setCompetence} today={today} />

        <SubscriptionsPanel
          items={items}
          cards={cards}
          rows={rows}
          statusContext={statusContext}
          overlaps={overlaps}
          competence={competence}
          search={search}
          onSearchChange={setSearch}
          onEdit={openItemModal}
          onToggleActive={setItemActive}
          onOpenRow={setOccurrenceRow}
          onTogglePaid={togglePaid}
        />
      </div>

      <FinanceItemFormModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        item={editingItem}
        initialKind={editingItem ? null : "tool"}
        cards={safeCardItems}
        packages={packages}
        allItems={items}
        defaultUsdRate={null}
        scope="tools"
        competence={competence}
        onSave={saveItem}

      />

      <FinanceOccurrenceModal
        open={!!occurrenceRow}
        onOpenChange={(open) => !open && setOccurrenceRow(null)}
        row={occurrenceRow}
        cards={safeCardItems}
        defaultUsdRate={null}
        statusContext={statusContext}
        onSave={saveOccurrence}
        onEditItem={(item) => {
          setOccurrenceRow(null);
          openItemModal(item);
        }}
      />
    </div>
  );
}
