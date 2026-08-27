import { describe, expect, it } from "vitest";
import {
  CYCLE_EDITABLE_COLUMNS,
  buildCycleUpdate,
  demandsOutsideCycleWindow,
  validateCycleInput,
} from "./periodCycleEdit";

describe("validateCycleInput", () => {
  it("exige título", () => {
    expect(validateCycleInput({ title: "  " })).toMatch(/título/i);
  });

  it("exige fim >= início", () => {
    expect(
      validateCycleInput({ title: "Ciclo 01", startDate: "2026-09-01", endDate: "2026-08-01" }),
    ).toMatch(/fim do ciclo/i);
    expect(
      validateCycleInput({ title: "Ciclo 01", startDate: "2026-08-01", endDate: "2026-09-30" }),
    ).toBeNull();
  });
});

describe("buildCycleUpdate", () => {
  it("nunca toca plano nem demandas", () => {
    const update = buildCycleUpdate({
      title: " Ciclo 02 ",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      objective: "",
      paidTrafficBudget: null,
    });
    expect(Object.keys(update).sort()).toEqual([...CYCLE_EDITABLE_COLUMNS].sort());
    expect(update.period_title).toBe("Ciclo 02");
    expect(update.objective).toBeNull();
    expect(update.paid_traffic_budget).toBeNull();
    for (const forbidden of ["final_plan", "default_plan", "ultra_plan", "publish_date", "status"]) {
      expect(update).not.toHaveProperty(forbidden);
    }
  });
});

describe("demandsOutsideCycleWindow", () => {
  const demands = [
    { id: "a", title: "A", publish_date: "2026-08-20" },
    { id: "b", title: "B", publish_date: "2026-09-10" },
    { id: "c", title: "C", publish_date: null },
  ];

  it("apenas sinaliza conteúdos fora da janela", () => {
    const out = demandsOutsideCycleWindow(demands, "2026-09-01", "2026-09-30");
    expect(out.map((d) => d.id)).toEqual(["a"]);
  });

  it("sem janela não sinaliza nada", () => {
    expect(demandsOutsideCycleWindow(demands, null, null)).toEqual([]);
  });
});
