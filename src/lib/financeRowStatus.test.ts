import { describe, expect, it } from "vitest";
import { FinanceItem, FinanceOccurrence, MonthRow, formatBRL } from "./financeModel";
import {
  buildAttentionInsights,
  isCardCharge,
  isDirectObligation,
  resolveRowStatus,
  whenLabel,
  isDirectPayableRow,
  isSubscriptionsDomainItem,
  buildPaymentQueue,
  statementValueLabel,
  buildPaidComposition,
  queueDateLabel,
} from "./financeRowStatus";

const TODAY = "2026-08-24";

function item(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: over.id ?? "item-1",
    kind: "tool",
    name: "Google Drive",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...over,
  } as FinanceItem;
}

function card(over: Partial<FinanceItem> = {}): FinanceItem {
  return item({
    id: "card-itau",
    kind: "card",
    name: "Itaú ••••7587",
    statement_closing_day: 10,
    statement_due_day: 17,
    ...over,
  });
}

function row(over: Partial<MonthRow> & { item: FinanceItem }): MonthRow {
  return {
    key: over.key ?? `row:${over.item.id}`,
    occurrence: null,
    projected: false,
    amountBrl: 100,
    amountOriginal: 100,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: null,
    dueDate: null,
    paid: false,
    paidAmountBrl: null,
    cardItemId: null,
    estimated: false,
    ...over,
  } as MonthRow;
}

function occ(over: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: over.id ?? "occ-1",
    item_id: "item-1",
    competence_month: "2026-08-01",
    currency: "BRL",
    ...over,
  } as FinanceOccurrence;
}

describe("classificação de cobrança no cartão", () => {
  const itau = card();
  const cardsById = new Map([[itau.id, itau]]);

  it("cobrança de ferramenta no cartão com data passada NÃO fica atrasada", () => {
    for (const name of ["Google Drive", "Google Cloud", "ElevenLabs"]) {
      const tool = item({ id: `t-${name}`, name, card_item_id: itau.id, payment_method: "Cartão de Crédito", charge_day: 1 });
      const r = row({
        item: tool,
        cardItemId: itau.id,
        chargeDate: "2026-08-01",
        projected: true,
      });
      const status = resolveRowStatus(r, { rows: [r], today: TODAY, cardsById });
      expect(status.kind).not.toBe("overdue");
      expect(status.label).toBe("Prevista na fatura");
      expect(status.canPayDirectly).toBe(false);
      expect(isCardCharge(r)).toBe(true);
      expect(isDirectObligation(r)).toBe(false);
      expect(whenLabel(r, TODAY)).toBe("Cobrança prevista em 01 ago");
    }
  });

  it("Pix direto vencido continua Atrasada", () => {
    const pix = item({ id: "pix-1", kind: "expense", name: "Adeus Pendrive", payment_method: "Pix" });
    const r = row({ item: pix, dueDate: "2026-08-05", occurrence: occ() });
    const status = resolveRowStatus(r, { rows: [r], today: TODAY, cardsById });
    expect(status.kind).toBe("overdue");
    expect(status.label).toBe("Atrasada");
    expect(status.canPayDirectly).toBe(true);
    expect(whenLabel(r, TODAY)).toBe("Vence em 05 ago");
  });

  it("componente ligado a fatura paga mostra Pago pela fatura", () => {
    const statementRow = row({
      key: "stmt",
      item: itau,
      occurrence: occ({ id: "stmt-occ" }),
      dueDate: "2026-08-17",
      paid: true,
    });
    const comp = row({
      item: item({ card_item_id: itau.id }),
      cardItemId: itau.id,
      chargeDate: "2026-08-01",
      occurrence: occ({ statement_occurrence_id: "stmt-occ" }),
    });
    const status = resolveRowStatus(comp, { rows: [statementRow, comp], today: TODAY, cardsById });
    expect(status.label).toBe("Pago pela fatura");
    expect(status.tone).toBe("positive");
  });

  it("componente ligado a fatura vencida em aberto mostra Fatura atrasada", () => {
    const statementRow = row({
      key: "stmt",
      item: itau,
      occurrence: occ({ id: "stmt-occ" }),
      dueDate: "2026-08-17",
      paid: false,
    });
    const comp = row({
      item: item({ card_item_id: itau.id }),
      cardItemId: itau.id,
      chargeDate: "2026-08-01",
      occurrence: occ({ statement_occurrence_id: "stmt-occ" }),
    });
    const status = resolveRowStatus(comp, { rows: [statementRow, comp], today: TODAY, cardsById });
    expect(status.label).toBe("Fatura atrasada");
    expect(status.canPayDirectly).toBe(false);
  });

  it("cobrança em cartão sem ciclo aguarda dados da fatura, não vira atraso", () => {
    const incomplete = card({ id: "card-9584", name: "Cartão ••••9584", statement_closing_day: null, statement_due_day: null });
    const tool = item({ card_item_id: incomplete.id });
    const r = row({ item: tool, cardItemId: incomplete.id, chargeDate: "2026-08-02", projected: true });
    const status = resolveRowStatus(r, {
      rows: [r],
      today: TODAY,
      cardsById: new Map([[incomplete.id, incomplete]]),
    });
    expect(status.kind).toBe("card_awaiting_statement");
    expect(status.label).toBe("Aguardando dados da fatura");
    expect(status.direct).toBe(false);
  });


  it("componente materializado sem vínculo aguarda a fatura", () => {
    const tool = item({ card_item_id: itau.id });
    const r = row({ item: tool, cardItemId: itau.id, chargeDate: "2026-08-02", occurrence: occ() });
    const status = resolveRowStatus(r, { rows: [r], today: TODAY, cardsById });
    expect(status.label).toBe("Aguardando vínculo à fatura");
  });
});

