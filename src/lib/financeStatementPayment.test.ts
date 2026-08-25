import { describe, expect, it, vi } from "vitest";
import { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";
import { resolveRowStatus, linkedStatementRow, RowStatusContext } from "./financeRowStatus";
import { financeBackTarget } from "./financeBackTarget";
import {
  isValidPaymentDate,
  paymentDateToTimestamp,
  paymentTimestampToDate,
} from "./financePaymentDate";

const TODAY = "2026-08-25";

function item(over: Partial<FinanceItem> = {}): FinanceItem {
  return {
    id: "item-1",
    kind: "tool",
    name: "Google Cloud",
    cost_center: "midia",
    active: true,
    currency: "BRL",
    recurrence_type: "monthly",
    ...over,
  } as FinanceItem;
}

const CARD_ID = "card-itau";

function cardItem(over: Partial<FinanceItem> = {}): FinanceItem {
  return item({
    id: CARD_ID,
    kind: "card",
    name: "Itaú ••••7587",
    statement_closing_day: 10,
    statement_due_day: 17,
    ...over,
  });
}

function row(over: Partial<MonthRow> = {}): MonthRow {
  return {
    key: "row-1",
    item: item(),
    occurrence: null,
    projected: false,
    amountBrl: 100,
    amountOriginal: 100,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: "2026-08-05",
    dueDate: null,
    paid: false,
    paidAmountBrl: null,
    cardItemId: CARD_ID,
    paymentMethod: "credit_card",
    paymentOverridden: false,
    estimated: false,
    installmentNumber: null,
    installmentCount: null,
    ...over,
  } as MonthRow;
}

function occ(over: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: "occ-1",
    item_id: "item-1",
    competence_month: "2026-08-01",
    currency: "BRL",
    ...over,
  } as FinanceOccurrence;
}

function statementRow(over: Partial<MonthRow> = {}, card: Partial<FinanceItem> = {}): MonthRow {
  return row({
    key: "stmt",
    item: cardItem(card),
    occurrence: occ({ id: "stmt-1", item_id: CARD_ID, competence_month: "2026-08-01", amount_brl: 3809.25 }),
    dueDate: "2026-08-17",
    cardItemId: null,
    paymentMethod: null,
    ...over,
  });
}

function ctx(over: Partial<RowStatusContext> = {}): RowStatusContext {
  return {
    rows: [],
    today: TODAY,
    cardsById: new Map([[CARD_ID, cardItem()]]),
    ...over,
  };
}

describe("financeBackTarget", () => {
  it("volta internamente ao overview em qualquer subview", () => {
    for (const view of ["cards", "accounts", "subscriptions", "settings", "composition"] as const) {
      expect(financeBackTarget(view)).toEqual({ kind: "internal", view: "overview" });
    }
  });

  it("overview sai para a Home", () => {
    expect(financeBackTarget("overview")).toEqual({ kind: "route", to: "/" });
  });

  it("nenhuma subview usa rota (não desmonta o gate de senha)", () => {
    const target = financeBackTarget("cards");
    expect(target.kind).not.toBe("route");
  });
});

describe("status de componente de cartão", () => {
  it("paid=true prevalece mesmo sem link e com cartão sem ciclo", () => {
    const status = resolveRowStatus(
      row({ paid: true, occurrence: occ({ paid_at: "2026-08-20T13:59:50Z" }) }),
      ctx({ cardsById: new Map([[CARD_ID, cardItem({ statement_closing_day: null })]]) }),
    );
    expect(status.kind).toBe("paid");
    expect(status.label).toBe("Pago");
  });

  it("paid_at real => Pago (nunca aguardando fatura)", () => {
    const status = resolveRowStatus(
      row({ paid: true, occurrence: occ({ paid_at: "2026-08-20T13:59:50Z" }) }),
      ctx(),
    );
    expect(status.label).not.toMatch(/[Aa]guardando/);
  });

  it("statement link pago => Fatura paga", () => {
    const stmt = statementRow({ paid: true });
    const component = row({ occurrence: occ({ statement_occurrence_id: "stmt-1" }) });
    const status = resolveRowStatus(component, ctx({ statementRows: [stmt] }));
    expect(status.kind).toBe("card_statement_paid");
    expect(status.label).toBe("Fatura paga");
  });

  it("snapshot de competência + cartão resolve fatura paga sem statement_occurrence_id", () => {
    const stmt = statementRow({ paid: true });
    const component = row({
      occurrence: occ({
        statement_competence_snapshot: "2026-08-01",
        card_item_id_snapshot: CARD_ID,
      }),
    });
    expect(resolveRowStatus(component, ctx({ statementRows: [stmt] })).label).toBe("Fatura paga");
  });

  it("sem link, sem paid e ciclo incompleto => Aguardando dados da fatura", () => {
    const status = resolveRowStatus(
      row({ occurrence: occ() }),
      ctx({ cardsById: new Map([[CARD_ID, cardItem({ statement_closing_day: null })]]) }),
    );
    expect(status.kind).toBe("card_awaiting_statement");
  });

  it("ocorrência real, ciclo completo e sem fatura conhecida => Aguardando vínculo", () => {
    const status = resolveRowStatus(row({ occurrence: occ(), projected: false }), ctx());
    expect(status.kind).toBe("card_unlinked");
  });

  it("fallback nunca associa fatura só por competência (sem snapshot/closing)", () => {
    const stmt = statementRow({ paid: true });
    const component = row({ occurrence: occ() });
    expect(linkedStatementRow(component, [stmt])).toBeNull();
  });
});

describe("data real do pagamento", () => {
  it("mantém o dia civil em São Paulo", () => {
    expect(paymentDateToTimestamp("2026-08-20")).toBe("2026-08-20T12:00:00-03:00");
    expect(paymentTimestampToDate(paymentDateToTimestamp("2026-08-20"))).toBe("2026-08-20");
  });

  it("valida o formato", () => {
    expect(isValidPaymentDate("2026-08-20")).toBe(true);
    expect(isValidPaymentDate("20/08/2026")).toBe(false);
    expect(() => paymentDateToTimestamp("")).toThrow();
  });

  it("payStatement envia _paid_at e nunca due_date", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    // Contrato do payload construído em useFinance.payStatement.
    const payload = {
      _occurrence_id: "stmt-1",
      _paid_at: paymentDateToTimestamp("2026-08-20"),
      _paid_amount_brl: 3809.25,
    };
    await rpc("pay_finance_statement", payload);
    expect(rpc).toHaveBeenCalledWith("pay_finance_statement", payload);
    expect(Object.keys(payload)).not.toContain("_due_date");
    expect(JSON.stringify(payload)).not.toMatch(/due_date/);
  });
});
