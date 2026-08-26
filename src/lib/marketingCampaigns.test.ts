import { describe, expect, it } from "vitest";
import {
  campaignRegionLabel,
  campaignStatusLabel,
  isCampaignClosed,
  parseNumber,
  pickActiveCampaign,
  summarizeCampaignCommercial,
  validateCampaignInput,
  type MarketingCampaign,
} from "./marketingCampaigns";

const base = (over: Partial<MarketingCampaign>): MarketingCampaign =>
  ({
    id: over.id || "c1",
    tenant_id: "t1",
    company_id: "co1",
    strategy_id: null,
    name: over.name || "Campanha",
    objective: null,
    status: over.status || "planning",
    start_date: over.start_date ?? null,
    end_date: over.end_date ?? null,
    city: over.city ?? null,
    state: over.state ?? null,
    region_label: over.region_label ?? null,
    radius_km: over.radius_km ?? null,
    channels: over.channels || [],
    paid_traffic_budget: null,
    acquisition_strategy: null,
    observations: null,
    created_by: null,
    created_at: over.created_at || "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }) as MarketingCampaign;

describe("validateCampaignInput", () => {
  it("exige nome", () => {
    expect(validateCampaignInput({ name: "  " })).toMatch(/nome/i);
  });

  it("rejeita data final anterior à inicial", () => {
    expect(
      validateCampaignInput({ name: "X", startDate: "2026-05-10", endDate: "2026-05-01" }),
    ).toMatch(/posterior/i);
  });

  it("rejeita status inválido e valores negativos", () => {
    expect(validateCampaignInput({ name: "X", status: "zumbi" })).toMatch(/inválido/i);
    expect(validateCampaignInput({ name: "X", radiusKm: -1 })).toMatch(/raio/i);
    expect(validateCampaignInput({ name: "X", paidTrafficBudget: -5 })).toMatch(/verba/i);
  });

  it("aceita entrada válida", () => {
    expect(
      validateCampaignInput({
        name: "Ribeirão Preto",
        status: "active",
        startDate: "2026-05-01",
        endDate: "2026-08-31",
        radiusKm: "30",
        paidTrafficBudget: "1.500,50",
      }),
    ).toBeNull();
  });
});

describe("parseNumber", () => {
  it("converte formato brasileiro", () => {
    expect(parseNumber("1.500,50")).toBe(1500.5);
    expect(parseNumber("30")).toBe(30);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("pickActiveCampaign", () => {
  const ref = new Date("2026-06-15T12:00:00Z");

  it("ignora campanhas encerradas", () => {
    const rows = [base({ id: "a", status: "completed" }), base({ id: "b", status: "cancelled" })];
    expect(pickActiveCampaign(rows, ref)).toBeNull();
  });

  it("prioriza active sobre planning", () => {
    const rows = [
      base({ id: "plan", status: "planning", start_date: "2026-06-01" }),
      base({ id: "act", status: "active", start_date: "2026-05-01" }),
    ];
    expect(pickActiveCampaign(rows, ref)?.id).toBe("act");
  });

  it("desempata pela que cobre a data de referência", () => {
    const rows = [
      base({ id: "old", status: "active", start_date: "2026-01-01", end_date: "2026-02-01" }),
      base({ id: "now", status: "active", start_date: "2026-06-01", end_date: "2026-07-01" }),
    ];
    expect(pickActiveCampaign(rows, ref)?.id).toBe("now");
  });
});

describe("campaignRegionLabel", () => {
  it("usa o rótulo explícito quando existe", () => {
    expect(campaignRegionLabel(base({ region_label: "Grande RP" }))).toBe("Grande RP");
  });

  it("compõe cidade/UF com raio", () => {
    expect(campaignRegionLabel(base({ city: "Ribeirão Preto", state: "SP", radius_km: 30 }))).toBe(
      "Ribeirão Preto / SP + 30 km",
    );
  });

  it("cai para traço quando não há nada", () => {
    expect(campaignRegionLabel(base({}))).toBe("—");
  });
});

describe("status helpers", () => {
  it("rotula e detecta encerramento", () => {
    expect(campaignStatusLabel("active")).toBe("Ativa");
    expect(campaignStatusLabel(null)).toBe("—");
    expect(isCampaignClosed("completed")).toBe(true);
    expect(isCampaignClosed("paused")).toBe(false);
  });
});

describe("summarizeCampaignCommercial", () => {
  it("conta prospects, clientes, ganhos e perdas", () => {
    const s = summarizeCampaignCommercial([
      { lifecycle: "prospect", commercial_stage: "contato" },
      { lifecycle: "prospect", commercial_stage: "perdido" },
      { lifecycle: "customer", commercial_stage: "ganho" },
    ]);
    expect(s).toEqual({ total: 3, prospects: 2, customers: 1, won: 1, lost: 1 });
  });
});
