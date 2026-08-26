import { describe, expect, it } from "vitest";
import type { FinanceItem, MonthRow, StatementGroup } from "./financeModel";
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
