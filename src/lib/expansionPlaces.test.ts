import { describe, expect, it } from "vitest";
import {
  placeBudgetLabel,
  placeDate,
  placeDistanceLabel,
  placeInternalName,
  placeLabel,
  placeOrderLabel,
  placeTargetLabel,
  placeVisitWindow,
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
    visits_end_date: over.visits_end_date ?? null,
    travel_distance_km: over.travel_distance_km ?? null,
    target_accounts: over.target_accounts ?? null,
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

describe("dimensões operacionais da praça", () => {
  it("rotula distância logística e meta de alvos com A definir honesto", () => {
    expect(placeDistanceLabel(null)).toBe("A definir");
    expect(placeDistanceLabel(70)).toBe("70 km");
    expect(placeTargetLabel(null)).toBe("A definir");
    expect(placeTargetLabel(0)).toBe("0");
    expect(placeTargetLabel(120)).toBe("120");
  });

  it("mostra visita de um único dia uma só vez", () => {
    expect(placeVisitWindow(null, null)).toBe("A definir");
    expect(placeVisitWindow("2026-10-05", "2026-10-05")).toBe("05/10/2026");
    expect(placeVisitWindow("2026-10-05", "2026-10-07")).toBe("05/10/2026 → 07/10/2026");
    expect(placeVisitWindow("2026-10-05", null)).toBe("05/10/2026 → A definir");
  });

  it("valida distância, meta e janela de visitas", () => {
    const base = { city: "Colina", state: "SP" };
    expect(validatePlaceInput({ ...base, travelDistanceKm: "-1" })).toMatch(/distância/i);
    expect(validatePlaceInput({ ...base, targetAccounts: "-2" })).toMatch(/meta/i);
    expect(
      validatePlaceInput({ ...base, visitsStartDate: "2026-10-10", visitsEndDate: "2026-10-01" }),
    ).toMatch(/fim das visitas/i);
    expect(
      validatePlaceInput({
        ...base,
        travelDistanceKm: "70",
        targetAccounts: "120",
        visitsStartDate: "2026-10-01",
        visitsEndDate: "2026-10-03",
      }),
    ).toBeNull();
  });
});
