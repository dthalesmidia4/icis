import { describe, expect, it } from "vitest";
import {
  customerStageBadgeLabel,
  lifecycleSituationLabel,
  resolveStageInlineChange,
} from "@/lib/commercialInlineStage";

describe("resolveStageInlineChange", () => {
  it("bloqueia edição de etapa em cliente convertido", () => {
    const res = resolveStageInlineChange(
      { lifecycle: "customer", commercial_stage: "ganho" },
      "negociacao",
    );
    expect(res.kind).toBe("blocked");
  });

  it("converte prospect ao escolher ganho em vez de gravar coluna", () => {
    const res = resolveStageInlineChange(
      { lifecycle: "prospect", commercial_stage: "negociacao" },
      "ganho",
    );
    expect(res).toEqual({ kind: "convert-won" });
  });

  it("grava apenas a etapa nas demais mudanças (campos independentes)", () => {
    const res = resolveStageInlineChange(
      { lifecycle: "prospect", commercial_stage: "contato" },
      "demonstracao",
    );
    expect(res).toEqual({ kind: "patch", patch: { commercial_stage: "demonstracao" } });
    if (res.kind === "patch") {
      expect(Object.keys(res.patch)).toEqual(["commercial_stage"]);
    }
  });

  it("etapa vazia vira null sem tocar outros campos", () => {
    const res = resolveStageInlineChange({ lifecycle: "prospect", commercial_stage: "contato" }, "");
    expect(res).toEqual({ kind: "patch", patch: { commercial_stage: null } });
  });
});

describe("rótulos de situação", () => {
  it("distingue cliente de oportunidade", () => {
    expect(lifecycleSituationLabel("customer")).toBe("Cliente");
    expect(lifecycleSituationLabel("prospect")).toBe("Oportunidade");
  });

  it("mostra Ganho quando o funil registrou a conversão", () => {
    expect(customerStageBadgeLabel("ganho")).toBe("Ganho");
    expect(customerStageBadgeLabel(null)).toBe("Cliente");
  });
});
