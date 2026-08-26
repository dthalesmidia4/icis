import { describe, it, expect } from "vitest";
import {
  buildFactCorrectionPatch,
  correctionWasApplied,
  factFieldsEditable,
  isLegacyDirectPaymentOnCard,
  occurrenceSaveRoute,
  paymentProofEditable,
} from "./financeFactCorrection";
import type { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";

const item = (over: Partial<FinanceItem> = {}): FinanceItem =>
  ({
    id: "item-1",
    tenant_id: "t",
    kind: "expense",
    name: "CROPY",
    active: true,
    currency: "BRL",
    recurrence_type: "one_off",
    ...over,
  }) as FinanceItem;

const occ = (over: Partial<FinanceOccurrence> = {}): FinanceOccurrence =>
  ({
    id: "occ-1",
    tenant_id: "t",
    item_id: "item-1",
    competence_month: "2026-08-01",
    currency: "BRL",
    ...over,
  }) as FinanceOccurrence;

const row = (over: Partial<MonthRow> = {}): MonthRow =>
  ({
    key: "k",
    item: item(),
    occurrence: occ(),
    currency: "BRL",
    paid: false,
    projected: false,
    ...over,
  }) as MonthRow;

describe("permissões independentes (fato x prova de pagamento)", () => {
  it("pagamento direto pago: fatos abertos no primeiro render, prova travada", () => {
    expect(factFieldsEditable({ statementRow: false })).toBe(true);
    expect(paymentProofEditable({ cardRow: false, statementRow: false, closed: true })).toBe(false);
  });

  it("componente de cartão pago: fatos abertos, prova nunca é daqui", () => {
    expect(factFieldsEditable({ statementRow: false })).toBe(true);
    expect(paymentProofEditable({ cardRow: true, statementRow: false, closed: false })).toBe(false);
  });

  it("fatura paga continua travada", () => {
    expect(factFieldsEditable({ statementRow: true })).toBe(false);
    expect(paymentProofEditable({ cardRow: false, statementRow: true, closed: true })).toBe(false);
  });

  it("fato aberto e direto pode registrar pagamento", () => {
    expect(paymentProofEditable({ cardRow: false, statementRow: false, closed: false })).toBe(true);
  });
});

describe("occurrenceSaveRoute", () => {
  const base = { statementRow: false, hasOccurrence: true, closed: false, legacyDirectOnCard: false, factDate: "2026-08-05" };

  it("fato aberto salva pelo caminho normal", () => {
    expect(occurrenceSaveRoute(base)).toBe("normal");
  });

  it("fato fechado vai automaticamente para a correção segura", () => {
    expect(occurrenceSaveRoute({ ...base, closed: true })).toBe("correction");
  });

  it("híbrido com data digitada converte antes de corrigir", () => {
    expect(occurrenceSaveRoute({ ...base, closed: true, legacyDirectOnCard: true })).toBe(
      "convert_then_correct",
    );
  });

  it("híbrido sem data real não inventa conversão", () => {
    expect(
      occurrenceSaveRoute({ ...base, closed: true, legacyDirectOnCard: true, factDate: "" }),
    ).toBe("correction");
  });

  it("fatura não salva por aqui", () => {
    expect(occurrenceSaveRoute({ ...base, statementRow: true, closed: true })).toBe("blocked");
  });

  it("linha fechada sem ocorrência real materializa normalmente", () => {
    expect(occurrenceSaveRoute({ ...base, closed: true, hasOccurrence: false })).toBe("normal");
  });
});

describe("buildFactCorrectionPatch", () => {
  const base = {
    currency: "BRL" as const,
    amountOriginal: 17.5,
    amountBrl: 17.5,
    exchangeRate: null,
    factDate: "2026-08-05",
    observations: " ajuste ",
    paymentMethodSnapshot: null,
    cardItemIdSnapshot: null,
  };

  it("pagamento direto corrige o vencimento e nunca o pagamento", () => {
    const patch = buildFactCorrectionPatch({ ...base, cardRow: false });
    expect(patch.due_date).toBe("2026-08-05");
    expect(patch).not.toHaveProperty("charge_date");
    expect(patch).not.toHaveProperty("paid_at");
    expect(patch).not.toHaveProperty("paid_amount_brl");
    expect(patch).not.toHaveProperty("scheduled_date");
    expect(patch).not.toHaveProperty("competence_month");
    expect(patch).not.toHaveProperty("item_id");
    expect(patch.observations).toBe("ajuste");
    expect(patch.amount_brl).toBe(17.5);
  });

  it("componente de cartão corrige a cobrança", () => {
    const patch = buildFactCorrectionPatch({ ...base, cardRow: true });
    expect(patch.charge_date).toBe("2026-08-05");
    expect(patch).not.toHaveProperty("due_date");
  });

  it("BRL nunca envia câmbio", () => {
    const patch = buildFactCorrectionPatch({ ...base, cardRow: false, exchangeRate: 5.4 });
    expect(patch.exchange_rate).toBeNull();
  });
});

describe("isLegacyDirectPaymentOnCard (caso CROPY)", () => {
  const cropy = row({
    item: item({ payment_method: "Cartão de Crédito", card_item_id: "card-1" }),
    occurrence: occ({ due_date: "2026-07-29", paid_at: "2026-08-25T20:36:59Z", charge_date: null }),
  });

  it("detecta master cartão + fato direto legado sem charge_date", () => {
    expect(isLegacyDirectPaymentOnCard(cropy)).toBe(true);
  });

  it("com charge_date já não é transição incoerente", () => {
    expect(
      isLegacyDirectPaymentOnCard(
        row({ ...cropy, occurrence: occ({ ...cropy.occurrence!, charge_date: "2026-08-05" }) }),
      ),
    ).toBe(false);
  });

  it("snapshot explícito no fato descarta a detecção", () => {
    expect(
      isLegacyDirectPaymentOnCard(
        row({ ...cropy, occurrence: occ({ ...cropy.occurrence!, payment_method_snapshot: "Pix" }) }),
      ),
    ).toBe(false);
  });

  it("sem pagamento direto legado não há nada a converter", () => {
    expect(
      isLegacyDirectPaymentOnCard(
        row({ ...cropy, occurrence: occ({ ...cropy.occurrence!, paid_at: null }) }),
      ),
    ).toBe(false);
  });

  it("cadastro sem cartão não converte", () => {
    expect(isLegacyDirectPaymentOnCard(row({ item: item({ payment_method: "Dinheiro" }) }))).toBe(
      false,
    );
  });
});

describe("correctionWasApplied", () => {
  it("data de cobrança confirmada com due_date limpo", () => {
    const patch = { charge_date: "2026-08-05" };
    expect(correctionWasApplied(patch, occ({ charge_date: "2026-08-05", due_date: null }))).toBe(true);
    expect(
      correctionWasApplied(patch, occ({ charge_date: "2026-07-01", due_date: null })),
    ).toBe(false);
    expect(
      correctionWasApplied(patch, occ({ charge_date: "2026-08-05", due_date: "2026-07-29" })),
    ).toBe(false);
  });

  it("vencimento e observações confirmados", () => {
    expect(
      correctionWasApplied(
        { due_date: "2026-08-17", observations: "ok" },
        occ({ due_date: "2026-08-17", observations: "ok" }),
      ),
    ).toBe(true);
    expect(
      correctionWasApplied({ observations: "ok" }, occ({ observations: null })),
    ).toBe(false);
  });

  it("sem ocorrência recarregada nunca é sucesso", () => {
    expect(correctionWasApplied({ due_date: "2026-08-17" }, null)).toBe(false);
  });
});
