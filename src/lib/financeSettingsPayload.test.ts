import { describe, it, expect } from "vitest";
import { financeSettingsRpcPayload } from "./financeSettingsPayload";

describe("financeSettingsRpcPayload — semântica de null", () => {
  it("orçamento null é enviado como null, nunca como zero", () => {
    const p = financeSettingsRpcPayload("t1", { monthlyBudgetBrl: null, defaultUsdRate: 5.4 });
    expect(p._monthly_budget_brl).toBeNull();
  });

  it("câmbio null é enviado como null (zero seria inválido)", () => {
    const p = financeSettingsRpcPayload("t1", { monthlyBudgetBrl: 1000, defaultUsdRate: null });
    expect(p._default_usd_rate).toBeNull();
  });

  it("valores definidos passam intactos", () => {
    expect(financeSettingsRpcPayload("t1", { monthlyBudgetBrl: 0, defaultUsdRate: 5.42 })).toEqual({
      _tenant_id: "t1",
      _monthly_budget_brl: 0,
      _default_usd_rate: 5.42,
    });
  });
});
