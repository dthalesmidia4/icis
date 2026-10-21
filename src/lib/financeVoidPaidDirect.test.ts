import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  VOID_CONFIRMATION_TEXT,
  canVoidPaidDirectOccurrence,
  voidConfirmationValid,
  voidReasonValid,
} from "./financeVoidPaidDirect";
import type { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";

const item = (over: Partial<FinanceItem> = {}) =>
  ({
    id: "i1",
    kind: "expense",
    recurrence_type: "monthly",
    category: null,
    cost_center: "midia",
    name: "Energia",
    ...over,
  }) as FinanceItem;

/** Fato direto pago, já persistido — o único caso anulado pelo servidor. */
const paidOcc = (over: Partial<FinanceOccurrence> = {}) =>
  ({
    id: "o1",
    item_id: "i1",
    competence_month: "2026-10-01",
    currency: "BRL",
    entry_role: "regular",
    paid_at: "2026-10-05T12:00:00Z",
    ...over,
  }) as FinanceOccurrence;

const row = (over: Partial<MonthRow> = {}) =>
  ({
    key: "k",
    item: item(),
    occurrence: paidOcc(),
    projected: false,
    paid: true,
    currency: "BRL",
    cardItemId: null,
    paymentMethod: "Pix",
    entryRole: "regular",
    supplemental: false,
    ...over,
  }) as unknown as MonthRow;

describe("anulação auditada de lançamento direto pago", () => {
  it("fato direto pago e persistido pode ser anulado", () => {
    expect(canVoidPaidDirectOccurrence(row())).toBe(true);
    expect(canVoidPaidDirectOccurrence(row({ paymentMethod: "Boleto" }))).toBe(true);
  });

  it("projeção sem fato no banco não tem o que anular", () => {
    expect(canVoidPaidDirectOccurrence(row({ occurrence: null, projected: true }))).toBe(false);
    expect(canVoidPaidDirectOccurrence(null)).toBe(false);
  });

  it("lançamento em aberto (sem paid_at) não é anulado — é só editar", () => {
    expect(canVoidPaidDirectOccurrence(row({ occurrence: paidOcc({ paid_at: null }) }))).toBe(false);
  });

  it("fato já ignorado/anulado não é anulado de novo", () => {
    expect(
      canVoidPaidDirectOccurrence(
        row({ occurrence: paidOcc({ skipped_at: "2026-10-06T12:00:00Z" }) }),
      ),
    ).toBe(false);
  });

  it("cartão interno, externo ou método cartão nunca entram aqui", () => {
    expect(canVoidPaidDirectOccurrence(row({ cardItemId: "card-1" }))).toBe(false);
    expect(canVoidPaidDirectOccurrence(row({ paymentMethod: "Cartão de Crédito" }))).toBe(false);
    expect(canVoidPaidDirectOccurrence(row({ paymentMethod: "Cartão externo" }))).toBe(false);
    expect(
      canVoidPaidDirectOccurrence(row({ occurrence: paidOcc({ card_item_id_snapshot: "card-1" }) })),
    ).toBe(false);
  });

  it("fatura de cartão e recarga/extra ficam de fora", () => {
    expect(canVoidPaidDirectOccurrence(row({ item: item({ kind: "card" }) }))).toBe(false);
    expect(
      canVoidPaidDirectOccurrence(
        row({ occurrence: paidOcc({ statement_occurrence_id: "st-1" }) }),
      ),
    ).toBe(false);
    expect(
      canVoidPaidDirectOccurrence(row({ occurrence: paidOcc({ entry_role: "recharge" }) })),
    ).toBe(false);
    expect(canVoidPaidDirectOccurrence(row({ occurrence: paidOcc({ entry_role: "extra" }) }))).toBe(
      false,
    );
  });

  it("motivo: 10 a 500 caracteres, espaços não contam", () => {
    expect(voidReasonValid("Pix pago em duplicidade")).toBe(true);
    expect(voidReasonValid("   pago em duplicidade   ")).toBe(true);
    expect(voidReasonValid("pago duas vezes")).toBe(false); // 15 caracteres? não: 15 -> true
  });

  it("motivo curto ou vazio é recusado", () => {
    expect(voidReasonValid("")).toBe(false);
    expect(voidReasonValid("   ")).toBe(false);
    expect(voidReasonValid("pago")).toBe(false);
    expect(voidReasonValid(null)).toBe(false);
    expect(voidReasonValid("x".repeat(501))).toBe(false);
    expect(voidReasonValid("x".repeat(500))).toBe(true);
  });

  it("confirmação exige o literal ANULAR, em qualquer caixa", () => {
    expect(VOID_CONFIRMATION_TEXT).toBe("ANULAR");
    expect(voidConfirmationValid("ANULAR")).toBe(true);
    expect(voidConfirmationValid("anular")).toBe(true);
    expect(voidConfirmationValid("  Anular  ")).toBe(true);
    expect(voidConfirmationValid("SIM")).toBe(false);
    expect(voidConfirmationValid("")).toBe(false);
    expect(voidConfirmationValid(null)).toBe(false);
  });

  it("o cliente só chama a RPC segura — nunca apaga a linha localmente", () => {
    const hook = readFileSync("src/hooks/useFinance.tsx", "utf8");
    expect(hook).toContain("finance_void_paid_direct_occurrence");
    expect(hook).toContain("_confirmation: VOID_CONFIRMATION_TEXT");
    const modal = readFileSync("src/components/finance/FinanceOccurrenceModal.tsx", "utf8");
    expect(modal).not.toMatch(/\.from\("finance_occurrences"\)\s*\.\s*delete/);
  });
});
