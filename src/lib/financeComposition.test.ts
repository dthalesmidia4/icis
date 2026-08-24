import { describe, expect, it } from "vitest";
import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  buildMonthRows,
  cardDisplayLabel,
  computeTotals,
} from "./financeModel";
import {
  buildMonthComposition,
  compositionOriginOptions,
  compositionTotal,
  normalizeCompositionStatus,
} from "./financeComposition";

const competence = { year: 2026, month: 8 };

function item(over: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "expense",
    cost_center: "administrativo",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
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

const card = item({
  id: "card-1",
  name: "Itaú",
  kind: "card",
  card_last4: "7587",
  statement_closing_day: 5,
  statement_due_day: 15,
});

function scenario(statementPaid: boolean) {
  const items: FinanceItem[] = [
    card,
    item({ id: "direct-1", name: "Aluguel", payment_method: "Boleto", due_day: 10 }),
    item({ id: "direct-paid", name: "Internet", payment_method: "Pix", due_day: 8 }),
    item({ id: "tool-1", name: "Figma", kind: "tool", card_item_id: "card-1", charge_day: 3 }),
    item({ id: "incl-1", name: "Recurso incluso", kind: "included_resource", parent_item_id: "pkg" }),
  ];
  const occurrences: FinanceOccurrence[] = [
    occ({ id: "st-1", item_id: "card-1", amount_brl: 300, due_date: "2026-08-15", paid_at: statementPaid ? "2026-08-15T12:00:00Z" : null }),
    occ({ id: "o-direct", item_id: "direct-1", amount_brl: 1000, due_date: "2026-08-10" }),
    occ({ id: "o-paid", item_id: "direct-paid", amount_brl: 200, due_date: "2026-08-08", paid_at: "2026-08-08T10:00:00Z", paid_amount_brl: 190 }),
    occ({ id: "o-tool", item_id: "tool-1", amount_brl: 300, charge_date: "2026-08-03", statement_occurrence_id: "st-1" }),
  ];
  const rows = buildMonthRows({ items, occurrences, competence });
  return { items, rows, totals: computeTotals(rows) };
}

describe("buildMonthComposition", () => {
  it("inclui despesa direta e componente de cartão, exclui fatura e recurso incluído", () => {
    const { rows } = scenario(false);
    const names = buildMonthComposition({ rows, status: "all" }).map((e) => e.row.item.name);
    expect(names).toContain("Aluguel");
    expect(names).toContain("Figma");
    expect(names).not.toContain("Itaú");
    expect(names).not.toContain("Recurso incluso");
  });

  it("componente com fatura paga entra em pagos; com fatura aberta entra em aberto", () => {
    const open = scenario(false);
    expect(buildMonthComposition({ rows: open.rows, status: "open" }).map((e) => e.row.item.name)).toContain("Figma");
    expect(buildMonthComposition({ rows: open.rows, status: "paid" }).map((e) => e.row.item.name)).not.toContain("Figma");

    const paid = scenario(true);
    expect(buildMonthComposition({ rows: paid.rows, status: "paid" }).map((e) => e.row.item.name)).toContain("Figma");
    expect(buildMonthComposition({ rows: paid.rows, status: "open" }).map((e) => e.row.item.name)).not.toContain("Figma");
  });

  it("nunca inclui statement em nenhum recorte", () => {
    for (const statementPaid of [false, true]) {
      const { rows } = scenario(statementPaid);
      for (const status of ["all", "paid", "open"] as const) {
        const kinds = buildMonthComposition({ rows, status }).map((e) => e.row.item.kind);
        expect(kinds).not.toContain("card");
      }
    }
  });

  it("reconcilia com computeTotals em fatura aberta", () => {
    const { rows, totals } = scenario(false);
    expect(compositionTotal(buildMonthComposition({ rows, status: "all" }))).toBeCloseTo(totals.expected, 2);
    expect(compositionTotal(buildMonthComposition({ rows, status: "paid" }))).toBeCloseTo(totals.paid, 2);
    expect(compositionTotal(buildMonthComposition({ rows, status: "open" }))).toBeCloseTo(totals.open, 2);
  });

  it("reconcilia com computeTotals em fatura paga", () => {
    const { rows, totals } = scenario(true);
    expect(compositionTotal(buildMonthComposition({ rows, status: "all" }))).toBeCloseTo(totals.expected, 2);
    expect(compositionTotal(buildMonthComposition({ rows, status: "paid" }))).toBeCloseTo(totals.paid, 2);
    expect(compositionTotal(buildMonthComposition({ rows, status: "open" }))).toBeCloseTo(totals.open, 2);
  });

  it("usa paid_amount_brl no recorte de pagos, igual ao total", () => {
    const { rows } = scenario(false);
    const entry = buildMonthComposition({ rows, status: "paid" }).find((e) => e.row.item.name === "Internet");
    expect(entry?.value).toBe(190);
  });
});

describe("origens e query param", () => {
  it("origem de cartão usa label humano, nunca UUID", () => {
    const { rows } = scenario(false);
    const cardsById = new Map([[card.id, card]]);
    const options = compositionOriginOptions(rows, cardsById, cardDisplayLabel);
    const labels = options.map((o) => o.label);
    expect(labels).toContain("Itaú ••••7587");
    expect(labels.join(" ")).not.toContain("card-1");
  });

  it("status inválido cai em all", () => {
    expect(normalizeCompositionStatus("nope")).toBe("all");
    expect(normalizeCompositionStatus(null)).toBe("all");
    expect(normalizeCompositionStatus("paid")).toBe("paid");
  });
});

// tipagem: MonthRow importado para garantir compatibilidade da base
export type _Row = MonthRow;
