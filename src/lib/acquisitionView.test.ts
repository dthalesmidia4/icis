import { describe, expect, it } from "vitest";
import {
  formatPeriodWindow,
  isAdMarkedDemand,
  summarizeAcquisitionCommercial,
  summarizePaidMedia,
} from "./acquisitionView";

describe("summarizePaidMedia", () => {
  it("preserva 'A definir' literal e não inventa dinheiro", () => {
    const s = summarizePaidMedia({ demands: [], paidTrafficBudget: "A definir" });
    expect(s.budgetLabel).toBe("A definir");
    expect(s.hasConcreteBudget).toBe(false);
    expect(s.hasPaidMedia).toBe(true);
  });

  it("considera classification anuncio e ad_plan habilitado", () => {
    const s = summarizePaidMedia({
      demands: [
        { classifications: ["anuncio"], ad_plan: null },
        { classifications: [], ad_plan: { enabled: true } },
        { classifications: ["organico"], ad_plan: { enabled: false } },
      ],
    });
    expect(s.adMarkedCount).toBe(2);
    expect(s.adPlanEnabledCount).toBe(1);
    expect(s.hasPaidMedia).toBe(true);
    expect(s.budgetLabel).toBeNull();
  });

  it("sem verba e sem anúncio não há mídia paga", () => {
    expect(summarizePaidMedia({ demands: [{ classifications: [], ad_plan: null }] }).hasPaidMedia).toBe(
      false
    );
  });

  it("reconhece boost legado via isAdEnabled", () => {
    expect(isAdMarkedDemand({ ad_plan: { boost: true } })).toBe(true);
  });
});

describe("summarizeAcquisitionCommercial", () => {
  it("conta apenas as linhas atribuídas, por etapa real", () => {
    const s = summarizeAcquisitionCommercial([
      { lifecycle: "prospect", commercial_stage: "mapeado" },
      { lifecycle: "prospect", commercial_stage: "negociacao" },
      { lifecycle: "customer", commercial_stage: "ganho" },
    ]);
    expect(s.total).toBe(3);
    expect(s.customers).toBe(1);
    expect(s.stages.map((x) => x.stage)).toEqual([
      "mapeado",
      "contato",
      "demonstracao",
      "avaliacao",
      "negociacao",
      "ganho",
      "perdido",
    ]);
    expect(s.stages.find((x) => x.stage === "mapeado")?.count).toBe(1);
    expect(s.stages.find((x) => x.stage === "ganho")?.count).toBe(1);
  });

  it("lista vazia gera total zero", () => {
    expect(summarizeAcquisitionCommercial([]).total).toBe(0);
  });
});

describe("formatPeriodWindow", () => {
  it("usa a janela do period_plan", () => {
    expect(formatPeriodWindow("2026-08-01", "2026-08-31")).toBe("01/08/2026 → 31/08/2026");
  });

  it("não abre janela infinita quando falta data", () => {
    expect(formatPeriodWindow("2026-08-01", null)).toBe("A partir de 01/08/2026");
    expect(formatPeriodWindow(null, null)).toBe("Janela não definida");
  });
});
