import { describe, expect, it } from "vitest";
import {
  adPlanSummary,
  canEditAdPlan,
  isBoosted,
  normalizeAdPlan,
  setAdPlanBoost,
  setAdPlanCampaign,
} from "./adPlan";

describe("normalizeAdPlan", () => {
  it("preserva chaves desconhecidas já salvas", () => {
    const out = normalizeAdPlan({ objective: "Leads", legado_x: 42 });
    expect(out.objective).toBe("Leads");
    expect(out.legado_x).toBe(42);
    expect(out.boost).toBe(false);
  });

  it("normaliza valores não string das chaves conhecidas", () => {
    const out = normalizeAdPlan({ budget: 500 });
    expect(out.budget).toBe("500");
  });

  it("aceita valor inválido sem quebrar", () => {
    expect(normalizeAdPlan(null)).toEqual({ boost: false });
    expect(normalizeAdPlan("x")).toEqual({ boost: false });
    expect(normalizeAdPlan([1, 2])).toEqual({ boost: false });
  });
});

describe("isBoosted", () => {
  it("lê boolean e strings legadas", () => {
    expect(isBoosted({ boost: true })).toBe(true);
    expect(isBoosted({ boost: "sim" })).toBe(true);
    expect(isBoosted({ boost: "false" })).toBe(false);
    expect(isBoosted({})).toBe(false);
  });
});

describe("setters", () => {
  it("liga o boost sem apagar o plano", () => {
    const out = setAdPlanBoost({ objective: "Alcance", extra: 1 }, true);
    expect(out).toMatchObject({ objective: "Alcance", extra: 1, boost: true });
  });

  it("vincula e desvincula a campanha", () => {
    expect(setAdPlanCampaign({}, "abc").campaign_id).toBe("abc");
    expect(setAdPlanCampaign({ campaign_id: "abc" }, "").campaign_id).toBeNull();
  });
});

describe("canEditAdPlan", () => {
  it("é operacional apenas em mídia", () => {
    expect(canEditAdPlan("midia")).toBe(true);
    expect(canEditAdPlan(null)).toBe(true);
    expect(canEditAdPlan("sistemas")).toBe(false);
  });
});

describe("adPlanSummary", () => {
  it("resume boost, verba e território", () => {
    expect(adPlanSummary({ boost: true, budget: "R$ 500", territory: "RP + 30km" })).toBe(
      "Impulsionar · R$ 500 · RP + 30km",
    );
    expect(adPlanSummary({})).toBe("");
  });
});
