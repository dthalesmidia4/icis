import { describe, it, expect } from "vitest";
import {
  CHARGE_AFTER_DUE_MESSAGE,
  chargeDueConflictMessage,
  itemDueDayIsMeaningless,
  resolveRecurrenceIntervals,
} from "./financeItemPayload";

describe("resolveRecurrenceIntervals", () => {
  it("mensal comum mantém intervalo 1 em ambas as colunas", () => {
    expect(
      resolveRecurrenceIntervals({
        isRecurring: true,
        frequency: "monthly",
        intervalMonths: null,
        subInterval: null,
      }),
    ).toEqual({ recurrence_interval: 1, recurrence_interval_months: 1 });
  });

  it("não recorrente (avulso/parcelado) nunca gera null", () => {
    const out = resolveRecurrenceIntervals({
      isRecurring: false,
      frequency: "monthly",
      intervalMonths: null,
      subInterval: null,
    });
    expect(out.recurrence_interval).toBe(1);
    expect(out.recurrence_interval_months).toBe(1);
  });

  it("custom mensal preserva o intervalo em meses e espelha no genérico", () => {
    expect(
      resolveRecurrenceIntervals({
        isRecurring: true,
        frequency: "custom",
        intervalMonths: 3,
        subInterval: 1,
      }),
    ).toEqual({ recurrence_interval: 3, recurrence_interval_months: 3 });
  });

  it("daily/weekly preservam o intervalo genérico", () => {
    expect(
      resolveRecurrenceIntervals({
        isRecurring: true,
        frequency: "daily",
        intervalMonths: null,
        subInterval: 2,
      }),
    ).toEqual({ recurrence_interval: 2, recurrence_interval_months: 1 });
    expect(
      resolveRecurrenceIntervals({
        isRecurring: true,
        frequency: "weekly",
        intervalMonths: null,
        subInterval: 4,
      }).recurrence_interval,
    ).toBe(4);
  });

  it("valores inválidos caem para 1 em vez de null/0", () => {
    expect(
      resolveRecurrenceIntervals({
        isRecurring: true,
        frequency: "daily",
        intervalMonths: null,
        subInterval: 0,
      }).recurrence_interval,
    ).toBe(1);
  });
});

describe("due_day em item de cartão", () => {
  it("é sem sentido quando há cartão selecionado", () => {
    expect(itemDueDayIsMeaningless(true, true)).toBe(true);
    expect(itemDueDayIsMeaningless(true, false)).toBe(false);
    expect(itemDueDayIsMeaningless(false, false)).toBe(false);
  });
});

describe("chargeDueConflictMessage", () => {
  it("bloqueia pagamento direto com cobrança 25 e vencimento 10", () => {
    expect(
      chargeDueConflictMessage({ onCard: false, cardSelected: false, chargeDay: 25, dueDay: 10 }),
    ).toBe(CHARGE_AFTER_DUE_MESSAGE);
  });

  it("permite cobrança vazia com vencimento 10", () => {
    expect(
      chargeDueConflictMessage({ onCard: false, cardSelected: false, chargeDay: null, dueDay: 10 }),
    ).toBeNull();
  });

  it("permite due >= charge", () => {
    expect(
      chargeDueConflictMessage({ onCard: false, cardSelected: false, chargeDay: 10, dueDay: 25 }),
    ).toBeNull();
  });

  it("não compara nada em item cobrado no cartão", () => {
    expect(
      chargeDueConflictMessage({ onCard: true, cardSelected: true, chargeDay: 25, dueDay: 10 }),
    ).toBeNull();
  });
});
