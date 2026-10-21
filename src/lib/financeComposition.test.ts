import { describe, expect, it } from "vitest";
import {
  FinanceItem,
  FinanceOccurrence,
  MonthRow,
  buildMonthRows,
  buildStatementGroups,
  cardDisplayLabel,
  computeTotals,
} from "./financeModel";
import {
  buildMonthComposition,
  compositionOriginOptions,
  compositionTotal,
  normalizeCompositionStatus,
  rowsForStatementMonth,
  statementSkippedEntries,
} from "./financeComposition";
import { buildStatementSettlementIndex } from "./financeSettlement";
import type { StatementCycleMap } from "./financeStatementCycles";

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

describe("rowsForStatementMonth — OUT/NOV por composição canônica", () => {
  const out = { year: 2026, month: 10 };
  const nov = { year: 2026, month: 11 };
  const itau = item({ ...card, statement_closing_day: 13, statement_due_day: 25 });
  const purchase = (id: string, name: string) => item({
    id, name, kind: "tool", recurrence_type: "one_off", card_item_id: itau.id,
  });
  const items = [itau, purchase("old", "Compra SET"), purchase("adplane", "Adplane"),
    purchase("supabase", "Supabase"), purchase("chatgpt", "ChatGPT LEAL"),
    item({ id: "direct", name: "Conta direta", recurrence_type: "one_off", payment_method: "Pix" })];
  const fact = (id: string, itemId: string, date: string, value: number, extra: Partial<FinanceOccurrence> = {}) => occ({
    id, item_id: itemId, competence_month: "2026-10-01", charge_date: date, amount_brl: value, ...extra,
  });
  const occurrences = [
    occ({ id: "stmt-out", item_id: itau.id, competence_month: "2026-10-01", due_date: "2026-10-25",
      statement_closing_date: "2026-10-14", paid_at: "2026-10-20T12:00:00Z", amount_brl: 114.88,
      paid_amount_brl: 114.88, iof_amount_brl: 14.88 }),
    occ({ id: "stmt-nov", item_id: itau.id, competence_month: "2026-11-01", due_date: "2026-11-25" }),
    fact("old-fact", "old", "2026-09-24", 100, { statement_occurrence_id: "stmt-out" }),
    fact("adplane-fact", "adplane", "2026-10-24", 40.30),
    fact("supabase-fact", "supabase", "2026-10-15", 219.80),
    fact("chatgpt-fact", "chatgpt", "2026-10-25", 163.94, { entry_role: "extra" }),
    fact("direct-fact", "direct", "2026-10-10", 75, { due_date: "2026-10-10" }),
  ];
  const cycles: StatementCycleMap = new Map([
    [`${itau.id}|2026-10-01`, { cardId: itau.id, competenceMonth: "2026-10-01",
      cycleStart: "2026-09-14", cycleEnd: "2026-10-14", closingDateIsActual: true }],
    [`${itau.id}|2026-11-01`, { cardId: itau.id, competenceMonth: "2026-11-01",
      cycleStart: "2026-10-15", cycleEnd: "2026-11-13", closingDateIsActual: false }],
  ]);
  const raw = buildMonthRows({ items, occurrences, competence: out });
  const groups = (competence: typeof out) => buildStatementGroups({ items, occurrences, competence, cycles });
  const outGroups = groups(out);
  const novGroups = groups(nov);
  const chat = raw.find((row) => row.occurrence?.id === "chatgpt-fact");
  if (!chat) throw new Error("Fato sintético ChatGPT ausente");
  const staleProjection: MonthRow = { ...chat, key: "stale-chat-projection", occurrence: null,
    projected: true, chargeDate: "2026-10-24", amountBrl: 109.80 };

  it("OUT paga exclui compras futuras e projeção de novembro sem alterar rows operacionais", () => {
    const input = [...raw, staleProjection];
    const before = JSON.stringify(input);
    const result = rowsForStatementMonth(input, outGroups);
    expect(result.filter((row) => row.cardItemId === itau.id).map((row) => row.occurrence?.id)).toEqual(["old-fact"]);
    expect(computeTotals(result, buildStatementSettlementIndex(outGroups))).toMatchObject({
      expected: 189.88, paid: 114.88, open: 75,
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(result.find((row) => row.occurrence?.id === "old-fact")).toBe(outGroups[0]?.components[0]);
  });

  it("OUT sem despesa direta possui R$0 em aberto nos KPIs e na Composição", () => {
    const result = rowsForStatementMonth([...raw, staleProjection].filter((row) => row.item.id !== "direct"), outGroups);
    const settlement = buildStatementSettlementIndex(outGroups);
    expect(computeTotals(result, settlement).open).toBe(0);
    expect(compositionTotal(buildMonthComposition({ rows: result, status: "open", settlement }))).toBe(0);
  });

  it("NOV recebe os fatos de OUT com valor real, sem recuperar projeção ChatGPT", () => {
    const result = rowsForStatementMonth(buildMonthRows({ items, occurrences, competence: nov }), novGroups);
    const purchases = result.filter((row) => row.cardItemId === itau.id);
    expect(purchases.map((row) => row.occurrence?.id).sort()).toEqual(["adplane-fact", "chatgpt-fact", "supabase-fact"]);
    expect(purchases.find((row) => row.item.id === "chatgpt")?.amountBrl).toBe(163.94);
    expect(purchases.every((row) => !row.projected)).toBe(true);
    expect(computeTotals(result, buildStatementSettlementIndex(novGroups)).open).toBe(424.04);
  });

  it("todos os recortes reconciliam com KPIs e IOF pago conta uma vez", () => {
    for (const [competence, statements] of [[out, outGroups], [nov, novGroups]] as const) {
      const result = rowsForStatementMonth(buildMonthRows({ items, occurrences, competence }), statements);
      const settlement = buildStatementSettlementIndex(statements);
      const totals = computeTotals(result, settlement);
      for (const [status, total] of [["all", totals.expected], ["paid", totals.paid], ["open", totals.open]] as const) {
        expect(compositionTotal(buildMonthComposition({ rows: result, status, settlement }))).toBe(total);
      }
      if (competence === out) {
        const iof = buildMonthComposition({ rows: result, status: "paid", settlement }).filter((e) => e.row.key.startsWith("iof:"));
        expect(iof).toHaveLength(1);
        expect(iof[0]?.value).toBe(14.88);
      }
    }
  });

  it("preserva fallback sem ciclo ou sem statementRow e pagamentos sem cartão interno", () => {
    const group = outGroups[0];
    if (!group) throw new Error("Fatura sintética ausente");
    expect(rowsForStatementMonth(raw, [{ ...group, configIncomplete: true }])).toEqual(raw);
    expect(rowsForStatementMonth(raw, [{ ...group, statementRow: null }])).toEqual(raw);
    const external: MonthRow = { ...staleProjection, key: "external", cardItemId: null, paymentMethod: "Cartão externo" };
    const unknown: MonthRow = { ...staleProjection, key: "unknown-card", cardItemId: "unconfigured" };
    const result = rowsForStatementMonth([...raw, external, unknown], outGroups);
    expect(result).toContain(external);
    expect(result).toContain(unknown);
    expect(result.some((row) => row.item.id === "direct")).toBe(true);
  });

  it("dedupe por key mantém duas recargas do mesmo item e ignora componentes inválidos", () => {
    const group = novGroups[0];
    if (!group || !group.statementRow) throw new Error("Fatura sintética ausente");
    const recharge1: MonthRow = { ...chat, key: "recharge-1", entryRole: "recharge", amountBrl: 10 };
    const recharge2: MonthRow = { ...chat, key: "recharge-2", entryRole: "recharge", amountBrl: 20 };
    const wrongCard: MonthRow = { ...chat, key: "wrong-card", cardItemId: "another-card" };
    const statements = [{ ...group, components: [recharge1, recharge2, recharge1, wrongCard, group.statementRow] }];
    const result = rowsForStatementMonth([], statements);
    expect(result).toEqual([recharge1, recharge2]);
    expect(computeTotals(result).open).toBe(30);
    expect(rowsForStatementMonth([], statements)).toEqual(result);
  });
});

// tipagem: MonthRow importado para garantir compatibilidade da base
export type _Row = MonthRow;

describe("A pagar = Composição > Em aberto", () => {
  it("fatura paga: só a despesa direta aberta entra, nada pago", () => {
    const { rows } = scenario(true);
    const open = buildMonthComposition({ rows, status: "open" });
    expect(open.map((e) => e.row.item.name)).toEqual(["Aluguel"]);
    expect(open.every((e) => !e.paid)).toBe(true);
    expect(compositionTotal(open)).toBe(1000);
  });
});

describe("statementSkippedEntries", () => {
  const cycles: StatementCycleMap = new Map([
    ["itau|2026-10-01", { cardId: "itau", competenceMonth: "2026-10-01", cycleStart: "2026-09-15", cycleEnd: "2026-10-14", closingDateIsActual: true }],
    ["itau|2026-11-01", { cardId: "itau", competenceMonth: "2026-11-01", cycleStart: "2026-10-15", cycleEnd: "2026-11-13", closingDateIsActual: false }],
  ]);
  const items = [
    item({ id: "canva", name: "Canva", kind: "tool", card_item_id: "itau" }),
    item({ id: "faxina", name: "FAXINA", payment_method: "Pix" }),
  ];
  const skippedOcc = (id: string, item_id: string, month: string, date: string) =>
    occ({ id, item_id, competence_month: month, scheduled_date: date, skipped_at: "2026-10-01T00:00:00Z" } as any);
  const occurrences = [
    skippedOcc("s-set", "canva", "2026-09-01", "2026-09-20"),
    skippedOcc("s-out", "canva", "2026-10-01", "2026-10-20"),
    skippedOcc("f-out", "faxina", "2026-10-01", "2026-10-07"),
  ];
  const run = (month: number) =>
    statementSkippedEntries({ occurrences, fallbackItems: items, competence: { year: 2026, month }, cycles }).map((e) => e.occurrence.id);

  it("cartão segue o mês da fatura; direto segue a competência", () => {
    expect(run(10)).toEqual(["f-out", "s-set"]);
    expect(run(11)).toEqual(["s-out"]);
  });

  it("ignorados não somam nos totais da composição", () => {
    const { rows } = scenario(false);
    expect(compositionTotal(buildMonthComposition({ rows, status: "open" }))).toBe(
      computeTotals(rows).open,
    );
  });
});
