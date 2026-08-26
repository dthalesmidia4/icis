import { describe, it, expect } from "vitest";
import {
  FINANCE_TRACKING_START,
  clampToTrackingStart,
  compareCompetence,
  isBeforeTrackingStart,
  isTrackedCompetence,
} from "./financeTrackingPeriod";

describe("financeTrackingPeriod — corte operacional em agosto/2026", () => {
  it("o corte é agosto/2026", () => {
    expect(FINANCE_TRACKING_START).toEqual({ year: 2026, month: 8 });
  });

  it("meses de legado (março–julho/2026) ficam fora do novo mecanismo", () => {
    for (const month of [3, 4, 5, 6, 7]) {
      expect(isBeforeTrackingStart({ year: 2026, month })).toBe(true);
      expect(isTrackedCompetence({ year: 2026, month })).toBe(false);
    }
  });

  it("agosto/2026 em diante é operacional", () => {
    expect(isTrackedCompetence({ year: 2026, month: 8 })).toBe(true);
    expect(isTrackedCompetence({ year: 2026, month: 12 })).toBe(true);
    expect(isTrackedCompetence({ year: 2027, month: 1 })).toBe(true);
  });

  it("compara competências cruzando o ano", () => {
    expect(compareCompetence({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBe(-1);
    expect(compareCompetence({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(0);
    expect(compareCompetence({ year: 2026, month: 9 }, { year: 2026, month: 8 })).toBe(1);
  });

  it("clamp puxa mês anterior ao corte de volta para o início", () => {
    expect(clampToTrackingStart({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 8 });
    expect(clampToTrackingStart({ year: 2026, month: 10 })).toEqual({ year: 2026, month: 10 });
  });

  it("mês normalizado fora de faixa não escapa do corte", () => {
    expect(clampToTrackingStart({ year: 2026, month: 0 })).toEqual({ year: 2026, month: 8 });
  });
});
