import { describe, expect, it } from "vitest";
import { parseDayOfMonth, parseLocalizedNumber, parsePositiveInt } from "./financeNumber";
import { FinanceItem, matchesRecurrenceInterval } from "./financeModel";

describe("parseLocalizedNumber", () => {
  it("lê o padrão brasileiro", () => {
    expect(parseLocalizedNumber("1.728,02")).toBe(1728.02);
    expect(parseLocalizedNumber("1728,02")).toBe(1728.02);
    expect(parseLocalizedNumber("0,5")).toBe(0.5);
  });

  it("lê o padrão americano sem corromper o valor", () => {
    expect(parseLocalizedNumber("1,728.02")).toBe(1728.02);
    expect(parseLocalizedNumber("12,500.00")).toBe(12500);
  });

  it("trata ponto isolado com o formato correto", () => {
    expect(parseLocalizedNumber("5.13")).toBe(5.13);
    expect(parseLocalizedNumber("1.728")).toBe(1728);
    expect(parseLocalizedNumber("12.500.000")).toBe(12500000);
  });

  it("ignora símbolos de moeda e espaços", () => {
    expect(parseLocalizedNumber("R$ 1.200,50")).toBe(1200.5);
    expect(parseLocalizedNumber("US$ 20")).toBe(20);
  });

  it("devolve null para entrada vazia ou inválida", () => {
    expect(parseLocalizedNumber("")).toBeNull();
    expect(parseLocalizedNumber("  ")).toBeNull();
    expect(parseLocalizedNumber("abc")).toBeNull();
    expect(parseLocalizedNumber(null)).toBeNull();
  });

  it("valida inteiros e dias", () => {
    expect(parsePositiveInt("12")).toBe(12);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parseDayOfMonth("31")).toBe(31);
    expect(parseDayOfMonth("32")).toBeNull();
  });
});

const base: FinanceItem = {
  id: "i1",
  kind: "tool",
  name: "Ferramenta",
  cost_center: "administrativo",
  active: true,
  currency: "BRL",
  recurrence_type: "monthly",
};

describe("matchesRecurrenceInterval", () => {
  it("intervalo 1 sempre aparece", () => {
    expect(matchesRecurrenceInterval(base, { year: 2026, month: 3 })).toBe(true);
  });

  it("a cada 2 meses conta da âncora", () => {
    const item = { ...base, recurrence_interval_months: 2, recurrence_start_date: "2026-01-10" };
    expect(matchesRecurrenceInterval(item, { year: 2026, month: 1 })).toBe(true);
    expect(matchesRecurrenceInterval(item, { year: 2026, month: 2 })).toBe(false);
    expect(matchesRecurrenceInterval(item, { year: 2026, month: 3 })).toBe(true);
  });

  it("não aparece antes da âncora", () => {
    const item = { ...base, recurrence_interval_months: 3, recurrence_start_date: "2026-05-01" };
    expect(matchesRecurrenceInterval(item, { year: 2026, month: 4 })).toBe(false);
    expect(matchesRecurrenceInterval(item, { year: 2026, month: 8 })).toBe(true);
  });

  it("sem âncora não desaparece silenciosamente", () => {
    const item = { ...base, recurrence_interval_months: 4 };
    expect(matchesRecurrenceInterval(item, { year: 2026, month: 7 })).toBe(true);
  });
});
