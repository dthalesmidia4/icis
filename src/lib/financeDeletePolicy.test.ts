import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  occurrenceDeleteAction,
  parseItemDeleteDecision,
} from "./financeDeletePolicy";
import { buildCompositionGroups, normalizeGroupBy } from "./financeGrouping";
import type { FinanceItem, MonthRow } from "./financeModel";

const item = (over: Partial<FinanceItem> = {}) =>
  ({
    id: "i1",
    kind: "expense",
    recurrence_type: "monthly",
    category: null,
    cost_center: "agency",
    name: "X",
    ...over,
  }) as FinanceItem;

const row = (over: Partial<MonthRow> = {}) =>
  ({ key: "k", item: item(), value: 10, ...over }) as unknown as MonthRow;

describe("excluir x inativar", () => {
  it("fato fechado é imutável, qualquer que seja a natureza", () => {
    expect(
      occurrenceDeleteAction({ item: item({ kind: "card" }), persisted: true, closed: true }),
    ).toBe("blocked_closed");
    expect(
      occurrenceDeleteAction({
        item: item({ recurrence_type: "one_off" }),
        persisted: true,
        closed: true,
      }),
    ).toBe("blocked_closed");
  });

  it("projeção sem fato no banco não tem o que excluir", () => {
    expect(occurrenceDeleteAction({ item: item(), persisted: false, closed: false })).toBe(
      "nothing_to_delete",
    );
  });

  it("recorrente aberto vira inativação: apagar o mês faria projetar de novo", () => {
    expect(occurrenceDeleteAction({ item: item(), persisted: true, closed: false })).toBe(
      "inactivate_item",
    );
  });

  it("avulso aberto é excluível; fatura de cartão aberta também", () => {
    expect(
      occurrenceDeleteAction({
        item: item({ recurrence_type: "one_off" }),
        persisted: true,
        closed: false,
      }),
    ).toBe("delete_one_off");
    expect(
      occurrenceDeleteAction({ item: item({ kind: "card" }), persisted: true, closed: false }),
    ).toBe("delete_statement");
  });

  it("decisão do servidor é normalizada e rejeita payload estranho", () => {
    expect(parseItemDeleteDecision({ action: "delete", occurrence_count: "0" })?.action).toBe(
      "delete",
    );
    expect(parseItemDeleteDecision({ action: "whatever" })).toBeNull();
    expect(parseItemDeleteDecision(null)).toBeNull();
  });

  it("cliente nunca faz DELETE direto: só RPCs seguras", () => {
    const src = readFileSync("src/lib/financeSafeDelete.ts", "utf8");
    expect(src).not.toContain(".delete()");
    for (const rpc of [
      "finance_item_delete_decision",
      "delete_finance_item_safe",
      "inactivate_finance_item_safe",
      "delete_finance_occurrence_safe",
    ]) {
      expect(src).toContain(rpc);
    }
  });
});

describe("agrupamento ortogonal da composição", () => {
  const entries = [
    { row: row({ key: "a", item: item({ id: "a", category: "Nuvem", cost_center: "agency" }) }), value: 100 },
    { row: row({ key: "b", item: item({ id: "b", category: "Nuvem", cost_center: "client" }) }), value: 50 },
    { row: row({ key: "c", item: item({ id: "c", category: null, cost_center: "client" }) }), value: 25 },
  ];

  it("trocar a dimensão nunca muda o total da lista", () => {
    const total = entries.reduce((s, e) => s + e.value, 0);
    for (const by of ["category", "cost_center"] as const) {
      const groups = buildCompositionGroups(entries, by);
      expect(groups.reduce((s, g) => s + g.total, 0)).toBe(total);
      expect(groups.reduce((s, g) => s + g.count, 0)).toBe(entries.length);
    }
  });

  it("centro de custo agrupa por área, independente da categoria", () => {
    const groups = buildCompositionGroups(entries, "cost_center");
    expect(groups.length).toBe(2);
    expect(groups.find((g) => g.key === "client")?.total).toBe(75);
  });

  it("dimensão desconhecida cai em categoria", () => {
    expect(normalizeGroupBy("nope")).toBe("category");
    expect(normalizeGroupBy("cost_center")).toBe("cost_center");
  });
});

describe("aviso de cartão", () => {
  it("cartão inativo sem fato real não gera pendência de configuração", () => {
    const status = readFileSync("src/lib/financeRowStatus.ts", "utf8");
    // Mesma regra da tela de cartões, nunca uma segunda regra paralela.
    expect(status).toContain("visibleStatementGroups(params.statements)");
    expect(status).toContain("g.configIncomplete && g.card.active");
    const page = readFileSync("src/pages/Financial.tsx", "utf8");
    expect(page).toContain("visibleStatements.filter((g) => g.configIncomplete && g.card.active)");
  });
});
