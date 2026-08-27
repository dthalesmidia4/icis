import { describe, expect, it } from "vitest";
import { isPlanningTone, marketRowBadge, marketRowClass, marketRowTone } from "@/lib/marketRowStyles";

const market = (over: Record<string, unknown> = {}) =>
  ({ id: "m", sequence: 1, status: "active", market_type: "expansion", ...over }) as any;

describe("marketRowStyles", () => {
  it("destaca a cidade ativa da expansão", () => {
    expect(marketRowTone(market())).toBe("active");
    expect(marketRowClass(market())).toContain("border-l-primary");
    expect(marketRowBadge(market())?.label).toBe("ATUAL");
  });

  it("trata a base como leitura neutra", () => {
    const base = market({ market_type: "base", sequence: null });
    expect(marketRowTone(base)).toBe("base");
    expect(marketRowBadge(base)?.label).toBe("BASE");
  });

  it("mantém planejamento e encerramentos discretos", () => {
    expect(isPlanningTone(market({ status: "planning" }))).toBe(true);
    expect(marketRowTone(market({ status: "completed" }))).toBe("completed");
    expect(marketRowClass(market({ status: "cancelled" }))).toContain("text-muted-foreground");
  });
});
