import { describe, expect, it } from "vitest";
import {
  formatActivationBudget,
  parseBudget,
  paidMediaStatusLabel,
  summarizePaidMediaActivations,
  validateActivationInput,
} from "./paidMediaActivations";

describe("validateActivationInput", () => {
  it("exige conteúdo, cidade do plano e plano", () => {
    expect(validateActivationInput({})).toMatch(/conteúdo/i);
    expect(validateActivationInput({ demandId: "d1" })).toMatch(/cidade/i);
    expect(validateActivationInput({ demandId: "d1", marketId: "m1" })).toMatch(/plano/i);
  });

  it("rejeita janela invertida, status inválido e verba negativa", () => {
    const base = { demandId: "d1", campaignId: "c1", marketId: "m1" };
    expect(
      validateActivationInput({ ...base, startDate: "2026-09-10", endDate: "2026-09-01" }),
    ).toMatch(/posterior/i);
    expect(validateActivationInput({ ...base, status: "zumbi" as any })).toMatch(/inválido/i);
    expect(validateActivationInput({ ...base, budget: "-10" })).toMatch(/negativa/i);
  });

  it("aceita ativação válida", () => {
    expect(
      validateActivationInput({
        demandId: "d1",
        campaignId: "c1",
        marketId: "m1",
        status: "running",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        budget: "1.200,50",
      }),
    ).toBeNull();
  });
});

describe("parseBudget", () => {
  it("converte formato brasileiro", () => {
    expect(parseBudget("1.200,50")).toBe(1200.5);
    expect(parseBudget(800)).toBe(800);
    expect(parseBudget("")).toBeNull();
    expect(parseBudget(null)).toBeNull();
  });
});

describe("summarizePaidMediaActivations", () => {
  const rows = [
    { status: "running" as const, budget: 500, demand_id: "d1" },
    { status: "planned" as const, budget: null, demand_id: "d1" },
    { status: "completed" as const, budget: 300, demand_id: "d2" },
    { status: "cancelled" as const, budget: 999, demand_id: "d3" },
  ];

  it("não soma verba de ativação cancelada", () => {
    const s = summarizePaidMediaActivations(rows);
    expect(s.budgetTotal).toBe(800);
    expect(s.cancelled).toBe(1);
  });

  it("conta conteúdos distintos ativados e verba a definir", () => {
    const s = summarizePaidMediaActivations(rows);
    expect(s.demandsActivated).toBe(2);
    expect(s.budgetUndefinedCount).toBe(1);
    expect(s.running).toBe(1);
    expect(s.planned).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.total).toBe(4);
  });

  it("permite a MESMA demanda em várias cidades sem duplicar o conteúdo", () => {
    const s = summarizePaidMediaActivations([
      { status: "running", budget: 100, demand_id: "d1" },
      { status: "running", budget: 200, demand_id: "d1" },
    ]);
    expect(s.total).toBe(2);
    expect(s.demandsActivated).toBe(1);
    expect(s.budgetTotal).toBe(300);
  });
});

describe("rótulos", () => {
  it("mostra verba a definir quando não há valor", () => {
    expect(formatActivationBudget(null)).toBe("A definir");
    expect(formatActivationBudget(0)).toContain("0,00");
  });

  it("rotula status", () => {
    expect(paidMediaStatusLabel("running")).toBe("Rodando");
    expect(paidMediaStatusLabel(null)).toBe("—");
  });
});
