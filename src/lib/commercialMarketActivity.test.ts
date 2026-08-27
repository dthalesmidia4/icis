import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
}));

import {
  groupLeadsByMarket,
  leadsWithoutMarket,
  summarizeMarketCommercial,
  type MarketLead,
} from "./commercialMarketActivity";

const lead = (partial: Partial<MarketLead> & { id: string }): MarketLead => ({
  name: partial.id,
  city: null,
  state: null,
  lifecycle: "prospect",
  commercial_stage: "contato",
  current_system: null,
  next_action: null,
  next_action_at: null,
  last_contact_result: null,
  market_id: null,
  acquisition_market_id: null,
  lead_source: null,
  parent_company_id: "company",
  ...partial,
});

describe("groupLeadsByMarket", () => {
  it("agrupa pela carteira operacional e nunca pela aquisição", () => {
    const leads = [
      lead({ id: "a", market_id: "rp", acquisition_market_id: "franca" }),
      lead({ id: "b", market_id: "franca" }),
      lead({ id: "c", acquisition_market_id: "rp" }),
    ];
    const grouped = groupLeadsByMarket(leads);
    expect(grouped.get("rp")?.map((l) => l.id)).toEqual(["a"]);
    expect(grouped.get("franca")?.map((l) => l.id)).toEqual(["b"]);
    expect(leadsWithoutMarket(leads).map((l) => l.id)).toEqual(["c"]);
  });

  it("aviso de órfãos conta só oportunidades: customer sem carteira não infla", () => {
    const leads = [
      lead({ id: "vivapet" }),
      lead({ id: "bellotti", lifecycle: "customer" }),
      lead({ id: "leal", lifecycle: "customer" }),
    ];
    expect(leadsWithoutMarket(leads).map((l) => l.id)).toEqual(["vivapet"]);
  });
});


describe("summarizeMarketCommercial", () => {
  it("conta etapas, clientes e execução real por cidade", () => {
    const leads = [
      lead({ id: "a", market_id: "rp", commercial_stage: "negociacao" }),
      lead({ id: "b", market_id: "rp", commercial_stage: "avaliacao" }),
      lead({ id: "c", market_id: "rp", commercial_stage: "ganho", lifecycle: "customer" }),
      lead({ id: "d", market_id: "franca" }),
    ];
    const stats = summarizeMarketCommercial(leads, [
      { subclient_id: "a", touchpoint_type: "ligacao", occurred_at: "2026-08-10T10:00:00.000Z" },
      { subclient_id: "b", touchpoint_type: "visita", occurred_at: "2026-08-12T10:00:00.000Z" },
      { subclient_id: "b", touchpoint_type: "demonstracao", occurred_at: "2026-08-13T10:00:00.000Z" },
      // Touchpoint de lead sem carteira nunca contamina nenhuma cidade.
      { subclient_id: "zzz", touchpoint_type: "ligacao", occurred_at: "2026-08-20T10:00:00.000Z" },
    ]);
    const rp = stats.get("rp")!;
    expect(rp.total).toBe(3);
    // Oportunidades = só prospects; o customer entra em Ganhos/clientes.
    expect(rp.opportunities).toBe(2);
    expect(rp.negotiating).toBe(2);

    expect(rp.won).toBe(1);
    expect(rp.customers).toBe(1);
    expect(rp.calls).toBe(1);
    expect(rp.visits).toBe(1);
    expect(rp.demos).toBe(1);
    expect(rp.lastTouchAt).toBe("2026-08-13T10:00:00.000Z");
    expect(stats.get("franca")?.calls).toBe(0);
    expect(stats.has("zzz")).toBe(false);
  });
});
