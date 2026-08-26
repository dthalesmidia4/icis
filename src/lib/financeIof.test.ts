import { describe, expect, it } from "vitest";
import {
  buildMonthRows,
  computeTotals,
  type FinanceItem,
  type FinanceOccurrence,
  type MonthRow,
  type StatementGroup,
} from "./financeModel";
import { buildMonthComposition, compositionTotal } from "./financeComposition";
import {
  buildStatementConference,
  iofRowsForStatements,
  isIofRow,
  parseIofInput,
  statementIofBrl,
  sumRowsBrl,
} from "./financeIof";

function card(): FinanceItem {
  return {
    id: "card-1",
    kind: "card",
    name: "Itaú",
    bank_name: "Itaú",
    card_last4: "7587",
    cost_center: "administrativo",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    statement_closing_day: 10,
    statement_due_day: 17,
  } as FinanceItem;
}

function group(over: Partial<StatementGroup> = {}): StatementGroup {
  const c = card();
  const statementRow = {
    key: "statement:card-1",
    item: c,
    occurrence: {
      id: "occ-statement",
      item_id: c.id,
      competence_month: "2026-08-01",
      currency: "BRL",
      paid_at: "2026-08-20T12:00:00Z",
      amount_brl: 1000,
      paid_amount_brl: 1032.4,
      iof_amount_brl: 32.4,
    },
    projected: false,
    amountBrl: 1000,
    amountOriginal: 1000,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: null,
    dueDate: "2026-08-17",
    paid: true,
    paidAmountBrl: 1032.4,
    cardItemId: null,
    paymentMethod: null,
    paymentOverridden: false,
    estimated: false,
    installmentNumber: null,
    installmentCount: null,
  } as unknown as MonthRow;

  return {
    card: c,
    statementRow,
    components: [],
    projectedTotal: 1000,
    actualTotal: 1000,
    difference: 0,
    configIncomplete: false,
    incompleteReason: null,
    dueDate: "2026-08-17",
    closingDate: "2026-08-10",
    paid: true,
    ...over,
  };
}

describe("entrada do IOF", () => {
  it("vazio vale zero", () => {
    expect(parseIofInput("")).toEqual({ state: "ok", value: 0 });
  });
  it("aceita vírgula", () => {
    expect(parseIofInput("32,40")).toEqual({ state: "ok", value: 32.4 });
  });
  it("recusa negativo e texto", () => {
    expect(parseIofInput("-1").state).toBe("invalid");
    expect(parseIofInput("abc").state).toBe("invalid");
  });
});

describe("conferência da fatura", () => {
  it("IOF deixa de ser diferença inexplicada", () => {
    const conf = buildStatementConference({
      statementBrl: 1000,
      componentsBrl: 341.15,
      iofBrl: 32.4,
      paidBrl: 1032.4,
    });
    expect(conf.expectedBrl).toBe(1032.4);
    expect(conf.remainingBrl).toBe(0);
    expect(conf.iofBrl).toBe(32.4);
  });

  it("sobra apenas o que não é IOF", () => {
    const conf = buildStatementConference({
      statementBrl: 1000,
      componentsBrl: 1000,
      iofBrl: 32.4,
      paidBrl: 1040,
    });
    expect(conf.remainingBrl).toBe(7.6);
  });
});

describe("linha de repasse de IOF em Contas e despesas", () => {
  it("fatura paga com IOF gera linha própria já paga", () => {
    const rows = iofRowsForStatements([group()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].item.name).toBe("Repasse de IOF — Itaú ••••7587");
    expect(rows[0].paid).toBe(true);
    expect(rows[0].amountBrl).toBe(32.4);
    expect(rows[0].cardItemId).toBeNull();
    expect(isIofRow(rows[0])).toBe(true);
    expect(sumRowsBrl(rows)).toBe(32.4);
  });

  it("fatura sem IOF ou não paga não gera linha", () => {
    expect(iofRowsForStatements([group({ paid: false })])).toHaveLength(0);
    const noIof = group();
    (noIof.statementRow!.occurrence as any).iof_amount_brl = null;
    expect(statementIofBrl(noIof)).toBe(0);
    expect(iofRowsForStatements([noIof])).toHaveLength(0);
  });
});

describe("reconciliação do IOF com KPIs e Composição do mês", () => {
  const competence = { year: 2026, month: 8 };

  function scenario(iof: number | null) {
    const items = [
      {
        id: "card-1",
        kind: "card",
        name: "Itaú",
        card_last4: "7587",
        cost_center: "administrativo",
        active: true,
        currency: "BRL",
        recurrence_type: "monthly",
        statement_closing_day: 5,
        statement_due_day: 15,
      },
      {
        id: "tool-1",
        kind: "tool",
        name: "Figma",
        cost_center: "administrativo",
        active: true,
        currency: "BRL",
        recurrence_type: "monthly",
        card_item_id: "card-1",
        charge_day: 3,
      },
    ] as unknown as FinanceItem[];
    const occurrences = [
      {
        id: "st-1",
        item_id: "card-1",
        competence_month: "2026-08-01",
        currency: "BRL",
        amount_brl: 300,
        due_date: "2026-08-15",
        paid_at: "2026-08-15T12:00:00Z",
        paid_amount_brl: 300 + (iof ?? 0),
        iof_amount_brl: iof,
      },
      {
        id: "o-tool",
        item_id: "tool-1",
        competence_month: "2026-08-01",
        currency: "BRL",
        amount_brl: 300,
        charge_date: "2026-08-03",
        statement_occurrence_id: "st-1",
      },
    ] as unknown as FinanceOccurrence[];
    const rows = buildMonthRows({ items, occurrences, competence });
    return { rows, totals: computeTotals(rows) };
  }

  it("IOF entra uma única vez em expected e paid, nunca em open", () => {
    const base = scenario(null);
    const withIof = scenario(32.4);
    expect(base.totals.expected).toBe(300);
    expect(withIof.totals.expected).toBe(332.4);
    expect(withIof.totals.paid).toBe(332.4);
    expect(withIof.totals.open).toBe(0);
    expect(withIof.totals.expected).toBe(withIof.totals.paid + withIof.totals.open);
    // a fatura em si continua fora das despesas
    expect(withIof.totals.statements).toBe(300);
  });

  it("composição all/paid inclui o IOF e reconcilia com os KPIs; open não inclui", () => {
    const { rows, totals } = scenario(32.4);
    const all = buildMonthComposition({ rows, status: "all" });
    const paid = buildMonthComposition({ rows, status: "paid" });
    const open = buildMonthComposition({ rows, status: "open" });
    const iofName = "Repasse de IOF — Itaú ••••7587";

    expect(all.map((e) => e.row.item.name)).toContain(iofName);
    expect(paid.map((e) => e.row.item.name)).toContain(iofName);
    expect(open.map((e) => e.row.item.name)).not.toContain(iofName);
    // fatura nunca aparece como despesa
    expect(all.map((e) => e.row.item.name)).not.toContain("Itaú");

    expect(compositionTotal(all)).toBe(totals.expected);
    expect(compositionTotal(paid)).toBe(totals.paid);
    expect(compositionTotal(open)).toBe(totals.open);
    expect(all.filter((e) => e.row.item.name === iofName)).toHaveLength(1);
    expect(all.find((e) => e.row.item.name === iofName)!.row.item.category).toBe("Tributos e taxas");
  });
});
