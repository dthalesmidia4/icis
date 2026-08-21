import { describe, expect, it } from "vitest";
import {
  MONITOR_MAX_PCT,
  coffeeZoneLeftPx,
  computeDeskSlots,
  deskBaseWidth,
  deskMonitorWidthPct,
  resolveOfficeProfile,
} from "./officeLayout";
import { assignDeskSlots, sanitizeDeskObjects } from "./officeDeskObjects";

const SIZES: Array<[number, number]> = [
  [1366, 660],
  [1600, 780],
  [1920, 900],
  [2560, 900],
  [3440, 1250],
];

describe("officeLayout responsivo", () => {
  it("escolhe perfil por largura/aspect", () => {
    expect(resolveOfficeProfile({ width: 1366, height: 700 }).id).toBe("desktop");
    expect(resolveOfficeProfile({ width: 1680, height: 820 }).id).toBe("large");
    expect(resolveOfficeProfile({ width: 3440, height: 1250 }).id).toBe("ultrawide");
    expect(resolveOfficeProfile({ width: 2560, height: 900 }).id).toBe("ultrawideShort");
  });

  it("nunca sobrepõe footprints na mesma fileira", () => {
    for (const [width, height] of SIZES) {
      for (const count of [1, 2, 3, 4, 6, 9, 12]) {
        const slots = computeDeskSlots(count, { width, height });
        const base = deskBaseWidth(count, { width, height });
        const rows = new Map<number, typeof slots>();
        slots.forEach((s) => rows.set(s.row, [...(rows.get(s.row) || []), s]));
        for (const arr of rows.values()) {
          const sorted = [...arr].sort((a, b) => a.leftPct - b.leftPct);
          for (let i = 1; i < sorted.length; i += 1) {
            const gapPx = ((sorted[i].leftPct - sorted[i - 1].leftPct) / 100) * width;
            const need = base * Math.max(sorted[i].scale, sorted[i - 1].scale);
            expect(gapPx).toBeGreaterThanOrEqual(need);
          }
        }
      }
    }
  });

  it("com 4 mesas usa 2x2 com gap vertical maior que 30 pontos", () => {
    for (const [width, height] of SIZES) {
      const slots = computeDeskSlots(4, { width, height });
      expect(slots).toHaveLength(4);
      const back = slots[0].topPct;
      const front = slots[3].topPct;
      expect(front - back).toBeGreaterThanOrEqual(30);
      expect(back).toBeGreaterThanOrEqual(40);
      expect(front).toBeLessThanOrEqual(90);
    }
  });

  it("ultrawide sobe as fileiras e amplia a estação", () => {
    const wide = { width: 3440, height: 1250 };
    const desk = { width: 1440, height: 780 };
    expect(computeDeskSlots(4, wide)[0].topPct).toBeLessThan(computeDeskSlots(4, desk)[0].topPct);
    expect(deskBaseWidth(4, wide)).toBeGreaterThan(deskBaseWidth(4, desk));
  });
});

describe("zona reservada da cafeteria", () => {
  const DESKTOP: Array<[number, number]> = [
    [1366, 660],
    [1600, 780],
    [1920, 900],
  ];

  it("estação superior direita termina antes da zona do café", () => {
    for (const [width, height] of DESKTOP) {
      for (const count of [3, 4]) {
        const slots = computeDeskSlots(count, { width, height }, { coffeeCorner: true });
        const base = deskBaseWidth(count, { width, height });
        const back = slots.filter((s) => s.row === 0);
        const rightmost = back.reduce((a, b) => (b.leftPct > a.leftPct ? b : a));
        const rightEdge = (rightmost.leftPct / 100) * width + (base * rightmost.scale) / 2;
        expect(rightEdge).toBeLessThanOrEqual(coffeeZoneLeftPx(width));
      }
    }
  });

  it("fileira da frente não é empurrada pela zona do café", () => {
    const size = { width: 1600, height: 780 };
    const withCoffee = computeDeskSlots(4, size, { coffeeCorner: true });
    const without = computeDeskSlots(4, size);
    expect(withCoffee[1].leftPct).toBeLessThan(without[1].leftPct);
    expect(withCoffee[3].leftPct).toBe(without[3].leftPct);
    expect(withCoffee[3].leftPct).toBeGreaterThan(withCoffee[1].leftPct);
  });

  it("mesas continuam sem colidir entre si com a zona ativa", () => {
    for (const [width, height] of [...DESKTOP, [2560, 900] as [number, number]]) {
      const slots = computeDeskSlots(4, { width, height }, { coffeeCorner: true });
      const base = deskBaseWidth(4, { width, height });
      const back = slots.filter((s) => s.row === 0).sort((a, b) => a.leftPct - b.leftPct);
      const gapPx = ((back[1].leftPct - back[0].leftPct) / 100) * width;
      expect(gapPx).toBeGreaterThanOrEqual(base * Math.max(back[0].scale, back[1].scale));
    }
  });

  it("monitor nunca passa do teto da estação", () => {
    for (const [width, height] of [...DESKTOP, [3440, 1250] as [number, number]]) {
      const pct = deskMonitorWidthPct({ width, height });
      expect(pct).toBeLessThanOrEqual(MONITOR_MAX_PCT);
      expect(pct).toBeGreaterThanOrEqual(50);
    }
  });
});

describe("acessórios da mesa", () => {
  it("distribui em 3 posições distintas", () => {
    const slots = assignDeskSlots(["mug", "plant", "lamp"]);
    expect(slots.map((s) => s.slot)).toEqual(["left", "center-side", "right"]);
    expect(new Set(slots.map((s) => s.slot)).size).toBe(3);
  });

  it("sanitize mantém máximo de 3", () => {
    expect(sanitizeDeskObjects(["mug", "plant", "lamp", "notebook", "mug", "x"])).toEqual([
      "mug",
      "plant",
      "lamp",
    ]);
  });
});
