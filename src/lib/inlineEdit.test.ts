import { describe, expect, it } from "vitest";
import {
  inlineCurrencyText,
  inlineDateText,
  inlineNumberText,
  isUnchanged,
  parseInlineCurrency,
  parseInlineDate,
  parseInlineNumber,
  parseInlineSelect,
  parseInlineText,
  validateInlineRange,
} from "./inlineEdit";

describe("edição inline — vazio nunca é zero", () => {
  it("texto vazio grava null", () => {
    expect(parseInlineText("  ")).toEqual({ ok: true, value: null });
    expect(parseInlineText(" Franca ")).toEqual({ ok: true, value: "Franca" });
  });

  it("número e verba vazios gravam null", () => {
    expect(parseInlineNumber("")).toEqual({ ok: true, value: null });
    expect(parseInlineCurrency("")).toEqual({ ok: true, value: null });
  });

  it("mostra `A definir` em vez de zero", () => {
    expect(inlineNumberText(null)).toBe("A definir");
    expect(inlineCurrencyText(null)).toBe("A definir");
    expect(inlineNumberText(0)).toBe("0");
    expect(inlineCurrencyText(0)).toContain("0,00");
  });
});

describe("validações inline", () => {
  it("recusa número negativo e não inteiro", () => {
    expect(parseInlineNumber("-1", { label: "meta" }).ok).toBe(false);
    expect(parseInlineNumber("1,5", { label: "meta" }).ok).toBe(false);
    expect(parseInlineNumber("1,5", { label: "km", allowDecimal: true })).toEqual({
      ok: true,
      value: 1.5,
    });
  });

  it("aceita verba brasileira e recusa negativa", () => {
    expect(parseInlineCurrency("R$ 1.500,50")).toEqual({ ok: true, value: 1500.5 });
    expect(parseInlineCurrency("-10").ok).toBe(false);
    expect(parseInlineCurrency("abc").ok).toBe(false);
  });

  it("valida data e janela invertida", () => {
    expect(parseInlineDate("2026-09-01")).toEqual({ ok: true, value: "2026-09-01" });
    expect(parseInlineDate("01/09/2026").ok).toBe(false);
    expect(validateInlineRange("2026-09-10", "2026-09-01", "período dos anúncios")).toMatch(
      /anúncios/,
    );
    expect(validateInlineRange("2026-09-01", "2026-09-10")).toBeNull();
    expect(validateInlineRange(null, "2026-09-10")).toBeNull();
  });

  it("select só aceita opção conhecida", () => {
    expect(parseInlineSelect("active", ["active", "paused"])).toEqual({ ok: true, value: "active" });
    expect(parseInlineSelect("xpto", ["active"]).ok).toBe(false);
    expect(parseInlineSelect("", ["active"])).toEqual({ ok: true, value: null });
  });
});

describe("apresentação e no-op", () => {
  it("formata data em pt-BR", () => {
    expect(inlineDateText("2026-09-07")).toBe("07/09/2026");
    expect(inlineDateText(null)).toBe("A definir");
  });

  it("não grava quando o valor não mudou", () => {
    expect(isUnchanged(null, null)).toBe(true);
    expect(isUnchanged(undefined, null)).toBe(true);
    expect(isUnchanged(200, 200)).toBe(true);
    expect(isUnchanged(200, 300)).toBe(false);
  });
});
