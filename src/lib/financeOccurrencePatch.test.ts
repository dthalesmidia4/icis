import { describe, expect, it } from "vitest";
import { buildOccurrencePatch } from "./financeOccurrencePatch";
import type { MonthRow } from "./financeModel";

const row = {
  key: "r1",
  currency: "BRL",
  chargeDate: null,
  occurrence: null,
} as unknown as MonthRow;

describe("buildOccurrencePatch — cartão externo", () => {
  it("liquida no próprio fato: paid_at na charge_date e paid_amount_brl igual", () => {
    const patch = buildOccurrencePatch({
      row,
      cardRow: true,
      externalCardRow: true,
      factDate: "2026-08-04",
      amountOriginal: null,
      amountBrl: 2112.54,
      exchangeRate: null,
      paid: false,
      observations: "",
      attachmentUrl: null,
      attachmentName: null,
      originPatch: {},
    });
    expect(patch.charge_date).toBe("2026-08-04");
    expect(patch.due_date).toBeNull();
    expect(patch.paid_at).toBe("2026-08-04T12:00:00-03:00");
    expect(patch.paid_amount_brl).toBe(2112.54);
  });

  it("cartão interno continua sem pagamento próprio", () => {
    const patch = buildOccurrencePatch({
      row,
      cardRow: true,
      factDate: "2026-08-04",
      amountOriginal: null,
      amountBrl: 100,
      exchangeRate: null,
      paid: false,
      observations: "",
      attachmentUrl: null,
      attachmentName: null,
      originPatch: {},
    });
    expect(patch.paid_at).toBeUndefined();
    expect(patch.paid_amount_brl).toBeUndefined();
  });
});
