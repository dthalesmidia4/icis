import { describe, expect, it } from "vitest";
import { eligibilityResolverArgs } from "@/lib/eligibilityRules";

const CARD = {
  id: "d1",
  demand_type_key: "estatico",
  work_area: "midia",
  origin: "interno",
  current_function_key: "criar_arte",
};

describe("eligibilityResolverArgs", () => {
  it("card salvo pergunta pela ETAPA ATUAL em modo administrativo", () => {
    expect(eligibilityResolverArgs(CARD, "saved")).toEqual({
      demandTypeKey: "estatico",
      currentFunctionKey: "criar_arte",
      demandId: "d1",
      workArea: "midia",
      origin: "interno",
      mode: "administrative_reassign",
    });
  });

  it("rascunho pergunta pela etapa INICIAL em modo de fluxo", () => {
    expect(eligibilityResolverArgs(CARD, "draft")).toEqual({
      demandTypeKey: "estatico",
      currentFunctionKey: null,
      demandId: null,
      workArea: "midia",
      origin: "interno",
      mode: "flow",
    });
  });

  it("campos ausentes viram null (nunca undefined)", () => {
    expect(eligibilityResolverArgs({}, "saved")).toEqual({
      demandTypeKey: null,
      currentFunctionKey: null,
      demandId: null,
      workArea: null,
      origin: null,
      mode: "administrative_reassign",
    });
  });
});
