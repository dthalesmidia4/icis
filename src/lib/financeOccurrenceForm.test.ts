/**
 * Regressões do modal de lançamento mensal: contexto informacional, data REAL
 * do pagamento (retroativa e reversível) e bloqueio de salvamento inválido.
 */
import { describe, expect, it } from "vitest";
import type { FinanceItem, FinanceOccurrence, MonthRow } from "./financeModel";
import {
  canSubmitOccurrence,
  competenceLongLabel,
  initialPaymentDate,
  occurrenceContextLine,
  paymentStatusMessage,
  persistedPaymentDate,
} from "./financeOccurrenceForm";
import { buildOccurrencePatch, resolvePaidAtTimestamp } from "./financeOccurrencePatch";

const item = (over: Partial<FinanceItem> = {}) =>
  ({
    id: "item-1",
    name: "PENDRIVE",
    kind: "tool",
    category: "Ferramenta",
    payment_method: "Pix",
    active: true,
    ...over,
  }) as unknown as FinanceItem;

const row = (over: Partial<MonthRow> = {}): MonthRow =>
  ({
    item: item(),
    currency: "BRL",
    amountBrl: 100,
    amountOriginal: 100,
    exchangeRate: null,
    dueDate: "2026-08-05",
    chargeDate: null,
    paid: false,
    projected: false,
    occurrence: null,
    ...over,
  }) as unknown as MonthRow;

const occ = (over: Partial<FinanceOccurrence> = {}) =>
  ({
    id: "occ-1",
    competence_month: "2026-08-01",
    paid_at: null,
    ...over,
  }) as unknown as FinanceOccurrence;

describe("competenceLongLabel", () => {
  it("descreve a competência por extenso", () => {
    expect(competenceLongLabel("2026-08-01")).toBe("Agosto 2026");
  });

  it("não inventa rótulo sem competência", () => {
    expect(competenceLongLabel(null)).toBeNull();
  });
});

describe("occurrenceContextLine", () => {
  it("usa a competência do fato quando ela existe", () => {
    const line = occurrenceContextLine(
      row({ occurrence: occ({ competence_month: "2026-07-01" }) }),
      "2026-08-01",
    );
    expect(line).toContain("Julho 2026");
  });

  it("cai na competência da tela quando o fato ainda não existe", () => {
    expect(occurrenceContextLine(row(), "2026-08-01")).toContain("Agosto 2026");
  });
});

describe("data real do pagamento", () => {
  it("lê o dia civil do paid_at já salvo (caso PENDRIVE, 07/08)", () => {
    const r = row({ paid: true, occurrence: occ({ paid_at: "2026-08-07T12:00:00-03:00" }) });
    expect(persistedPaymentDate(r)).toBe("2026-08-07");
    expect(initialPaymentDate(r, "2026-08-28")).toBe("2026-08-07");
  });

  it("propõe hoje quando nunca houve pagamento", () => {
    expect(initialPaymentDate(row(), "2026-08-28")).toBe("2026-08-28");
  });

  it("preserva o timestamp original quando o dia não mudou", () => {
    expect(
      resolvePaidAtTimestamp({
        existingPaidAt: "2026-08-07T15:32:10-03:00",
        paymentDate: "2026-08-07",
      }),
    ).toBe("2026-08-07T15:32:10-03:00");
  });

  it("grava a data escolhida com dia civil estável em SP", () => {
    expect(
      resolvePaidAtTimestamp({
        existingPaidAt: "2026-08-07T15:32:10-03:00",
        paymentDate: "2026-08-20",
      }),
    ).toBe("2026-08-20T12:00:00-03:00");
  });
});

describe("paymentStatusMessage", () => {
  it("mostra pago com a data quando o fato está fechado", () => {
    const s = paymentStatusMessage({
      cardRow: false,
      persistedPaymentDate: "2026-08-24",
      paid: true,
      paymentDate: "2026-08-24",
    });
    expect(s.label).toBe("Pago em 24 ago");
    expect(s.tone).toBe("success");
    expect(s.pendingNote).toBeNull();
  });

  it("avisa que desmarcar reabrirá o fato ao salvar", () => {
    const s = paymentStatusMessage({
      cardRow: false,
      persistedPaymentDate: "2026-08-24",
      paid: false,
      paymentDate: "2026-08-24",
    });
    expect(s.pendingNote).toContain("em aberto");
    expect(s.tone).toBe("warning");
  });

  it("anuncia o pagamento pendente de salvar", () => {
    const s = paymentStatusMessage({
      cardRow: false,
      persistedPaymentDate: null,
      paid: true,
      paymentDate: "2026-08-20",
    });
    expect(s.label).toBe("Em aberto");
    expect(s.pendingNote).toContain("20 ago");
  });

  it("compra no cartão nunca tem pagamento próprio", () => {
    const s = paymentStatusMessage({
      cardRow: true,
      cardStatusLabel: "Pago pela fatura em 20 ago",
      persistedPaymentDate: null,
      paid: false,
      paymentDate: "",
    });
    expect(s.label).toBe("Pago pela fatura em 20 ago");
    expect(s.pendingNote).toBeNull();
  });
});

describe("canSubmitOccurrence", () => {
  it("exige data válida para marcar pago", () => {
    expect(canSubmitOccurrence({ cardRow: false, paid: true, paymentDate: "" })).toBe(false);
    expect(canSubmitOccurrence({ cardRow: false, paid: true, paymentDate: "2026-02-31" })).toBe(false);
    expect(canSubmitOccurrence({ cardRow: false, paid: true, paymentDate: "2026-08-20" })).toBe(true);
  });

  it("não exige nada de compra no cartão nem de fato em aberto", () => {
    expect(canSubmitOccurrence({ cardRow: true, paid: false, paymentDate: "" })).toBe(true);
    expect(canSubmitOccurrence({ cardRow: false, paid: false, paymentDate: "" })).toBe(true);
  });
});

describe("buildOccurrencePatch com data escolhida", () => {
  it("usa a data retroativa informada", () => {
    const patch = buildOccurrencePatch({
      row: row(),
      cardRow: false,
      factDate: "2026-08-05",
      amountOriginal: 100,
      amountBrl: 100,
      exchangeRate: null,
      paid: true,
      paymentDate: "2026-08-07",
      observations: "",
      attachmentUrl: null,
      attachmentName: null,
      originPatch: {},
      nowISO: "2026-08-28T10:00:00Z",
    });
    expect(patch.paid_at).toBe("2026-08-07T12:00:00-03:00");
    expect(patch.paid_amount_brl).toBe(100);
  });

  it("compra no cartão nunca grava paid_at nem due_date", () => {
    const patch = buildOccurrencePatch({
      row: row({ chargeDate: "2026-08-12", dueDate: null }),
      cardRow: true,
      factDate: "2026-08-12",
      amountOriginal: 100,
      amountBrl: 100,
      exchangeRate: null,
      paid: true,
      paymentDate: "2026-08-07",
      observations: "",
      attachmentUrl: null,
      attachmentName: null,
      originPatch: {},
    });
    expect(patch.paid_at).toBeUndefined();
    expect(patch.due_date).toBeNull();
    expect(patch.charge_date).toBe("2026-08-12");
  });
});
