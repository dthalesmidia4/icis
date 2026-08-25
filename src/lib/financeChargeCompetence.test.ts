/**
 * REGRESSÃO REAL — AVISA-API (Itaú 7587, fech. 14 / venc. 25).
 *
 * `competence_month` é a competência CONTÁBIL do fato; `charge_date` é a DATA
 * REAL da cobrança no cartão. Uma cobrança de 20/JUL, com fechamento dia 14,
 * fecha em 14/AGO e vence em 25/AGO: pertence à FATURA DE AGOSTO — mesmo que a
 * ocorrência esteja arquivada na competência de agosto.
 */
import { describe, it, expect } from "vitest";
import {
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  effectivePaid,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";
import { buildStatementSettlementIndex, buildSafeSettlementIndex } from "./financeSettlement";
import { resolveRowStatus, resolveStatementCompetenceForRow } from "./financeRowStatus";

const AUG = { year: 2026, month: 8 };

function item(p: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "tool",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...p,
  } as FinanceItem;
}
function occ(p: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return { competence_month: "2026-08-01", currency: "BRL", ...p } as FinanceOccurrence;
}

const card = item({
  id: "card-itau",
  name: "Itaú ••••7587",
  kind: "card",
  cost_center: "compartilhado",
  statement_closing_day: 14,
  statement_due_day: 25,
});
const avisa = item({
  id: "avisa",
  name: "AVISA-API",
  default_amount_brl: 69,
  charge_day: 20,
  card_item_id: "card-itau",
});

/** Ocorrência REAL: competência agosto, cobrança 20/JUL, sem paid_at nem vínculo. */
const avisaReal = occ({ id: "occ-avisa", item_id: "avisa", amount_brl: 69, charge_date: "2026-07-20" });

function statementOcc(paid: boolean, dueDate = "2026-08-25") {
  return occ({
    id: "stmt-aug",
    item_id: "card-itau",
    amount_brl: 69,
    due_date: dueDate,
    ...(paid ? { paid_at: "2026-08-20T12:00:00Z", paid_amount_brl: 69 } : {}),
  });
}

function scenario(paid: boolean, dueDate = "2026-08-25") {
  const occurrences = [avisaReal, statementOcc(paid, dueDate)];
  const items = [card, avisa];
  const rows = buildMonthRows({ items, occurrences, competence: AUG });
  const statements = buildStatementGroups({ items, occurrences, competence: AUG });
  const settlement = buildStatementSettlementIndex(statements);
  return { rows, statements, settlement, items, occurrences };
}

