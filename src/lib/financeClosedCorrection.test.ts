import { describe, it, expect } from "vitest";
import {
  buildClosedCorrectionPatch,
  closedFactMode,
} from "./financeClosedCorrection";

describe("financeClosedCorrection — permissividade seletiva em fatura fechada", () => {
  it("fato aberto segue editável", () => {
    expect(closedFactMode({ cardRow: true, statementRow: false, closed: false })).toBe("editable");
    expect(closedFactMode({ cardRow: false, statementRow: false, closed: false })).toBe("editable");
  });

  it("componente de cartão liquidado permite correção monetária", () => {
    expect(closedFactMode({ cardRow: true, statementRow: false, closed: true })).toBe(
      "card_component_correction",
    );
  });

  it("fatura paga e obrigação direta paga continuam imutáveis", () => {
    expect(closedFactMode({ cardRow: false, statementRow: true, closed: true })).toBe("locked");
    expect(closedFactMode({ cardRow: false, statementRow: false, closed: true })).toBe("locked");
  });

  it("patch de correção toca só valor/câmbio — nunca datas, pagamento ou fatura", () => {
    const patch = buildClosedCorrectionPatch({
      currency: "USD",
      amountOriginal: 25,
      amountBrl: 135.5,
      exchangeRate: 5.42,
    });
    expect(patch).toEqual({
      currency: "USD",
      amount_original: 25,
      exchange_rate: 5.42,
      amount_brl: 135.5,
      is_estimated: false,
    });
    const keys = Object.keys(patch);
    for (const forbidden of [
      "charge_date",
      "due_date",
      "paid_at",
      "paid_amount_brl",
      "statement_occurrence_id",
      "attachment_url",
      "payment_method_snapshot",
      "card_item_id_snapshot",
      "iof_amount_brl",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("correção em BRL nunca grava câmbio", () => {
    expect(
      buildClosedCorrectionPatch({
        currency: "BRL",
        amountOriginal: 90,
        amountBrl: 90,
        exchangeRate: 5.1,
      }).exchange_rate,
    ).toBeNull();
  });
});
