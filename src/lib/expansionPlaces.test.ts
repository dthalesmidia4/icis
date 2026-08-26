import { describe, expect, it } from "vitest";
import {
  placeBudgetLabel,
  placeDate,
  placeInternalName,
  placeLabel,
  placeOrderLabel,
  placeWindow,
  sortCampaignsForExpansion,
  validatePlaceInput,
  type MarketingCampaign,
} from "./marketingCampaigns";

const place = (over: Partial<MarketingCampaign>): MarketingCampaign =>
  ({
    id: over.id || "p1",
    tenant_id: "t1",
    company_id: "co1",
    strategy_id: null,
    name: over.name || "Ribeirão Preto — Aquisição",
    objective: null,
    status: over.status || "planning",
    start_date: over.start_date ?? null,
    end_date: null,
    city: over.city ?? null,
    state: over.state ?? null,
    region_label: over.region_label ?? null,
    radius_km: null,
    sequence_order: over.sequence_order ?? null,
    ads_start_date: over.ads_start_date ?? null,
    ads_end_date: over.ads_end_date ?? null,
    calls_start_date: over.calls_start_date ?? null,
    visits_start_date: over.visits_start_date ?? null,
    channels: [],
    paid_traffic_budget: over.paid_traffic_budget ?? null,
    acquisition_strategy: null,
    observations: null,
    created_by: null,
    created_at: over.created_at || "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }) as MarketingCampaign;

describe("sortCampaignsForExpansion", () => {
  it("ordena por sequence_order com nulls no fim", () => {
    const out = sortCampaignsForExpansion([
      place({ id: "sem", sequence_order: null, created_at: "2026-01-01T00:00:00Z" }),
      place({ id: "dois", sequence_order: 2 }),
      place({ id: "um", sequence_order: 1 }),
    ]);
    expect(out.map((p) => p.id)).toEqual(["um", "dois", "sem"]);
  });
});

describe("rótulos da praça", () => {
  it("numera a praça atual como 01", () => {
    expect(placeOrderLabel(place({ sequence_order: 1 }), 0)).toBe("01");
    expect(placeOrderLabel(place({ sequence_order: null }), 2)).toBe("03");
  });

  it("mostra cidade/UF sem o nome interno", () => {
    expect(placeLabel(place({ city: "Ribeirão Preto", state: "SP" }))).toBe("Ribeirão Preto/SP");
    expect(placeLabel(place({ city: null, state: null }))).toBe("Ribeirão Preto");
  });

  it("é honesto quando datas e verba não existem", () => {
    expect(placeDate(null)).toBe("A definir");
    expect(placeWindow(null, null)).toBe("A definir");
    expect(placeWindow("2026-09-01", null)).toBe("01/09/2026 → A definir");
    expect(placeBudgetLabel(null)).toBe("A definir");
    expect(placeBudgetLabel(1500)).toContain("1.500,00");
  });

  it("gera nome interno a partir da cidade", () => {
    expect(placeInternalName("Barretos")).toBe("Barretos — Aquisição");
  });
});

describe("validatePlaceInput", () => {
  it("exige cidade e estado", () => {
    expect(validatePlaceInput({ city: "", state: "SP" })).toMatch(/cidade/i);
    expect(validatePlaceInput({ city: "Colina", state: " " })).toMatch(/estado/i);
  });

  it("valida janela de anúncios, ordem e verba", () => {
    const base = { city: "Colina", state: "SP" };
    expect(
      validatePlaceInput({ ...base, adsStartDate: "2026-10-10", adsEndDate: "2026-10-01" }),
    ).toMatch(/fim dos anúncios/i);
    expect(validatePlaceInput({ ...base, sequenceOrder: 0 })).toMatch(/ordem/i);
    expect(validatePlaceInput({ ...base, paidTrafficBudget: "-1" })).toMatch(/verba/i);
    expect(validatePlaceInput({ ...base, sequenceOrder: 2, paidTrafficBudget: "900,00" })).toBeNull();
  });
});
