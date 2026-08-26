import { describe, expect, it } from "vitest";
import {
  applyUsdEdit,
  brlFromUsd,
  rateFromBrl,
  resolveUsdNumbers,
  seedUsdConversion,
} from "./financeUsdConversion";

describe("conversão USD bidirecional", () => {
  it("editar o câmbio recalcula os reais", () => {
    const next = applyUsdEdit({ original: "20", rate: "5", brl: "100.00" }, "rate", "5,13");
    expect(next.brl).toBe("102.60");
    expect(next.rate).toBe("5,13");
  });

  it("editar os reais recalcula o câmbio", () => {
    const next = applyUsdEdit({ original: "66.5", rate: "5.13", brl: "" }, "brl", "341,15");
    expect(next.rate).toBe("5.130075");
    expect(next.brl).toBe("341,15");
  });

  it("editar o dólar recalcula os reais com o câmbio atual", () => {
    const next = applyUsdEdit({ original: "20", rate: "5.13", brl: "102.60" }, "original", "30");
    expect(next.brl).toBe("153.90");
  });

  it("valor inválido ou vazio nunca inventa número", () => {
    const empty = applyUsdEdit({ original: "", rate: "5", brl: "" }, "original", "");
    expect(empty.brl).toBe("");
    const zero = applyUsdEdit({ original: "0", rate: "", brl: "100" }, "brl", "100");
    expect(zero.rate).toBe("");
    const junk = applyUsdEdit({ original: "20", rate: "5", brl: "100" }, "rate", "abc");
    expect(junk.brl).toBe("100");
  });

  it("não há loop: o campo editado volta literal", () => {
    let state = seedUsdConversion({ original: 66.5, rate: 5.13, brl: null });
    expect(state.brl).toBe("341.14");
    state = applyUsdEdit(state, "brl", "341,1");
    expect(state.brl).toBe("341,1");
    state = applyUsdEdit(state, "brl", "341,15");
    expect(state.brl).toBe("341,15");
  });

  it("valores finais priorizam o real digitado", () => {
    const numbers = resolveUsdNumbers({ original: "66.5", rate: "5.13", brl: "350,00" });
    expect(numbers.amountBrl).toBe(350);
    expect(numbers.exchangeRate).toBe(5.263158);
  });

  it("helpers puros protegem contra divisão por zero", () => {
    expect(brlFromUsd(10, null)).toBeNull();
    expect(rateFromBrl(100, 0)).toBeNull();
  });

  it("BRL puro é preservado (sem câmbio)", () => {
    const numbers = resolveUsdNumbers({ original: "150", rate: "", brl: "" });
    expect(numbers.amountOriginal).toBe(150);
    expect(numbers.amountBrl).toBeNull();
  });
});
