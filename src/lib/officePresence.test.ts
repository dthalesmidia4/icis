import { describe, it, expect, vi } from "vitest";

// `reorderSequence` (usado por officePresence/officeSchedule) importa dailyCards,
// que carrega o client Supabase — mockado aqui como nos demais testes puros.
vi.mock("@/lib/dailyCards", () => ({
  fetchHolidaysInRange: vi.fn(async () => new Set<string>()),
}));

import { resolvePresence } from "@/lib/officePresence";
import {
  groupSchedulesByUser,
  resolveUserWindows,
  workHoursWindows,
  type AreaScheduleRow,
} from "@/lib/officeSchedule";
import { toMin } from "@/lib/freeSlot";

// Sexta-feira 21/08/2026 (weekday 5) em America/Sao_Paulo (UTC-3).
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.UTC(2026, 7, 21, h + 3, m, 0);
};
const WEEKDAY = 5;

const TENANT_WORK_HOURS = {
  start: "09:00",
  end: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:30",
  tz: "America/Sao_Paulo",
} as any;

const win = (a: string, b: string) => ({ s: toMin(a), e: toMin(b) });

const row = (over: Partial<AreaScheduleRow> = {}): AreaScheduleRow => ({
  user_id: "u1",
  work_area: "midia",
  weekday: WEEKDAY,
  start_time: "08:00",
  end_time: "12:00",
  ...over,
});

describe("officeSchedule", () => {
  it("deriva janelas do tenant com o almoço como gap", () => {
    expect(workHoursWindows(TENANT_WORK_HOURS)).toEqual([win("09:00", "12:00"), win("13:30", "18:00")]);
  });

  it("usa fallback do tenant quando o usuário não tem nenhuma faixa", () => {
    const res = resolveUserWindows({ rows: [], weekday: WEEKDAY, area: "all", workHours: TENANT_WORK_HOURS });
    expect(res.source).toBe("fallback");
    expect(res.windows).toEqual([win("09:00", "12:00"), win("13:30", "18:00")]);
  });

  it("NÃO usa fallback quando existe agenda específica sem linha naquele weekday", () => {
    const res = resolveUserWindows({
      rows: [row({ weekday: 1 })],
      weekday: WEEKDAY,
      area: "all",
      workHours: TENANT_WORK_HOURS,
    });
    expect(res.source).toBe("schedule");
    expect(res.windows).toEqual([]);
  });

  it("agrupa linhas por usuário", () => {
    const grouped = groupSchedulesByUser([row(), row({ user_id: "u2" })]);
    expect(Object.keys(grouped).sort()).toEqual(["u1", "u2"]);
    expect(grouped.u1).toHaveLength(1);
  });
});

describe("officePresence — janela vence card iniciado", () => {
  const startedAt10 = [{ id: "d1", startTs: at("10:00"), endTs: null }];
  const windows = [win("09:00", "12:00"), win("13:30", "18:00")];

  it("12:30 com card iniciado às 10:00 => official_break e retorno 13:30", () => {
    const res = resolvePresence({ now: at("12:30"), queue: startedAt10, windows });
    expect(res.state).toBe("official_break");
    expect(res.state).not.toBe("working_now");
    expect(res.returnsAt).toBe("13:30");
  });

  it("13:31 com o mesmo card => working_now", () => {
    const res = resolvePresence({ now: at("13:31"), queue: startedAt10, windows });
    expect(res.state).toBe("working_now");
  });

  it("antes do início e depois do fim => off_shift", () => {
    expect(resolvePresence({ now: at("08:30"), queue: startedAt10, windows }).state).toBe("off_shift");
    expect(resolvePresence({ now: at("19:00"), queue: startedAt10, windows }).state).toBe("off_shift");
  });

  it("dia sem expediente (sem janelas) => off_shift", () => {
    expect(resolvePresence({ now: at("10:00"), queue: startedAt10, windows: [] }).state).toBe("off_shift");
  });
});

describe("officePresence — agenda específica do colaborador", () => {
  it("agenda 08:00–12:00 e 13:00–17:00 às 12:30 => official_break", () => {
    const rows = [row(), row({ start_time: "13:00", end_time: "17:00" })];
    const { windows, source } = resolveUserWindows({
      rows,
      weekday: WEEKDAY,
      area: "midia",
      workHours: TENANT_WORK_HOURS,
    });
    expect(source).toBe("schedule");
    const res = resolvePresence({
      now: at("12:30"),
      queue: [{ id: "d1", startTs: at("10:00"), endTs: null }],
      windows,
    });
    expect(res.state).toBe("official_break");
    expect(res.returnsAt).toBe("13:00");
  });

  it("agenda existe no dia mas sem faixa de midia => card de Mídia nunca working_now", () => {
    const rows = [row({ work_area: "sistemas", start_time: "09:00", end_time: "18:00" })];
    const { windows } = resolveUserWindows({
      rows,
      weekday: WEEKDAY,
      area: "midia",
      workHours: TENANT_WORK_HOURS,
    });
    const res = resolvePresence({
      now: at("10:00"),
      queue: [{ id: "d1", startTs: at("09:30"), endTs: null }],
      windows,
    });
    expect(res.state).not.toBe("working_now");
    expect(res.state).toBe("off_shift");
  });
});

describe("officePresence — pausas dentro da janela", () => {
  const windows = [win("09:00", "12:00"), win("13:30", "18:00")];

  it("gap curto antes do próximo card => micro_break com minutos", () => {
    const res = resolvePresence({
      now: at("10:00"),
      queue: [{ id: "d1", startTs: at("10:20"), endTs: null }],
      windows,
    });
    expect(res.state).toBe("micro_break");
    expect(res.minutesToNext).toBe(20);
  });

  it("dentro da janela sem nenhuma pista de tarefa => available", () => {
    expect(resolvePresence({ now: at("10:00"), queue: [], windows }).state).toBe("available");
  });
});
