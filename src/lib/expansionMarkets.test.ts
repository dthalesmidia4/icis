import { describe, expect, it } from "vitest";
import {
  baseMarketsOf,
  buildMarketRow,
  expansionMarketsOf,
  isBaseMarket,
  marketLabel,
  marketOrderLabel,
  sortExpansionMarkets,
  summarizeExpansionPlan,
  undefinedSuffix,
  validateExpansionMarketInput,
  type ExpansionMarket,
} from "./expansionMarkets";

const market = (partial: Partial<ExpansionMarket> & { id: string }): ExpansionMarket => ({
  tenant_id: "t",
  company_id: "c",
  campaign_id: "plan",
  market_type: "expansion",
  sequence_order: null,
  city: "Cidade",
  state: "SP",
  region_label: null,
  status: "planning",
  objective: null,
  travel_distance_km: null,
  target_accounts: null,
  paid_traffic_budget: null,
  ads_start_date: null,
  ads_end_date: null,
  calls_start_date: null,
  visits_start_date: null,
  visits_end_date: null,
  channels: [],
  acquisition_strategy: null,
  observations: null,
  created_by: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...partial,
});

describe("sortExpansionMarkets", () => {
  it("ordena pela sequência logística do plano", () => {
    const rows = sortExpansionMarkets([
      market({ id: "b", sequence_order: 3, city: "Franca" }),
      market({ id: "a", sequence_order: 1, city: "Ribeirão Preto" }),
      market({ id: "c", sequence_order: 2, city: "Sertãozinho" }),
    ]);
    expect(rows.map((r) => r.city)).toEqual(["Ribeirão Preto", "Sertãozinho", "Franca"]);
  });
});

describe("summarizeExpansionPlan", () => {
  it("nunca transforma valores desconhecidos em zero", () => {
    const s = summarizeExpansionPlan([
      market({ id: "1", sequence_order: 1, status: "active", target_accounts: null, paid_traffic_budget: null }),
      market({ id: "2", sequence_order: 2, target_accounts: 20, paid_traffic_budget: 1500 }),
      market({ id: "3", sequence_order: 3, status: "completed", target_accounts: 10, paid_traffic_budget: 500 }),
    ]);
    expect(s.totalExpansionCities).toBe(3);
    expect(s.totalTargetAccounts).toBe(30);
    expect(s.targetsUndefined).toBe(1);
    expect(s.totalBudget).toBe(2000);
    expect(s.budgetUndefined).toBe(1);
    expect(s.currentMarket?.id).toBe("1");
    expect(s.completedMarkets).toBe(1);
  });

  it("sinaliza os indefinidos em texto", () => {
    expect(undefinedSuffix(1, "meta")).toContain("1 meta a definir");
    expect(undefinedSuffix(0, "meta")).toBe("");
  });
});

describe("buildMarketRow", () => {
  it("grava a cidade no plano único e não em marketing_campaigns", () => {
    const row = buildMarketRow({
      tenantId: "t",
      companyId: "c",
      campaignId: "plan",
      city: " Sertãozinho ",
      state: "sp",
      sequenceOrder: "2",
      travelDistanceKm: "24",
      targetAccounts: "20",
      paidTrafficBudget: "1.500,00",
      visitsEndDate: "2026-09-30",
    });
    expect(row.campaign_id).toBe("plan");
    expect(row.city).toBe("Sertãozinho");
    expect(row.state).toBe("SP");
    expect(row.region_label).toBe("Sertãozinho/SP");
    expect(row.travel_distance_km).toBe(24);
    expect(row.target_accounts).toBe(20);
    expect(row.paid_traffic_budget).toBe(1500);
    expect(row.visits_end_date).toBe("2026-09-30");
    expect(row).not.toHaveProperty("name");
  });
});

