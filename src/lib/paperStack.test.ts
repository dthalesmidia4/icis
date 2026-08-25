import { describe, expect, it } from "vitest";
import { MAX_SHEETS, paperStackVisualMetrics } from "@/lib/paperStack";

describe("paperStackVisualMetrics", () => {
  it("vazio quando count é 0", () => {
    const m = paperStackVisualMetrics(0);
    expect(m.sheets).toBe(0);
    expect(m.empty).toBe(true);
    expect(m.overload).toBe(false);
  });

  it("1:1 até 6 demandas", () => {
    for (let n = 1; n <= 6; n++) {
      expect(paperStackVisualMetrics(n).sheets).toBe(n);
    }
  });

  it("cresce progressivamente depois de 6", () => {
    expect(paperStackVisualMetrics(10).sheets).toBe(7);
    expect(paperStackVisualMetrics(15).sheets).toBe(9);
    expect(paperStackVisualMetrics(16).sheets).toBe(9);
    expect(paperStackVisualMetrics(20).sheets).toBe(10);
    expect(paperStackVisualMetrics(25).sheets).toBe(11);
    expect(paperStackVisualMetrics(30).sheets).toBe(12);
    expect(paperStackVisualMetrics(35).sheets).toBe(14);
  });

  it("teto de MAX_SHEETS em cargas muito altas", () => {
    expect(paperStackVisualMetrics(50).sheets).toBe(MAX_SHEETS);
    expect(paperStackVisualMetrics(100).sheets).toBe(MAX_SHEETS);
    expect(paperStackVisualMetrics(1000).sheets).toBe(MAX_SHEETS);
  });

  it("monotonicidade: mais demandas nunca reduz folhas", () => {
    let prev = 0;
    for (let n = 0; n <= 60; n++) {
      const s = paperStackVisualMetrics(n).sheets;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("6 é visualmente menor que 15, 15 menor que 25, 35 maior que 20", () => {
    expect(paperStackVisualMetrics(6).sheets).toBeLessThan(paperStackVisualMetrics(15).sheets);
    expect(paperStackVisualMetrics(15).sheets).toBeLessThan(paperStackVisualMetrics(25).sheets);
    expect(paperStackVisualMetrics(35).sheets).toBeGreaterThan(paperStackVisualMetrics(20).sheets);
  });

  it("overload a partir de 16", () => {
    expect(paperStackVisualMetrics(15).overload).toBe(false);
    expect(paperStackVisualMetrics(16).overload).toBe(true);
    expect(paperStackVisualMetrics(35).overload).toBe(true);
  });

  it("largura cresce discretamente em cargas altas", () => {
    expect(paperStackVisualMetrics(6).sheetWidth).toBe(30);
    expect(paperStackVisualMetrics(20).sheetWidth).toBe(30);
    expect(paperStackVisualMetrics(24).sheetWidth).toBe(32);
    expect(paperStackVisualMetrics(32).sheetWidth).toBe(34);
    expect(paperStackVisualMetrics(35).sheetWidth).toBe(34);
  });

  it("valores negativos são tratados como 0", () => {
    const m = paperStackVisualMetrics(-3);
    expect(m.sheets).toBe(0);
    expect(m.empty).toBe(true);
  });
});
