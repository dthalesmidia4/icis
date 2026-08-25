/**
 * REGRESSÃO CRUZADA DA LIQUIDAÇÃO POR FATURA.
 *
 * O bug original nasceu de DUAS semânticas de "pago" (totais x badges/composição).
 * Aqui os cenários são construídos com os builders reais (`buildMonthRows`,
 * `buildStatementGroups`) e a mesma liquidação derivada é exigida em
 * `effectivePaid`, `computeTotals`, `buildMonthComposition` e `resolveRowStatus`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  effectivePaid,
  isStatementRow,
} from "./financeModel";
import {
  buildSafeSettlementIndex,
  buildStatementSettlementIndex,
  settledByStatement,
} from "./financeSettlement";
import { buildMonthComposition, compositionTotal } from "./financeComposition";
import { RowStatusContext, resolveRowStatus } from "./financeRowStatus";

const COMPETENCE = { year: 2026, month: 8 };
const TODAY = "2026-08-25";

function card(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: "card1",
    kind: "card",
    name: "Cartão Nubank",
    bank_name: "Nubank",
    card_last4: "7587",
    cost_center: "administrativo",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...over,
  } as FinanceItem;
}

function cardExpense(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: "tool1",
    kind: "tool",
    name: "Ferramenta A",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    payment_method: "credit_card",
    card_item_id: "card1",
    default_amount_brl: 100,
    charge_day: 10,
    ...over,
  } as FinanceItem;
}

function occ(over: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return {
    competence_month: "2026-08-01",
    currency: "BRL",
    ...over,
  } as FinanceOccurrence;
}

function scenario(params: {
  items: FinanceItem[];
  occurrences: FinanceOccurrence[];
  competence?: { year: number; month: number };
}) {
  const competence = params.competence ?? COMPETENCE;
  const rows = buildMonthRows({ items: params.items, occurrences: params.occurrences, competence });
  const statements = buildStatementGroups({
    items: params.items,
    occurrences: params.occurrences,
    competence,
  });
  const settlement = buildStatementSettlementIndex(statements);
  return { rows, statements, settlement };
}

function rowOf(rows: MonthRow[], itemId: string): MonthRow {
  const row = rows.find((r) => r.item.id === itemId);
  if (!row) throw new Error(`row ${itemId} não construída`);
  return row;
}

/** Cartão sem ciclo cadastrado: fatura agrupa a competência inteira. */
const INCOMPLETE_CARD = card({ statement_closing_day: null, statement_due_day: null });

const PAID_STATEMENT_OCC = occ({
  id: "stmt-occ",
  item_id: "card1",
  amount_brl: 100,
  due_date: "2026-08-15",
  paid_at: "2026-08-15T12:00:00Z",
  paid_amount_brl: 100,
});

const OPEN_STATEMENT_OCC = occ({
  id: "stmt-occ",
  item_id: "card1",
  amount_brl: 100,
  due_date: "2026-08-15",
});

const COMPONENT_OCC = occ({
  id: "comp-occ",
  item_id: "tool1",
  amount_brl: 100,
  charge_date: "2026-08-10",
  due_date: "2026-08-10",
});

function statusContext(
  rows: MonthRow[],
  settlement: ReturnType<typeof buildStatementSettlementIndex> | null,
  statementRows?: MonthRow[],
): RowStatusContext {
  return {
    rows,
    today: TODAY,
    cardsById: new Map([["card1", INCOMPLETE_CARD]]),
    ...(statementRows ? { statementRows } : {}),
    settlement,
  };
}