describe("bloco de atenção", () => {
  const itau = card();
  const cardsById = new Map([[itau.id, itau]]);

  it("não conta cobrança no cartão como conta atrasada", () => {
    const tool = item({ card_item_id: itau.id });
    const r = row({ item: tool, cardItemId: itau.id, chargeDate: "2026-08-01", projected: true });
    const insights = buildAttentionInsights({ rows: [r], statements: [], today: TODAY, cardsById });
    expect(insights.some((i) => i.id === "overdue")).toBe(false);
  });

  it("relata contas diretas atrasadas com total", () => {
    const a = row({ key: "a", item: item({ id: "a", kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-05", amountBrl: 228.99 });
    const b = row({ key: "b", item: item({ id: "b", kind: "expense", payment_method: "Boleto" }), dueDate: "2026-08-10", amountBrl: 100 });
    const insights = buildAttentionInsights({ rows: [a, b], statements: [], today: TODAY, cardsById });
    const overdue = insights.find((i) => i.id === "overdue");
    expect(overdue?.title).toBe(`2 pagamentos atrasados · ${formatBRL(328.99)}`);
  });
});

describe("separação por domínio", () => {
  it("cobrança de cartão não é pagamento direto", () => {
    const itau = card({ id: "card-itau" });
    const direct = row({ item: item({ kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-20" });
    const onCard = row({
      item: item({ kind: "expense", card_item_id: itau.id }),
      cardItemId: itau.id,
      chargeDate: "2026-08-01",
    });
    expect(isDirectPayableRow(direct)).toBe(true);
    expect(isDirectPayableRow(onCard)).toBe(false);
  });

  it("ferramenta paga diretamente É uma obrigação da fila de pagamentos", () => {
    const tool = row({ item: item({ kind: "tool", payment_method: "Pix" }), dueDate: "2026-08-10" });
    expect(isSubscriptionsDomainItem(tool.item)).toBe(true);
    expect(isDirectPayableRow(tool)).toBe(true);
  });

  it("recurso incluído em pacote não é pagamento", () => {
    const included = row({ item: item({ kind: "included_resource" }), dueDate: "2026-08-10" });
    expect(isDirectPayableRow(included)).toBe(false);
  });
});

describe("atenção = somente exceções", () => {
  const itau = card();
  const cardsById = new Map([[itau.id, itau]]);

  it("unifica atrasos diretos de qualquer kind em um único alerta", () => {
    const conta = row({ key: "a", item: item({ id: "a", kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-05", amountBrl: 100 });
    const ferramenta = row({ key: "b", item: item({ id: "b", kind: "tool", payment_method: "Boleto" }), dueDate: "2026-08-06", amountBrl: 50 });
    const insights = buildAttentionInsights({ rows: [conta, ferramenta], statements: [], today: TODAY, cardsById });
    expect(insights.filter((i) => i.id.startsWith("overdue"))).toHaveLength(1);
    const overdue = insights.find((i) => i.id === "overdue");
    expect(overdue?.title).toBe(`2 pagamentos atrasados · ${formatBRL(150)}`);
    expect(overdue?.domain).toBe("accounts");
  });

  it("próximo vencimento normal não é mais um alerta", () => {
    const futura = row({ item: item({ kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-30" });
    const insights = buildAttentionInsights({ rows: [futura], statements: [], today: TODAY, cardsById });
    expect(insights.some((i) => i.id === "next-direct")).toBe(false);
    expect(insights).toHaveLength(0);
  });

  it("fatura a vencer não é exceção; somente fatura atrasada", () => {
    const itau = card();
    const byId = new Map([[itau.id, itau]]);
    const base = {
      card: itau, statementRow: null, components: [], projectedTotal: 100,
      actualTotal: null, difference: null, configIncomplete: false,
      incompleteReason: null, closingDate: "2026-08-10", paid: false,
    };
    const soon: any[] = [{ ...base, dueDate: "2026-08-28" }];
    expect(
      buildAttentionInsights({ rows: [], statements: soon, today: TODAY, cardsById: byId }),
    ).toHaveLength(0);

    const late: any[] = [{ ...base, dueDate: "2026-08-10" }];
    const insights = buildAttentionInsights({ rows: [], statements: late, today: TODAY, cardsById: byId });
    expect(insights.map((i) => i.id)).toEqual([`statement-overdue-${itau.id}`]);
  });
});

describe("fila de próximos pagamentos", () => {
  const itau = card();
  const cardsById = new Map([[itau.id, itau]]);

  it("une contas diretas e faturas, ordenadas por vencimento, sem componentes do cartão", () => {
    const conta = row({ key: "c", item: item({ id: "c", kind: "expense", name: "CPFL", payment_method: "Pix" }), dueDate: "2026-08-26", amountBrl: 167.05 });
    const ferramentaDireta = row({ key: "t", item: item({ id: "t", kind: "tool", name: "Adobe", payment_method: "Boleto" }), dueDate: "2026-08-25", amountBrl: 300 });
    const componente = row({ key: "g", item: item({ id: "g", kind: "tool", name: "Google Drive", card_item_id: itau.id }), cardItemId: itau.id, chargeDate: "2026-08-25", projected: true });
    const statements: any[] = [
      { card: itau, statementRow: null, components: [], projectedTotal: 3809.25, actualTotal: null, difference: null, configIncomplete: false, incompleteReason: null, dueDate: "2026-08-28", closingDate: "2026-08-10", paid: false },
    ];
    const queue = buildPaymentQueue({ rows: [conta, ferramentaDireta, componente], statements, today: TODAY, cardsById });
    expect(queue.map((e) => e.name)).toEqual(["Adobe", "CPFL", "Itaú ••••7587"]);
    expect(queue.map((e) => e.label)).toEqual(["Conta", "Conta", "Fatura"]);
    expect(queue.some((e) => e.name === "Google Drive")).toBe(false);
  });

  it("atrasados ficam fora da fila por padrão", () => {
    const atrasada = row({ item: item({ kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-01" });
    expect(buildPaymentQueue({ rows: [atrasada], statements: [], today: TODAY, cardsById })).toHaveLength(0);
    expect(
      buildPaymentQueue({ rows: [atrasada], statements: [], today: TODAY, cardsById, includeOverdue: true }),
    ).toHaveLength(1);
  });

  it("fatura paga não entra na fila", () => {
    const statements: any[] = [
      { card: itau, statementRow: null, components: [], projectedTotal: 100, actualTotal: 100, difference: 0, configIncomplete: false, incompleteReason: null, dueDate: "2026-08-28", closingDate: null, paid: true },
    ];
    expect(buildPaymentQueue({ rows: [], statements, today: TODAY, cardsById })).toHaveLength(0);
  });
});

describe("rótulo do valor da fatura", () => {
  const itau = card();
  const base = { card: itau, statementRow: null, components: [], difference: null, incompleteReason: null, dueDate: null, closingDate: null, paid: false };

  it("occurrence real vira Fatura", () => {
    const label = statementValueLabel({ ...base, projectedTotal: 90, actualTotal: 3809.25, configIncomplete: false } as any);
    expect(label.label).toBe("Fatura");
    expect(label.value).toBe(3809.25);
  });

  it("ciclo completo sem occurrence vira Projeção da fatura", () => {
    const label = statementValueLabel({ ...base, projectedTotal: 90, actualTotal: null, configIncomplete: false } as any);
    expect(label.label).toBe("Projeção da fatura");
  });

  it("ciclo incompleto nunca chama a soma de fatura em aberto", () => {
    const incomplete = card({ statement_closing_day: null, statement_due_day: null });
    const label = statementValueLabel({ ...base, card: incomplete, projectedTotal: 93.45, actualTotal: null, configIncomplete: true } as any);
    expect(label.label).toBe("Cobranças conhecidas");
    expect(label.hint).toContain("Projeção indisponível");

    const empty = statementValueLabel({ ...base, card: incomplete, projectedTotal: 0, actualTotal: null, configIncomplete: true } as any);
    expect(empty.label).toBe("Projeção indisponível");
    expect(empty.value).toBeNull();
  });
});

describe("composição pago x em aberto", () => {
  it("normaliza percentuais e monta rótulo explícito", () => {
    const c = buildPaidComposition({ paid: 340, open: 660, expected: 1000 });
    expect(c.paidPct).toBe(34);
    expect(c.openPct).toBe(66);
    expect(c.label).toBe("34% pago · 66% em aberto");
    expect(c.hasBase).toBe(true);
  });

  it("clampa valores inconsistentes e sem base", () => {
    expect(buildPaidComposition({ paid: 0, open: 0, expected: 0 }).hasBase).toBe(false);
    const neg = buildPaidComposition({ paid: -50, open: 100, expected: 100 });
    expect(neg.paidPct).toBe(0);
    expect(neg.openPct).toBe(100);
    const only = buildPaidComposition({ paid: 100, open: -10, expected: 100 });
    expect(only.paidPct).toBe(100);
    expect(only.openPct).toBe(0);
  });
});

describe("rótulo contextual da fila de pagamentos", () => {
  it("usa Hoje, Amanhã e data curta", () => {
    expect(queueDateLabel("2026-08-24", "2026-08-24")).toBe("Hoje");
    expect(queueDateLabel("2026-08-25", "2026-08-24")).toBe("Amanhã");
    expect(queueDateLabel("2026-08-30", "2026-08-24")).toBe("30 ago");
    expect(queueDateLabel(null, "2026-08-24")).toBe("—");
  });
});
