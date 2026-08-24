import { describe, expect, it } from "vitest";
import { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";
import {
  buildAttentionInsights,
  isCardCharge,
  isDirectObligation,
  resolveRowStatus,
  whenLabel,
  isAccountsDomainRow,
  isSubscriptionsDomainItem,
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

  it("componente ligado a fatura paga mostra Fatura paga", () => {
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
    expect(status.label).toBe("Fatura paga");
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
    expect(overdue?.title).toBe("2 contas estão atrasadas");
    expect(overdue?.detail).toContain("328,99");
  });
});

describe("separação por domínio", () => {
  it("cobrança de cartão não pertence a Contas a pagar", () => {
    const itau = card({ id: "card-itau" });
    const direct = row({ item: item({ kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-20" });
    const onCard = row({
      item: item({ kind: "expense", card_item_id: itau.id }),
      cardItemId: itau.id,
      chargeDate: "2026-08-01",
    });
    expect(isAccountsDomainRow(direct)).toBe(true);
    expect(isAccountsDomainRow(onCard)).toBe(false);
  });

  it("ferramentas e pacotes ficam em Assinaturas, nunca em Contas a pagar", () => {
    const tool = row({ item: item({ kind: "tool", payment_method: "Pix" }), dueDate: "2026-08-10" });
    expect(isSubscriptionsDomainItem(tool.item)).toBe(true);
    expect(isAccountsDomainRow(tool)).toBe(false);
  });

  it("cada alerta declara o domínio de destino", () => {
    const incomplete = card({ id: "c1", statement_closing_day: null, statement_due_day: null });
    const late = row({ item: item({ kind: "expense", payment_method: "Pix" }), dueDate: "2026-08-01" });
    const insights = buildAttentionInsights({
      rows: [late],
      statements: [],
      today: TODAY,
      cardsById: new Map([[incomplete.id, incomplete]]),
    });
    expect(insights.find((i) => i.id === "overdue")?.domain).toBe("accounts");
  });
});
