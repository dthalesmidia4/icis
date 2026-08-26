import { describe, it, expect } from "vitest";
import {
  buildOccurrenceLabels,
  groupStatementComponents,
  occurrenceDisplayName,
} from "./financeOccurrenceLabels";
import {
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  type FinanceItem,
  type FinanceOccurrence,
} from "./financeModel";

const COMPETENCE = { year: 2026, month: 8 };

function item(partial: Partial<FinanceItem> & { id: string; name: string }): FinanceItem {
  return {
    kind: "tool",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...partial,
  } as FinanceItem;
}

function occurrence(
  partial: Partial<FinanceOccurrence> & { id: string; item_id: string },
): FinanceOccurrence {
  return {
    competence_month: "2026-08-01",
    currency: "BRL",
    entry_role: "regular",
    ...partial,
  } as FinanceOccurrence;
}

describe("ocorrências suplementares — linhas do mês", () => {
  const lovable = item({
    id: "lov",
    name: "Lovable",
    default_amount_brl: 500,
    charge_day: 23,
    supports_supplemental_entries: true,
    supplemental_entry_kind: "recharge",
  });

  it("mensal regular + 3 recargas geram 4 linhas e somam todas", () => {
    const rows = buildMonthRows({
      items: [lovable],
      occurrences: [
        occurrence({ id: "r0", item_id: "lov", amount_brl: 500, due_date: "2026-08-23" }),
        ...[1, 2, 3].map((n) =>
          occurrence({
            id: `x${n}`,
            item_id: "lov",
            entry_role: "recharge",
            amount_brl: 100 * n,
            due_date: `2026-08-0${n}`,
          }),
        ),
      ],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(4);
    expect(computeTotals(rows).expected).toBe(500 + 100 + 200 + 300);
  });

  it("extra não suprime a projeção do lançamento regular", () => {
    const rows = buildMonthRows({
      items: [lovable],
      occurrences: [
        occurrence({ id: "x1", item_id: "lov", entry_role: "extra", amount_brl: 90, due_date: "2026-08-05" }),
      ],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.projected)).toHaveLength(1);
  });

  it("nomeia renovação e recargas numeradas", () => {
    const rows = buildMonthRows({
      items: [lovable],
      occurrences: [
        occurrence({ id: "r0", item_id: "lov", amount_brl: 500, due_date: "2026-08-23" }),
        occurrence({ id: "x1", item_id: "lov", entry_role: "recharge", amount_brl: 100, due_date: "2026-08-02" }),
        occurrence({ id: "x2", item_id: "lov", entry_role: "recharge", amount_brl: 100, due_date: "2026-08-09" }),
      ],
      competence: COMPETENCE,
    });
    const labels = buildOccurrenceLabels(rows);
    const names = rows.map((r) => occurrenceDisplayName(r, labels)).sort();
    expect(names).toEqual(["Lovable · Recarga 1/2", "Lovable · Recarga 2/2", "Lovable · Renovação"]);
  });

  it("um único lançamento no mês fica sem sufixo", () => {
    const rows = buildMonthRows({ items: [lovable], occurrences: [], competence: COMPETENCE });
    const labels = buildOccurrenceLabels(rows);
    expect(occurrenceDisplayName(rows[0], labels)).toBe("Lovable");
  });
});

describe("fatura — agrupamento por item lógico", () => {
  const card = item({
    id: "card1",
    name: "Itaú ••••7587",
    kind: "card",
    statement_closing_day: 28,
    statement_due_day: 30,
  });
  const lovable = item({
    id: "lov",
    name: "Lovable",
    default_amount_brl: 500,
    charge_day: 5,
    card_item_id: "card1",
    supports_supplemental_entries: true,
    supplemental_entry_kind: "recharge",
  });

  it("soma cada cobrança uma vez e agrupa as do mesmo item", () => {
    const groups = buildStatementGroups({
      items: [card, lovable],
      occurrences: [
        occurrence({ id: "c0", item_id: "lov", amount_brl: 500, charge_date: "2026-08-05" }),
        occurrence({ id: "c1", item_id: "lov", entry_role: "recharge", amount_brl: 120, charge_date: "2026-08-11" }),
        occurrence({ id: "c2", item_id: "lov", entry_role: "recharge", amount_brl: 80, charge_date: "2026-08-19" }),
      ],
      competence: COMPETENCE,
    });
    const group = groups[0];
    expect(group.components).toHaveLength(3);
    expect(group.projectedTotal).toBe(700);

    const logical = groupStatementComponents(group.components);
    expect(logical).toHaveLength(1);
    expect(logical[0].multiple).toBe(true);
    expect(logical[0].totalBrl).toBe(700);
    expect(logical[0].rows.map((r) => r.chargeDate)).toEqual([
      "2026-08-05",
      "2026-08-11",
      "2026-08-19",
    ]);
  });
});
