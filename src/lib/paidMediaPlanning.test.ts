import { describe, expect, it } from "vitest";
import {
  buildPaidMediaMarketRows,
  defaultActivationMarketId,
  summarizePaidMediaPlan,
} from "./paidMediaPlanning";
import type { ExpansionMarket } from "./expansionMarkets";
import type { PaidMediaActivation } from "./paidMediaActivations";

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

const activation = (
  partial: Partial<PaidMediaActivation> & { id: string },
): PaidMediaActivation => ({
  tenant_id: "t",
  company_id: "c",
  campaign_id: "plan",
  market_id: null,
  demand_id: "d",
  platform: "Meta",
  status: "planned",
  start_date: null,
  end_date: null,
  budget: null,
  objective: null,
  audience: null,
  cta: null,
  notes: null,
  created_by: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...partial,
});

const smartVetyMarkets = [
  market({ id: "base", market_type: "base", city: "Bebedouro", status: "active" }),
  market({
    id: "rib",
    sequence_order: 1,
    city: "Ribeirão Preto",
    status: "active",
    ads_start_date: "2026-08-31",
    ads_end_date: "2026-09-07",
  }),
  market({
    id: "bar",
    sequence_order: 2,
    city: "Barretos",
    paid_traffic_budget: 200,
    ads_start_date: "2026-09-07",
    ads_end_date: "2026-09-14",
  }),
];

describe("summarizePaidMediaPlan", () => {
  it("mostra o planejado da praça mesmo com zero ativações", () => {
    const t = summarizePaidMediaPlan(smartVetyMarkets, []);
    expect(t.plannedKnown).toBe(200);
    expect(t.plannedUndefined).toBe(1); // Ribeirão: verba a definir
    expect(t.allocatedKnown).toBe(0);
    expect(t.balanceKnown).toBe(200);
    expect(t.scheduledCities).toBe(2);
    expect(t.activations).toBe(0);
  });

  it("ignora ativações canceladas ao somar o alocado", () => {
    const t = summarizePaidMediaPlan(smartVetyMarkets, [
      activation({ id: "a", market_id: "bar", budget: 80 }),
      activation({ id: "b", market_id: "bar", budget: 500, status: "cancelled" }),
      activation({ id: "c", market_id: "bar", budget: null }),
    ]);
    expect(t.allocatedKnown).toBe(80);
    expect(t.allocatedUndefined).toBe(1);
    expect(t.balanceKnown).toBe(120);
    expect(t.activations).toBe(2);
  });
});

describe("buildPaidMediaMarketRows", () => {
  it("expõe planejado, alocado e disponível por cidade", () => {
    const rows = buildPaidMediaMarketRows(smartVetyMarkets, [
      activation({ id: "a", market_id: "bar", budget: 50 }),
    ]);
    // Base sem verba/janela/ativação fica fora do plano pago.
    expect(rows.map((r) => r.market.id)).toEqual(["rib", "bar"]);
    const bar = rows.find((r) => r.market.id === "bar")!;
    expect(bar.planned).toBe(200);
    expect(bar.allocated).toBe(50);
    expect(bar.available).toBe(150);
    const rib = rows.find((r) => r.market.id === "rib")!;
    expect(rib.planned).toBeNull();
    expect(rib.available).toBeNull();
    expect(rib.activations).toHaveLength(0);
  });

  it("inclui a base quando ela tem plano pago real", () => {
    const rows = buildPaidMediaMarketRows(
      [market({ id: "base", market_type: "base", paid_traffic_budget: 300 })],
      [],
    );
    expect(rows.map((r) => r.market.id)).toEqual(["base"]);
  });
});

describe("defaultActivationMarketId", () => {
  it("usa a cidade de expansão ativa e nunca a base", () => {
    expect(defaultActivationMarketId(smartVetyMarkets)).toBe("rib");
  });

  it("cai na primeira cidade de expansão quando nenhuma está ativa", () => {
    expect(
      defaultActivationMarketId([
        market({ id: "base", market_type: "base", status: "active" }),
        market({ id: "bar", sequence_order: 2 }),
        market({ id: "rib", sequence_order: 1 }),
      ]),
    ).toBe("rib");
  });

  it("devolve vazio quando só existe base", () => {
    expect(defaultActivationMarketId([market({ id: "base", market_type: "base" })])).toBe("");
  });
});

describe("peças vinculadas por cidade", () => {
  it("conta demands DISTINTAS e ignora canceladas", () => {
    const rows = buildPaidMediaMarketRows(smartVetyMarkets, [
      activation({ id: "a1", market_id: "bar", demand_id: "d1" }),
      activation({ id: "a2", market_id: "bar", demand_id: "d1", platform: "Google" }),
      activation({ id: "a3", market_id: "bar", demand_id: "d2" }),
      activation({ id: "a4", market_id: "bar", demand_id: "d9", status: "cancelled" }),
    ]);
    const bar = rows.find((r) => r.market.id === "bar")!;
    expect(bar.linkedDemands).toBe(2);
    const rib = rows.find((r) => r.market.id === "rib")!;
    expect(rib.linkedDemands).toBe(0);
  });
});
