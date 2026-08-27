import { describe, expect, it } from "vitest";
import {
  MAX_DOWNSCALE,
  MONITOR_MAX_PCT,
  comfortGapPx,
  coffeeZoneLeftPx,
  computeDeskSlots,
  deskBaseWidth,
  deskMonitorWidthPct,
  resolveOfficeProfile,
  centerBandPx,
  deskFootprint,
  richZonesActive,
  RICH_PANEL_BAND_PCT,
  STAGE_MAX_PX,
  agencyPanelWidthPx,
  characterSizePx,
  stageWidthPx,
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
    expect(resolveOfficeProfile({ width: 1366, height: 700 }).id).toBe("desktopShort");
    expect(resolveOfficeProfile({ width: 1440, height: 900 }).id).toBe("desktop");
    expect(resolveOfficeProfile({ width: 1680, height: 820 }).id).toBe("large");
    // 1920x1080 é monitor NORMAL (ratio 1.78), não ultrawide.
    expect(resolveOfficeProfile({ width: 1920, height: 1080 }).id).toBe("large");
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
        expect(rightEdge).toBeLessThanOrEqual(coffeeZoneLeftPx(width) + 0.01);
      }
    }
  });

  it("fileira da frente não é empurrada pela zona do café", () => {
    // 1366 é a faixa onde a zona do café realmente morde o centro do fundo.
    const size = { width: 1366, height: 660 };
    const withCoffee = computeDeskSlots(4, size, { coffeeCorner: true });
    const without = computeDeskSlots(4, size);
    expect(withCoffee[1].leftPct).toBeLessThanOrEqual(without[1].leftPct);
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
  it("usa o slot esquerdo para o único objeto pessoal", () => {
    const slots = assignDeskSlots(["mug", "plant", "lamp"]);
    expect(slots.map((s) => s.slot)).toEqual(["left"]);
  });

  it("sanitize mantém no máximo 1 item (o primeiro já renderizado)", () => {
    expect(sanitizeDeskObjects(["mug", "plant", "lamp", "notebook", "mug", "x"])).toEqual(["mug"]);
  });
});


describe("downscale responsivo do 2x2", () => {
  const gapFor = (
    size: { width: number; height: number },
    opts: { coffeeCorner?: boolean } = {},
  ) => {
    const slots = computeDeskSlots(4, size, opts);
    const base = deskBaseWidth(4, size, opts);
    const rows = [0, 1].map((row) =>
      slots.filter((s) => s.row === row).sort((a, b) => a.leftPct - b.leftPct),
    );
    return rows.map(([a, b]) => {
      const centerGapPx = ((b.leftPct - a.leftPct) / 100) * size.width;
      return centerGapPx - (base * a.scale) / 2 - (base * b.scale) / 2;
    });
  };

  it("desktop apertado mantém o respiro mínimo confortável", () => {
    for (const width of [1120, 1280, 1366, 1440]) {
      const size = { width, height: 660 };
      const gaps = gapFor(size, { coffeeCorner: true });
      for (const g of gaps) expect(g).toBeGreaterThanOrEqual(comfortGapPx(size) - 2);
    }
  });

  it("desktop large tem respiro sem encolher demais", () => {
    const size = { width: 1600, height: 780 };
    const gaps = gapFor(size, { coffeeCorner: true });
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(comfortGapPx(size));
    // 1600 é folgado: no máximo um encolhimento residual (< 5%).
    const profile = resolveOfficeProfile(size);
    expect(deskBaseWidth(4, size)).toBeGreaterThanOrEqual(profile.baseWidth * 0.95);
  });

  it("redução por aperto fica dentro do teto e é progressiva", () => {
    const tight = deskBaseWidth(4, { width: 1280, height: 660 });
    const mid = deskBaseWidth(4, { width: 1500, height: 720 });
    const roomy = deskBaseWidth(4, { width: 1700, height: 820 });
    expect(tight).toBeLessThan(mid);
    expect(mid).toBeLessThanOrEqual(roomy);
    // Nunca além do teto de redução em relação à largura do perfil.
    const tightProfile = resolveOfficeProfile({ width: 1280, height: 660 });
    expect(tight).toBeGreaterThanOrEqual(Math.round(tightProfile.baseWidth * (1 - MAX_DOWNSCALE)) - 1);
  });

  it("ultrawide não encolhe sem necessidade", () => {
    for (const [width, height] of [
      [2560, 1080],
      [3440, 1440],
    ] as Array<[number, number]>) {
      const size = { width, height };
      const profile = resolveOfficeProfile(size);
      expect(deskBaseWidth(4, size, { coffeeCorner: true })).toBe(profile.baseWidth);
      const gaps = gapFor(size, { coffeeCorner: true });
      for (const g of gaps) expect(g).toBeGreaterThan(comfortGapPx(size));
    }
  });

  it("nenhuma sobreposição e café protegido em toda a faixa", () => {
    for (const width of [1120, 1280, 1366, 1440, 1600, 1920, 2560, 3440]) {
      const size = { width, height: width < 1900 ? 700 : 1080 };
      const gaps = gapFor(size, { coffeeCorner: true });
      for (const g of gaps) expect(g).toBeGreaterThan(0);

      const slots = computeDeskSlots(4, size, { coffeeCorner: true });
      const base = deskBaseWidth(4, size, { coffeeCorner: true });
      const backRight = slots
        .filter((s) => s.row === 0)
        .reduce((a, b) => (b.leftPct > a.leftPct ? b : a));
      const rightEdge = (backRight.leftPct / 100) * width + (base * backRight.scale) / 2;
      expect(rightEdge).toBeLessThanOrEqual(coffeeZoneLeftPx(width) + 0.01);
    }
  });
});