describe("validateExpansionMarketInput", () => {
  it("exige cidade, estado e plano", () => {
    expect(validateExpansionMarketInput({})).toMatch(/cidade/i);
    expect(validateExpansionMarketInput({ city: "Franca" })).toMatch(/estado/i);
    expect(validateExpansionMarketInput({ city: "Franca", state: "SP" })).toMatch(/plano/i);
  });

  it("rejeita janelas invertidas e números negativos", () => {
    const base = { city: "Franca", state: "SP", campaignId: "plan" };
    expect(
      validateExpansionMarketInput({ ...base, adsStartDate: "2026-09-10", adsEndDate: "2026-09-01" }),
    ).toMatch(/anúncios/i);
    expect(
      validateExpansionMarketInput({
        ...base,
        visitsStartDate: "2026-09-10",
        visitsEndDate: "2026-09-01",
      }),
    ).toMatch(/visitas/i);
    expect(validateExpansionMarketInput({ ...base, travelDistanceKm: "-1" })).toMatch(/distância/i);
    expect(validateExpansionMarketInput({ ...base, targetAccounts: "-1" })).toMatch(/meta/i);
    expect(validateExpansionMarketInput({ ...base, sequenceOrder: "0" })).toMatch(/ordem/i);
    expect(validateExpansionMarketInput({ ...base, targetAccounts: "20" })).toBeNull();
  });
});

describe("rótulos", () => {
  it("mostra ordem e cidade/UF", () => {
    const m = market({ id: "1", sequence_order: 1, city: "Ribeirão Preto", state: "SP" });
    expect(marketOrderLabel(m, 0)).toBe("01");
    expect(marketLabel(m)).toBe("Ribeirão Preto/SP");
  });
});

describe("base x expansão", () => {
  const bebedouro = market({ id: "base", market_type: "base", city: "Bebedouro", sequence_order: null });
  const rp = market({ id: "rp", sequence_order: 1, city: "Ribeirão Preto" });
  const franca = market({ id: "franca", sequence_order: 2, city: "Franca" });

  it("separa a base da sequência numerada", () => {
    expect(baseMarketsOf([rp, bebedouro, franca]).map((m) => m.id)).toEqual(["base"]);
    expect(expansionMarketsOf([franca, bebedouro, rp]).map((m) => m.id)).toEqual(["rp", "franca"]);
    expect(isBaseMarket(bebedouro)).toBe(true);
  });

  it("rotula a base como BASE e nunca inventa número", () => {
    expect(marketOrderLabel(bebedouro)).toBe("BASE");
    expect(marketOrderLabel(rp)).toBe("01");
    expect(marketOrderLabel(market({ id: "x", sequence_order: null }))).toBe("—");
  });

  it("conta somente cidades de expansão no resumo do plano", () => {
    const s = summarizeExpansionPlan([
      bebedouro,
      market({ id: "rp", sequence_order: 1, target_accounts: 10, paid_traffic_budget: 100 }),
      market({ id: "franca", sequence_order: 2, target_accounts: null, paid_traffic_budget: null }),
    ]);
    expect(s.totalExpansionCities).toBe(2);
    expect(s.baseMarkets.map((m) => m.id)).toEqual(["base"]);
    expect(s.targetsUndefined).toBe(1);
    expect(s.totalTargetAccounts).toBe(10);
  });

  it("base salva sem ordem e sem exigir sequência", () => {
    const row = buildMarketRow({
      tenantId: "t",
      companyId: "c",
      campaignId: "plan",
      marketType: "base",
      city: "Bebedouro",
      state: "SP",
      sequenceOrder: "5",
    });
    expect(row.market_type).toBe("base");
    expect(row.sequence_order).toBeNull();
    expect(
      validateExpansionMarketInput({
        city: "Bebedouro",
        state: "SP",
        campaignId: "plan",
        marketType: "base",
      }),
    ).toBeNull();
    expect(
      buildMarketRow({ tenantId: "t", companyId: "c", campaignId: "plan", city: "Franca", state: "SP" })
        .market_type,
    ).toBe("expansion");
  });
});