describe("competência da cobrança = charge_date (não competence_month)", () => {
  it("row REAL de agosto com cobrança 20/JUL pertence à fatura de AGOSTO", () => {
    const { rows, statements } = scenario(true);
    const row = rows.find((r) => r.item.id === "avisa")!;
    const competence = resolveStatementCompetenceForRow(row, {
      today: "2026-08-25",
      rows,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    } as never)!;
    expect(competence).toEqual(AUG);
  });

  it("projeção com cobrança 20/AGO pertence à fatura de SETEMBRO", () => {
    const rows = buildMonthRows({ items: [card, avisa], occurrences: [], competence: AUG });
    const row = rows.find((r) => r.item.id === "avisa")!;
    expect(row.projected).toBe(true);
    expect(row.chargeDate).toBe("2026-08-20");
    const competence = resolveStatementCompetenceForRow(row, {
      today: "2026-08-25",
      rows,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
    } as never)!;
    expect(competence).toEqual({ year: 2026, month: 9 });
  });

  it("grupo da fatura de agosto contém o AVISA real, uma única vez", () => {
    const { statements } = scenario(true);
    const group = statements[0];
    const avisaComponents = group.components.filter((c) => c.item.id === "avisa");
    expect(avisaComponents).toHaveLength(1);
    expect(avisaComponents[0].occurrence?.id).toBe("occ-avisa");
    expect(avisaComponents[0].projected).toBe(false);
    expect(group.projectedTotal).toBe(69);
  });

  it("fatura paga liquida o AVISA: pago, não em aberto, badge positivo", () => {
    const { rows, statements, settlement } = scenario(true);
    const row = rows.find((r) => r.item.id === "avisa")!;
    expect(effectivePaid(row, rows, settlement)).toBe(true);

    const totals = computeTotals(rows, settlement);
    expect(totals.paid).toBe(69);
    expect(totals.open).toBe(0);
    expect(Number((totals.paid + totals.open).toFixed(2))).toBe(totals.expected);

    const status = resolveRowStatus(row, {
      today: "2026-08-26",
      rows,
      settlement,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    } as never);
    expect(status.tone).toBe("positive");
    expect(["Pago pela fatura", "Fatura paga"]).toContain(status.label);
  });

  it("fatura de agosto em aberto e vencida => AVISA atrasado pela fatura", () => {
    const { rows, statements, settlement } = scenario(false, "2026-08-25");
    const row = rows.find((r) => r.item.id === "avisa")!;
    expect(effectivePaid(row, rows, settlement)).toBe(false);
    const status = resolveRowStatus(row, {
      today: "2026-08-26",
      rows,
      settlement,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    } as never);
    expect(status.label).toBe("Fatura atrasada");
  });

  it("fatura de agosto em aberto e a vencer => Fatura a pagar / vence hoje", () => {
    const { rows, statements, settlement } = scenario(false, "2026-08-25");
    const row = rows.find((r) => r.item.id === "avisa")!;
    const ctx = (today: string) => ({
      today,
      rows,
      settlement,
      cardsById: new Map([[card.id, card]]),
      competenceMonth: "2026-08-01",
      statementGroups: statements,
    });
    expect(["Fatura a pagar", "Fatura vence hoje"]).toContain(
      resolveRowStatus(row, ctx("2026-08-20") as never).label,
    );
    expect(["Fatura vence hoje", "Fatura a pagar"]).toContain(
      resolveRowStatus(row, ctx("2026-08-25") as never).label,
    );
  });

  it("cobrança realmente em 20/AGO não entra na fatura de agosto", () => {
    const occurrences = [
      occ({ id: "occ-late", item_id: "avisa", amount_brl: 69, charge_date: "2026-08-20" }),
      statementOcc(true),
    ];
    const statements = buildStatementGroups({ items: [card, avisa], occurrences, competence: AUG });
    expect(statements[0].components.some((c) => c.item.id === "avisa")).toBe(false);
    const rows = buildMonthRows({ items: [card, avisa], occurrences, competence: AUG });
    const settlement = buildStatementSettlementIndex(statements);
    expect(effectivePaid(rows.find((r) => r.item.id === "avisa")!, rows, settlement)).toBe(false);
  });
});

describe("tools-only (buildSafeSettlementIndex) segue a mesma regra", () => {
  const cardsById = new Map([[card.id, card]]);

  it("cobrança 20/JUL em competência agosto é liquidada pela fatura segura de agosto", () => {
    const rows = buildMonthRows({ items: [avisa], occurrences: [avisaReal], competence: AUG });
    const index = buildSafeSettlementIndex({
      rows,
      isPaidCard: () => true,
      competence: AUG,
      cardsById,
    });
    expect(index.paidComponentKeys.size).toBe(1);
  });

  it("cobrança 20/AGO não é liquidada pela fatura segura de agosto", () => {
    const rows = buildMonthRows({
      items: [avisa],
      occurrences: [occ({ id: "o", item_id: "avisa", amount_brl: 69, charge_date: "2026-08-20" })],
      competence: AUG,
    });
    const index = buildSafeSettlementIndex({
      rows,
      isPaidCard: () => true,
      competence: AUG,
      cardsById,
    });
    expect(index.paidComponentKeys.size).toBe(0);
  });
});
