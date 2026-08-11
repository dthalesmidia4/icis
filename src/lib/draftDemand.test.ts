import { describe, it, expect } from "vitest";
import {
  computeDraftMissingFields,
  isDraftComplete,
  draftAreaChangePatch,
  draftClientChangePatch,
} from "./draftDemand";

const complete = {
  clientId: "c1",
  demand_type_key: "estatico",
  assigned_to: "u1",
  title: "Card",
  due_date: "2026-08-20",
};

describe("computeDraftMissingFields", () => {
  it("retorna vazio quando tudo está preenchido", () => {
    expect(computeDraftMissingFields(complete)).toEqual([]);
    expect(isDraftComplete(complete)).toBe(true);
  });

  it("lista os campos na ordem do formulário", () => {
    expect(computeDraftMissingFields({})).toEqual([
      "cliente",
      "tipo de demanda",
      "responsável",
      "título",
      "data de início de produção",
    ]);
  });

  it("publicação NÃO satisfaz a data de início de produção", () => {
    const r = computeDraftMissingFields({ ...complete, due_date: null, publish_date: "2026-08-25" } as any);
    expect(r).toEqual(["data de início de produção"]);
  });

  it("delivery_date sozinha NÃO satisfaz o início", () => {
    const r = computeDraftMissingFields({ ...complete, due_date: "", delivery_date: "2026-08-30" } as any);
    expect(r).toEqual(["data de início de produção"]);
  });

  it("título só com espaços conta como ausente", () => {
    expect(computeDraftMissingFields({ ...complete, title: "   " })).toEqual(["título"]);
  });

  it("Card Diário exige daily_start_date em vez de due_date", () => {
    expect(
      computeDraftMissingFields({ ...complete, due_date: null, is_daily_card: true }),
    ).toEqual(["data inicial do Card Diário"]);
    expect(
      isDraftComplete({ ...complete, due_date: null, is_daily_card: true, daily_start_date: "2026-08-20" }),
    ).toBe(true);
  });
});

describe("draftAreaChangePatch", () => {
  it("limpa tipo e responsável quando o tipo não existe na nova área", () => {
    const r = draftAreaChangePatch({ demand_type_key: "carrossel", assigned_to: "u1" }, "sistemas");
    expect(r.typeCleared).toBe(true);
    expect(r.needsAssigneeRecheck).toBe(false);
    expect(r.patch.demand_type_key).toBeNull();
    expect(r.patch.assigned_to).toBeNull();
    expect(r.patch.current_function_key).toBeNull();
  });

  it("volta para Mídia zerando origem e subclientes", () => {
    const r = draftAreaChangePatch({ demand_type_key: null, assigned_to: null }, "midia");
    expect(r.patch.origin).toBe("interno");
    expect(r.patch.subclient_id).toBeNull();
    expect(r.patch.subclient_ids).toEqual([]);
  });

  it("pede revalidação do responsável quando o tipo continua válido", () => {
    const midiaType = "carrossel";
    const r = draftAreaChangePatch({ demand_type_key: midiaType, assigned_to: "u1" }, "midia");
    expect(r.typeCleared).toBe(false);
    expect(r.needsAssigneeRecheck).toBe(true);
    expect(r.patch.demand_type_key).toBeUndefined();
  });
});

describe("draftClientChangePatch", () => {
  it("derruba período e subclientes do cliente anterior", () => {
    expect(draftClientChangePatch()).toEqual({
      period_plan_id: null,
      periodPlanId: "",
      subclient_id: null,
      subclient_ids: [],
    });
  });
});
