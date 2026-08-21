import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dailyCards", () => ({
  fetchHolidaysInRange: vi.fn(async () => new Set<string>()),
}));
import {
  cardAreaMismatch,
  resolvePresenceArea,
  resolveUserWindows,
  type AreaScheduleRow,
} from "@/lib/officeSchedule";
import { resolvePresence } from "@/lib/officePresence";

/** Eric Zanata (dado real): apenas Sistemas, sexta 08–12 e 13:30–18. */
const ERIC: AreaScheduleRow[] = [
  { user_id: "eric", work_area: "sistemas", weekday: 5, start_time: "08:00:00", end_time: "12:00:00" },
  { user_id: "eric", work_area: "sistemas", weekday: 5, start_time: "13:30:00", end_time: "18:00:00" },
];

// 21/08/2026 14:33 America/Sao_Paulo == 17:33 UTC
const NOW = Date.parse("2026-08-21T17:33:00.000Z");
const TZ = "America/Sao_Paulo";

describe("presença humana x área do card", () => {
  it("visão Todas usa a união das áreas alocadas", () => {
    expect(resolvePresenceArea("all")).toBe("all");
    const { windows } = resolveUserWindows({ rows: ERIC, weekday: 5, area: "all" });
    expect(windows).toEqual([
      { s: 480, e: 720 },
      { s: 810, e: 1080 },
    ]);
  });

  it("só Sistemas alocado + card atual de Mídia + filtro Todas => NÃO off_shift", () => {
    const { windows } = resolveUserWindows({ rows: ERIC, weekday: 5, area: "all" });
    const presence = resolvePresence({
      now: NOW,
      windows,
      tz: TZ,
      queue: [{ id: "c1", startTs: NOW - 60_000, endTs: NOW + 3_600_000 }],
    });
    expect(presence.state).toBe("working_now");
  });

  it("comportamento antigo (área do card) produzia off_shift — regressão coberta", () => {
    const { windows } = resolveUserWindows({ rows: ERIC, weekday: 5, area: "midia" });
    expect(windows).toEqual([]);
    expect(resolvePresence({ now: NOW, windows, tz: TZ, queue: [] }).state).toBe("off_shift");
  });

  it("filtro Mídia respeita a alocação daquela área", () => {
    expect(resolvePresenceArea("midia")).toBe("midia");
    const { windows } = resolveUserWindows({ rows: ERIC, weekday: 5, area: "midia" });
    expect(resolvePresence({ now: NOW, windows, tz: TZ, queue: [] }).state).toBe("off_shift");
  });

  it("união de Mídia + Sistemas com blocos distintos não se sobrepõe errado", () => {
    const rows: AreaScheduleRow[] = [
      ...ERIC,
      { user_id: "eric", work_area: "midia", weekday: 5, start_time: "12:00:00", end_time: "13:30:00" },
    ];
    const { windows } = resolveUserWindows({ rows, weekday: 5, area: "all" });
    expect(windows).toEqual([{ s: 480, e: 1080 }]);
  });

  it("gap entre TODAS as áreas continua official_break", () => {
    const { windows } = resolveUserWindows({ rows: ERIC, weekday: 5, area: "all" });
    const noon = Date.parse("2026-08-21T15:30:00.000Z"); // 12:30 SP
    const presence = resolvePresence({ now: noon, windows, tz: TZ, queue: [] });
    expect(presence.state).toBe("official_break");
    expect(presence.returnsAt).toBe("13:30");
  });

  it("cardAreaMismatch é apenas diagnóstico", () => {
    expect(cardAreaMismatch({ rows: ERIC, weekday: 5, cardArea: "midia", nowMinutes: 873 })).toBe(true);
    expect(cardAreaMismatch({ rows: ERIC, weekday: 5, cardArea: "sistemas", nowMinutes: 873 })).toBe(false);
    expect(cardAreaMismatch({ rows: ERIC, weekday: 5, cardArea: null, nowMinutes: 873 })).toBe(false);
  });
});