describe("liquidação derivada da fatura", () => {
  it("A. fatura paga liquida o componente mesmo com paid=false no filho", () => {
    const { rows, statements, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense()],
      occurrences: [PAID_STATEMENT_OCC, COMPONENT_OCC],
    });
    const component = rowOf(rows, "tool1");

    expect(component.paid).toBe(false);
    expect(statements[0].paid).toBe(true);
    expect(statements[0].components.map((c) => c.key)).toContain(component.key);
    expect(settlement.paidComponentKeys.has(component.key)).toBe(true);
    expect(effectivePaid(component, rows, settlement)).toBe(true);
    expect(settledByStatement(component, settlement)).toBe(true);
  });

  it("B. componente liquidado entra em 'paid' e sai de 'open' na composição", () => {
    const { rows, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense()],
      occurrences: [PAID_STATEMENT_OCC, COMPONENT_OCC],
    });
    const key = rowOf(rows, "tool1").key;

    const paid = buildMonthComposition({ rows, status: "paid", settlement });
    const open = buildMonthComposition({ rows, status: "open", settlement });

    expect(paid.map((e) => e.row.key)).toContain(key);
    expect(open.map((e) => e.row.key)).not.toContain(key);
  });

  it("C. resolveRowStatus mostra liquidação pela fatura com tom positivo", () => {
    const { rows, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense()],
      occurrences: [PAID_STATEMENT_OCC, COMPONENT_OCC],
    });
    const component = rowOf(rows, "tool1");

    const status = resolveRowStatus(component, statusContext(rows, settlement));
    expect(status.tone).toBe("positive");
    expect(status.label).toMatch(/Pago pela fatura|Fatura paga/);

    // Com as linhas de fatura no contexto o resultado continua positivo.
    const statementRows = rows.filter(isStatementRow);
    const withStatement = resolveRowStatus(component, statusContext(rows, settlement, statementRows));
    expect(withStatement.tone).toBe("positive");
  });

  it("D. fatura em aberto não liquida nada", () => {
    const { rows, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense()],
      occurrences: [OPEN_STATEMENT_OCC, COMPONENT_OCC],
    });
    const component = rowOf(rows, "tool1");

    expect(settlement.paidComponentKeys.has(component.key)).toBe(false);
    expect(effectivePaid(component, rows, settlement)).toBe(false);
    expect(
      buildMonthComposition({ rows, status: "open", settlement }).map((e) => e.row.key),
    ).toContain(component.key);
    expect(
      buildMonthComposition({ rows, status: "paid", settlement }).map((e) => e.row.key),
    ).not.toContain(component.key);
  });

  it("E. pagamento próprio do filho vale mesmo com fatura em aberto", () => {
    const { rows, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense()],
      occurrences: [
        OPEN_STATEMENT_OCC,
        { ...COMPONENT_OCC, paid_at: "2026-08-11T10:00:00Z", paid_amount_brl: 100 },
      ],
    });
    const component = rowOf(rows, "tool1");

    expect(component.paid).toBe(true);
    expect(effectivePaid(component, rows, settlement)).toBe(true);
    // Não foi a fatura que liquidou: o rótulo de fatura não deve ser usado.
    expect(settledByStatement(component, settlement)).toBe(false);
  });

  it("F. despesa fora do grupo da fatura não herda o pagamento", () => {
    const direct = cardExpense({
      id: "expense-direct",
      name: "Conta de luz",
      kind: "expense",
      payment_method: "pix",
      card_item_id: null,
    });
    const { rows, statements, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense(), direct],
      occurrences: [
        PAID_STATEMENT_OCC,
        COMPONENT_OCC,
        occ({ id: "direct-occ", item_id: "expense-direct", amount_brl: 300, due_date: "2026-08-20" }),
      ],
    });
    const directRow = rowOf(rows, "expense-direct");

    expect(statements[0].components.map((c) => c.key)).not.toContain(directRow.key);
    expect(settlement.paidComponentKeys.has(directRow.key)).toBe(false);
    expect(effectivePaid(directRow, rows, settlement)).toBe(false);
  });

  it("G. cobrança após o fechamento pertence à fatura seguinte e não é liquidada", () => {
    const cycled = card({ statement_closing_day: 20, statement_due_day: 5 });
    const lateCharge = cardExpense({ id: "tool-late", name: "Ferramenta tardia", charge_day: 25 });
    const { rows, statements, settlement } = scenario({
      items: [cycled, lateCharge],
      occurrences: [
        PAID_STATEMENT_OCC,
        occ({
          id: "late-occ",
          item_id: "tool-late",
          amount_brl: 100,
          charge_date: "2026-08-25",
          due_date: "2026-08-25",
        }),
      ],
    });
    const late = rowOf(rows, "tool-late");

    expect(statements[0].paid).toBe(true);
    expect(statements[0].components.map((c) => c.key)).not.toContain(late.key);
    expect(settlement.paidComponentKeys.has(late.key)).toBe(false);
    expect(effectivePaid(late, rows, settlement)).toBe(false);
  });

  it("H. ciclo incompleto: o agrupamento do próprio modelo é liquidado pela fatura paga", () => {
    const { rows, statements, settlement } = scenario({
      items: [INCOMPLETE_CARD, cardExpense(), cardExpense({ id: "tool2", name: "Ferramenta B" })],
      occurrences: [
        PAID_STATEMENT_OCC,
        COMPONENT_OCC,
        occ({ id: "comp2-occ", item_id: "tool2", amount_brl: 50, charge_date: "2026-08-12" }),
      ],
    });

    expect(statements[0].configIncomplete).toBe(true);
    const keys = statements[0].components.map((c) => c.key);
    for (const id of ["tool1", "tool2"]) {
      const row = rowOf(rows, id);
      expect(keys).toContain(row.key);
      expect(settlement.paidComponentKeys.has(row.key)).toBe(true);
      expect(effectivePaid(row, rows, settlement)).toBe(true);
    }
  });

  it("I. computeTotals mantém paid + open === expected e não soma a fatura como despesa", () => {
    const { rows, settlement } = scenario({
      items: [
        INCOMPLETE_CARD,
        cardExpense(),
        cardExpense({ id: "expense-open", name: "Aluguel", kind: "expense", card_item_id: null, payment_method: "pix", default_amount_brl: 400 }),
      ],
      occurrences: [
        PAID_STATEMENT_OCC,
        COMPONENT_OCC,
        occ({ id: "open-occ", item_id: "expense-open", amount_brl: 400, due_date: "2026-08-28" }),
      ],
    });

    const totals = computeTotals(rows, settlement);
    expect(totals.expected).toBe(500); // 100 (cartão) + 400 (direta), fatura fora
    expect(totals.statements).toBe(100);
    expect(totals.paid).toBe(100);
    expect(totals.open).toBe(400);
    expect(Number((totals.paid + totals.open).toFixed(2))).toBe(totals.expected);
  });

  it("J. composição paid/open reconcilia exatamente com computeTotals", () => {
    const { rows, settlement } = scenario({
      items: [
        INCOMPLETE_CARD,
        cardExpense(),
        cardExpense({ id: "expense-open", name: "Aluguel", kind: "expense", card_item_id: null, payment_method: "pix" , default_amount_brl: 400 }),
      ],
      occurrences: [
        PAID_STATEMENT_OCC,
        COMPONENT_OCC,
        occ({ id: "open-occ", item_id: "expense-open", amount_brl: 400, due_date: "2026-08-28" }),
      ],
    });

    const totals = computeTotals(rows, settlement);
    const all = buildMonthComposition({ rows, status: "all", settlement });
    const paid = buildMonthComposition({ rows, status: "paid", settlement });
    const open = buildMonthComposition({ rows, status: "open", settlement });

    expect(compositionTotal(all)).toBe(totals.expected);
    expect(compositionTotal(paid)).toBe(totals.paid);
    expect(compositionTotal(open)).toBe(totals.open);
    expect(paid.length + open.length).toBe(all.length);
  });

  it("K. construir o índice é puro: não muta paid, paid_at nem statement_occurrence_id", () => {
    const componentOcc = { ...COMPONENT_OCC };
    const { rows, statements } = scenario({
      items: [INCOMPLETE_CARD, cardExpense()],
      occurrences: [PAID_STATEMENT_OCC, componentOcc],
    });
    const component = rowOf(rows, "tool1");
    const snapshot = JSON.stringify(component);

    buildStatementSettlementIndex(statements);

    expect(JSON.stringify(component)).toBe(snapshot);
    expect(component.paid).toBe(false);
    expect(componentOcc.paid_at ?? null).toBeNull();
    expect(componentOcc.statement_occurrence_id ?? null).toBeNull();
  });

  it("L. buildSafeSettlementIndex liquida só as linhas do cartão pago", () => {
    const otherCard = card({ id: "card2", name: "Cartão Inter", card_last4: "0001" });
    const { rows } = scenario({
      items: [
        INCOMPLETE_CARD,
        otherCard,
        cardExpense(),
        cardExpense({ id: "tool2", name: "Ferramenta B", card_item_id: "card2" }),
      ],
      occurrences: [
        COMPONENT_OCC,
        occ({ id: "comp2-occ", item_id: "tool2", amount_brl: 70, charge_date: "2026-08-12" }),
      ],
    });

    const safe = buildSafeSettlementIndex({ rows, isPaidCard: (id) => id === "card1" });

    expect(safe.paidComponentKeys.has(rowOf(rows, "tool1").key)).toBe(true);
    expect(safe.paidComponentKeys.has(rowOf(rows, "tool2").key)).toBe(false);
    // A própria linha da fatura nunca é marcada como componente liquidado.
    for (const statementRow of rows.filter(isStatementRow)) {
      expect(safe.paidComponentKeys.has(statementRow.key)).toBe(false);
    }

    const none = buildSafeSettlementIndex({ rows, isPaidCard: () => false });
    expect(none.paidComponentKeys.size).toBe(0);
  });
});

describe("cockpits usam a liquidação derivada", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  it("useFinance calcula totais com o índice de liquidação", () => {
    const src = read("src/hooks/useFinance.tsx");
    expect(src).toMatch(/buildStatementSettlementIndex\(statements\)/);
    expect(src).toMatch(/computeTotals\(rows, settlement\)/);
  });

  it("Financeiro completo passa settlement para status, composição e filtros", () => {
    const src = read("src/pages/Financial.tsx");
    expect(src).toMatch(/buildMonthComposition\(\{ rows, status: compositionStatus, settlement \}\)/);
    expect(src).toMatch(/settlement,/);
    expect(src).toMatch(/applyQuickFilter\([\s\S]{0,160}settlement,/);
  });

  it("escopo Assinaturas/Ferramentas deriva liquidação segura do cartão", () => {
    const src = read("src/components/finance/FinanceToolsCockpit.tsx");
    expect(src).toMatch(/buildSafeSettlementIndex/);
    expect(src).toMatch(/settlement,/);
  });
});
