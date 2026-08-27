import { describe, expect, it } from "vitest";
import {
  baseMarketsOf,
  buildMarketPatch,
  buildMarketRow,
  expansionMarketsOf,
  isBaseMarket,
  isInlineMarketColumn,
  patchExpansionMarket,
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
  paid_media_status_override: null,
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

describe("buildMarketPatch — cada área edita só o seu grupo", () => {
  const input = {
    tenantId: "t1",
    companyId: "c1",
    campaignId: "p1",
    id: "m1",
    city: "Ribeirão Preto",
    state: "SP",
    sequenceOrder: 1,
    paidTrafficBudget: "1.000",
    adsStartDate: "2026-09-01",
    adsEndDate: "2026-09-30",
    callsStartDate: "2026-09-02",
    visitsStartDate: "2026-09-10",
    visitsEndDate: "2026-09-12",
  } as any;

  it("mídia paga não toca a agenda comercial", () => {
    const patch = buildMarketPatch("paid-media", input);
    expect(Object.keys(patch).sort()).toEqual(
      ["ads_end_date", "ads_start_date", "paid_traffic_budget"],
    );
    expect(patch).not.toHaveProperty("calls_start_date");
    expect(patch).not.toHaveProperty("city");
  });

  it("comercial não toca verba nem posicionamento", () => {
    const patch = buildMarketPatch("commercial", input);
    expect(Object.keys(patch).sort()).toEqual(
      ["calls_start_date", "visits_end_date", "visits_start_date"],
    );
    expect(patch).not.toHaveProperty("paid_traffic_budget");
  });

  it("estratégia não toca verba nem agenda", () => {
    const patch = buildMarketPatch("strategy", input);
    expect(patch).toHaveProperty("city");
    expect(patch).not.toHaveProperty("paid_traffic_budget");
    expect(patch).not.toHaveProperty("visits_start_date");
  });

  it("full grava a linha completa", () => {
    const patch = buildMarketPatch("full", input);
    expect(patch).toHaveProperty("city");
    expect(patch).toHaveProperty("paid_traffic_budget");
    expect(patch).toHaveProperty("calls_start_date");
  });
});

describe("edição inline — patch parcial por área", () => {
  it("só aceita colunas da área que está editando", () => {
    expect(isInlineMarketColumn("paid-media", "paid_traffic_budget")).toBe(true);
    expect(isInlineMarketColumn("paid-media", "calls_start_date")).toBe(false);
    expect(isInlineMarketColumn("strategy", "target_accounts")).toBe(true);
    expect(isInlineMarketColumn("strategy", "paid_traffic_budget")).toBe(false);
    expect(isInlineMarketColumn("commercial", "visits_end_date")).toBe(true);
  });

  it("recusa a gravação de coluna fora da área, sem tocar o banco", async () => {
    const res = await patchExpansionMarket("m1", { calls_start_date: "2026-09-01" }, "paid-media");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/fora da área/i);
  });

  it("patch vazio é no-op bem-sucedido", async () => {
    await expect(patchExpansionMarket("m1", {})).resolves.toEqual({ success: true });
  });
});