describe("modo rico de zonas (até 4 mesas)", () => {
  const RICH: Array<[number, number]> = [
    [1366, 768],
    [1920, 1080],
    [2560, 1080],
    [3440, 1440],
  ];

  it("mesas ficam na faixa central, sem colidir e sem invadir as zonas laterais", () => {
    for (const [width, height] of RICH) {
      const size = { width, height };
      const opts = { coffeeCorner: true, sideZones: true };
      const slots = computeDeskSlots(4, size, opts);
      const base = deskBaseWidth(4, size, opts);
      const band = centerBandPx(width);
      const foot = slots.map((s) => deskFootprint(s, base, size));

      foot.forEach((f) => {
        expect(f.left).toBeGreaterThanOrEqual(band.left);
        expect(f.right).toBeLessThanOrEqual(band.right);
      });

      // sem interseção horizontal na mesma fileira
      [0, 1].forEach((row) => {
        const inRow = slots
          .map((s, i) => ({ s, f: foot[i] }))
          .filter((x) => x.s.row === row)
          .sort((a, b) => a.f.left - b.f.left);
        for (let i = 1; i < inRow.length; i += 1) {
          expect(inRow[i].f.left).toBeGreaterThanOrEqual(inRow[i - 1].f.right);
        }
      });

      // fileira do fundo abaixo da faixa do painel; fileira da frente dentro do mundo
      const backTop = Math.min(...foot.filter((_, i) => slots[i].row === 0).map((f) => f.top));
      expect(backTop).toBeGreaterThanOrEqual((RICH_PANEL_BAND_PCT / 100) * height);
      const frontBottom = Math.max(...foot.map((f) => f.bottom));
      expect(frontBottom).toBeLessThanOrEqual(height);
    }
  });

  it("2x2 compacto: centros das mesas ficam nas faixas ~33% e ~67%", () => {
    const slots = computeDeskSlots(4, { width: 1920, height: 1080 }, { sideZones: true });
    slots.forEach((s, i) => {
      if (i % 2 === 0) {
        expect(s.leftPct).toBeGreaterThanOrEqual(32);
        expect(s.leftPct).toBeLessThanOrEqual(38);
      } else {
        expect(s.leftPct).toBeGreaterThanOrEqual(62);
        expect(s.leftPct).toBeLessThanOrEqual(68);
      }
    });
  });

  it("palco lógico mantém o escritório coeso em ultrawide", () => {
    expect(stageWidthPx(1366)).toBeGreaterThan(1366 * 0.94);
    expect(stageWidthPx(1920)).toBeGreaterThan(1700);
    expect(stageWidthPx(3440)).toBeLessThanOrEqual(STAGE_MAX_PX);
    // ultrawide não afasta as mesas indefinidamente
    expect(stageWidthPx(3440)).toBeLessThan(3440 * 0.75);
  });

  it("painel da parede é MENOR no desktop normal que no ultrawide", () => {
    const sizes: Array<[number, number]> = [
      [1366, 700],
      [1920, 1000],
      [2560, 1000],
      [3440, 1300],
    ];
    const widths = sizes.map(([w, h]) => {
      const stage = { width: stageWidthPx(w), height: h };
      const pw = agencyPanelWidthPx(stage.width, stage);
      expect(pw).toBeGreaterThanOrEqual(330);
      expect(pw).toBeLessThanOrEqual(520);
      return pw;
    });
    // desktop normal (1366/1920) < ultrawide (2560/3440)
    expect(Math.max(widths[0], widths[1])).toBeLessThan(Math.min(widths[2], widths[3]));
    expect(characterSizePx(50, "seated")).toBeGreaterThan(50);
    expect(characterSizePx(50, "standing")).toBeGreaterThanOrEqual(
      characterSizePx(50, "seated"),
    );
  });

  it("desktop normal nasce compacto (densidade do antigo zoom 80%)", () => {
    const desk = { width: 1366, height: 700 };
    const wide = { width: 2560, height: 1080 };
    const dp = resolveOfficeProfile(desk);
    const up = resolveOfficeProfile(wide);
    // cenário menor no desktop normal…
    expect(dp.sceneScale).toBeLessThan(up.sceneScale);
    expect(dp.baseWidth).toBeLessThan(up.baseWidth);
    expect(dp.panelWidthPx).toBeLessThan(up.panelWidthPx);
    expect(dp.leftZonePx).toBeLessThan(up.leftZonePx);
    expect(comfortGapPx(desk)).toBeLessThan(comfortGapPx({ ...wide, width: 1366 }));
    // …mas o MONITOR não estreita: compensa com percentual maior da estação.
    expect(deskMonitorWidthPct(desk)).toBeGreaterThan(deskMonitorWidthPct(wide));
    expect(deskMonitorWidthPct({ width: 1920, height: 1080 })).toBeGreaterThanOrEqual(78);
  });

  it("5+ estações ignoram o modo rico e mantêm a composição genérica", () => {
    expect(richZonesActive(5, { sideZones: true })).toBe(false);
    const rich = computeDeskSlots(6, { width: 1920, height: 1080 }, { sideZones: true });
    const plain = computeDeskSlots(6, { width: 1920, height: 1080 });
    expect(rich).toEqual(plain);
  });
});
