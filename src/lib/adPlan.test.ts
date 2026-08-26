import { describe, expect, it } from "vitest";
import {
  adPlanSummary,
  canEditAdPlan,
  isAdEnabled,
  normalizeAdPlan,
  parseAdBudget,
  setAdPlanEnabled,
} from "./adPlan";

describe("normalizeAdPlan", () => {
  it("preserva chaves desconhecidas já salvas", () => {
    const out = normalizeAdPlan({ objective: "Leads", legado_x: 42 });
    expect(out.objective).toBe("Leads");
    expect(out.legado_x).toBe(42);
    expect(out.enabled).toBe(false);
  });

  it("migra legado boost/territory para enabled/location", () => {
    const out = normalizeAdPlan({ boost: true, territory: "RP + 30km" });
    expect(out.enabled).toBe(true);
    expect(out.location).toBe("RP + 30km");
    expect(out.boost).toBeUndefined();
  });

  it("normaliza verba textual em número", () => {
    expect(normalizeAdPlan({ budget: "R$ 1.500,50" }).budget).toBe(1500.5);
    expect(normalizeAdPlan({ budget: "" }).budget).toBeUndefined();
  });

  it("só aceita datas ISO", () => {
    const out = normalizeAdPlan({ start_date: "2026-08-26", end_date: "26/08/2026" });
    expect(out.start_date).toBe("2026-08-26");
    expect(out.end_date).toBeUndefined();
  });

  it("aceita valor inválido sem quebrar", () => {
    expect(normalizeAdPlan(null)).toEqual({ enabled: false });
    expect(normalizeAdPlan("x")).toEqual({ enabled: false });
    expect(normalizeAdPlan([1, 2])).toEqual({ enabled: false });
  });
});

describe("isAdEnabled", () => {
  it("lê enabled e o legado boost", () => {
    expect(isAdEnabled({ enabled: true })).toBe(true);
    expect(isAdEnabled({ boost: "sim" })).toBe(true);
    expect(isAdEnabled({ boost: "false" })).toBe(false);
    expect(isAdEnabled({})).toBe(false);
  });
});

describe("parseAdBudget", () => {
  it("converte formato brasileiro", () => {
    expect(parseAdBudget("1.500,50")).toBe(1500.5);
    expect(parseAdBudget(300)).toBe(300);
    expect(parseAdBudget("abc")).toBeNull();
    expect(parseAdBudget(null)).toBeNull();
  });
});

describe("setAdPlanEnabled", () => {
  it("liga o anúncio sem apagar o plano", () => {
    const out = setAdPlanEnabled({ objective: "Alcance", extra: 1 }, true);
    expect(out).toMatchObject({ objective: "Alcance", extra: 1, enabled: true });
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
  it("resume mídia paga, plataforma, verba e local", () => {
    const s = adPlanSummary({ enabled: true, platform: "Meta", budget: 500, location: "RP" });
    expect(s).toContain("Mídia paga");
    expect(s).toContain("Meta");
    expect(s).toContain("RP");
    expect(adPlanSummary({})).toBe("");
  });
});
