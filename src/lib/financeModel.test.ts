import { describe, it, expect } from "vitest";
import {
  applyQuickFilter,
  buildMonthRows,
  buildStatementGroups,
  computeTotals,
  detectPackageOverlaps,
  effectivePaid,
  isProjectableInMonth,
  normalizeToolName,
  toBrl,
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

function occurrence(partial: Partial<FinanceOccurrence> & { id: string; item_id: string }): FinanceOccurrence {
  return {
    competence_month: "2026-08-01",
    currency: "BRL",
    ...partial,
  } as FinanceOccurrence;
}

describe("financeModel — projeção sem pré-geração", () => {
  it("projeta mensal, créditos e variável; nunca projeta avulso", () => {
    expect(isProjectableInMonth(item({ id: "1", name: "A", recurrence_type: "monthly" }), COMPETENCE)).toBe(true);
    expect(isProjectableInMonth(item({ id: "2", name: "B", recurrence_type: "credits" }), COMPETENCE)).toBe(true);
    expect(isProjectableInMonth(item({ id: "3", name: "C", recurrence_type: "variable" }), COMPETENCE)).toBe(true);
    expect(isProjectableInMonth(item({ id: "4", name: "D", recurrence_type: "one_off" }), COMPETENCE)).toBe(false);
  });

  it("anual só aparece no mês da assinatura", () => {
    const annual = item({ id: "5", name: "Anual", recurrence_type: "annual", subscription_date: "2025-08-14" });
    expect(isProjectableInMonth(annual, COMPETENCE)).toBe(true);
    expect(isProjectableInMonth(annual, { year: 2026, month: 9 })).toBe(false);
  });

  it("item inativo e recurso incluído não geram linha", () => {
    const rows = buildMonthRows({
      items: [
        item({ id: "6", name: "Inativa", active: false }),
        item({ id: "7", name: "Incluída", kind: "included_resource", parent_item_id: "pkg" }),
      ],
      occurrences: [],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(0);
  });

  it("avulso aparece somente pela ocorrência persistida", () => {
    const oneOff = item({ id: "8", name: "Conserto", kind: "expense", recurrence_type: "one_off" });
    expect(buildMonthRows({ items: [oneOff], occurrences: [], competence: COMPETENCE })).toHaveLength(0);
    const rows = buildMonthRows({
      items: [oneOff],
      occurrences: [occurrence({ id: "o1", item_id: "8", amount_brl: 300, due_date: "2026-08-10" })],
      competence: COMPETENCE,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].projected).toBe(false);
    expect(rows[0].amountBrl).toBe(300);
  });

  it("ocorrência do mês tem prioridade sobre a projeção e preserva o câmbio do mês", () => {
    const tool = item({
      id: "9",
      name: "Lovable",
      currency: "USD",
      default_amount_original: 705,
      default_exchange_rate: 5.13,
      default_amount_brl: 3616.65,
      charge_day: 23,
    });
    const rows = buildMonthRows({
      items: [tool],
      occurrences: [
        occurrence({
          id: "o2",
          item_id: "9",
          currency: "USD",
          amount_original: 705,
          exchange_rate: 5.4,
          amount_brl: 3807,
          charge_date: "2026-08-23",
        }),
      ],
      competence: COMPETENCE,
      fallbackRate: 6.0,
    });
    expect(rows[0].amountBrl).toBe(3807);
    expect(rows[0].projected).toBe(false);
  });

  it("converte USD pela taxa padrão quando o item não tem valor em BRL", () => {
    expect(
      toBrl({ currency: "USD", amountOriginal: 10, amountBrl: null, exchangeRate: null, fallbackRate: 5.13 }),
    ).toBe(51.3);
  });
});

describe("financeModel — fatura não é somada como despesa", () => {
  const card = item({
    id: "card1",
    name: "Itaú ••••7587",
    kind: "card",
    cost_center: "compartilhado",
    statement_closing_day: 10,
    statement_due_day: 17,
  });
  const tool = item({ id: "t1", name: "Google Drive", default_amount_brl: 14.99, charge_day: 1, card_item_id: "card1" });
  const direct = item({ id: "e1", name: "Claro", kind: "expense", default_amount_brl: 200, due_day: 10, cost_center: "administrativo" });

  it("KPIs de despesa ignoram a fatura e contabilizam apenas os componentes", () => {
    const rows = buildMonthRows({
      items: [card, tool, direct],
      occurrences: [occurrence({ id: "s1", item_id: "card1", amount_brl: 3809.25, due_date: "2026-08-17" })],
      competence: COMPETENCE,
    });
    const totals = computeTotals(rows);
    expect(totals.expected).toBe(214.99); // 14,99 + 200 — fatura fora
    expect(totals.statements).toBe(3809.25);
    expect(totals.toolsAndAi).toBe(14.99);
  });

  it("componente no cartão herda o pagamento da fatura", () => {
    const rows = buildMonthRows({
      items: [card, tool],
      occurrences: [
        occurrence({ id: "s1", item_id: "card1", amount_brl: 3809.25, due_date: "2026-08-17", paid_at: "2026-08-20T13:59:50Z", paid_amount_brl: 3809.25 }),
        occurrence({ id: "c1", item_id: "t1", amount_brl: 14.99, charge_date: "2026-08-01", statement_occurrence_id: "s1" }),
      ],
      competence: COMPETENCE,
    });
    const component = rows.find((r) => r.item.id === "t1")!;
    expect(component.paid).toBe(false);
    expect(effectivePaid(component, rows)).toBe(true);
    const totals = computeTotals(rows);
    expect(totals.paid).toBe(14.99);
    expect(totals.open).toBe(0);
    expect(totals.expected).toBe(14.99);
  });

  it("agrupa componentes pelo ciclo do cartão e expõe a diferença a classificar", () => {
    const late = item({ id: "t2", name: "ChatGPT", default_amount_brl: 359.1, charge_day: 24, card_item_id: "card1" });
    const groups = buildStatementGroups({
      items: [card, tool, late],
      occurrences: [occurrence({ id: "s1", item_id: "card1", amount_brl: 500, due_date: "2026-08-17" })],
      competence: COMPETENCE,
    });
    const group = groups[0];
    // Google Drive (dia 1, antes do fechamento 10) entra; ChatGPT (dia 24) vai para setembro
    // e o ChatGPT de julho (dia 24 > fechamento) entra nesta fatura.
    const names = group.components.map((c) => c.item.name);
    expect(names).toContain("Google Drive");
    expect(names).toContain("ChatGPT");
    expect(group.projectedTotal).toBe(374.09);
    expect(group.actualTotal).toBe(500);
    expect(group.difference).toBe(125.91);
    expect(group.configIncomplete).toBe(false);
    expect(group.dueDate).toBe("2026-08-17");
  });

  it("cartão sem fechamento/vencimento é marcado como configuração incompleta", () => {
    const blindCard = item({ id: "card2", name: "Cartão ••••9584", kind: "card", statement_closing_day: null, statement_due_day: null });
    const onCard = item({ id: "t3", name: "CapCut", default_amount_brl: 32.9, charge_day: 13, card_item_id: "card2" });
    const groups = buildStatementGroups({ items: [blindCard, onCard], occurrences: [], competence: COMPETENCE });
    expect(groups[0].configIncomplete).toBe(true);
    expect(groups[0].incompleteReason).toBe("Complete os dados do cartão para projetar a fatura");
    expect(groups[0].components.map((c) => c.item.name)).toEqual(["CapCut"]);
  });
});

describe("financeModel — filtros rápidos", () => {
  const today = "2026-08-24";
  const rows = buildMonthRows({
    items: [
      item({ id: "a", name: "Hoje", kind: "expense", due_day: 24, default_amount_brl: 10 }),
      item({ id: "b", name: "Amanhã", kind: "expense", due_day: 25, default_amount_brl: 20 }),
      item({ id: "c", name: "Atrasada", kind: "expense", due_day: 10, default_amount_brl: 30 }),
      item({ id: "d", name: "Avulsa paga", kind: "expense", recurrence_type: "one_off" }),
    ],
    occurrences: [
      occurrence({ id: "o1", item_id: "d", amount_brl: 40, due_date: "2026-08-05", paid_at: "2026-08-05T10:00:00Z" }),
    ],
    competence: COMPETENCE,
  });

  it("filtra hoje, amanhã, atrasadas, próximos 7 dias, pagas e recorrentes", () => {
    expect(applyQuickFilter(rows, "today", today).map((r) => r.item.name)).toEqual(["Hoje"]);
    expect(applyQuickFilter(rows, "tomorrow", today).map((r) => r.item.name)).toEqual(["Amanhã"]);
    expect(applyQuickFilter(rows, "overdue", today).map((r) => r.item.name)).toEqual(["Atrasada"]);
    expect(applyQuickFilter(rows, "next7", today).map((r) => r.item.name).sort()).toEqual(["Amanhã", "Hoje"]);
    expect(applyQuickFilter(rows, "paid", today).map((r) => r.item.name)).toEqual(["Avulsa paga"]);
    expect(applyQuickFilter(rows, "recurring", today).map((r) => r.item.name).sort()).toEqual([
      "Amanhã",
      "Atrasada",
      "Hoje",
    ]);
    expect(applyQuickFilter(rows, "all", today)).toHaveLength(4);
  });

  it("conta paga não aparece como atrasada", () => {
    expect(applyQuickFilter(rows, "overdue", today).some((r) => r.item.name === "Avulsa paga")).toBe(false);
  });
});

describe("financeModel — duplicidade com pacotes", () => {
  it("normaliza nomes ignorando acento e sufixos comerciais", () => {
    expect(normalizeToolName("CapCut Pro")).toBe(normalizeToolName("CapCut"));
    expect(normalizeToolName("ChatGPT Subscription")).toBe(normalizeToolName("ChatGPT"));
    expect(normalizeToolName("Conteúdos Flix")).toBe("conteudos flix");
  });

  it("aponta ferramenta paga que também vem no pacote ativo", () => {
    const overlaps = detectPackageOverlaps([
      item({ id: "pkg", name: "ConteúdosFlix", kind: "package" }),
      item({ id: "res", name: "CapCut Pro", kind: "included_resource", parent_item_id: "pkg" }),
      item({ id: "tool", name: "CapCut", kind: "tool" }),
      item({ id: "other", name: "Supabase", kind: "tool" }),
    ]);
    expect(overlaps.get("tool")).toEqual(["ConteúdosFlix"]);
    expect(overlaps.has("other")).toBe(false);
  });

  it("pacote inativo não gera alerta", () => {
    const overlaps = detectPackageOverlaps([
      item({ id: "pkg", name: "ConteúdosFlix", kind: "package", active: false }),
      item({ id: "res", name: "CapCut", kind: "included_resource", parent_item_id: "pkg" }),
      item({ id: "tool", name: "CapCut", kind: "tool" }),
    ]);
    expect(overlaps.size).toBe(0);
  });
});
