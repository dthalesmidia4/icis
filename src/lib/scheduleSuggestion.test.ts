import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dados por tabela devolvidos pelo mock do Supabase.
 * `demands` = agenda ocupada; `user_area_schedules` = expediente.
 */
const TABLES: Record<string, any[]> = {
  demands: [],
  user_area_schedules: [],
};

/** Feriados injetados na MESMA fonte usada pelo motor de reorganização. */
const HOLIDAYS: string[] = [];

function chain(table: string) {
  const thenable: any = {
    select: () => thenable,
    eq: () => thenable,
    neq: () => thenable,
    is: () => thenable,
    or: () => thenable,
    in: () => thenable,
    order: () => thenable,
    then: (resolve: any) => resolve({ data: TABLES[table] ?? [], error: null }),
  };
  return thenable;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => chain(table) },
}));

vi.mock("@/lib/dailyCards", () => ({
  fetchHolidaysInRange: vi.fn(async () => new Set<string>(HOLIDAYS)),
}));

vi.mock("@/lib/areaConflicts", () => ({
  AREA_LABEL: { midia: "Mídia", sistemas: "Sistemas" },
  findScheduleAreaConflict: vi.fn(async () => ({ conflicts: [], reason: null })),
  findAreaConflicts: vi.fn(async () => []),
  checkAreaConflict: vi.fn(async () => null),
}));

import { suggestFreeSlot } from "@/lib/scheduleOccupancy";

// Instante UTC cuja hora de parede em São Paulo é 14:12 de 18/08/2026 (terça).
const NOW = new Date("2026-08-18T17:12:00.000Z");
const TENANT = "t1";
const USER = "u1";

const card = (over: Record<string, any> = {}) => ({
  id: "c1",
  work_area: "midia",
  current_function_key: "criar_arte",
  demand_type: "Criativo estático",
  demand_type_key: "criativo_estatico",
  ...over,
});

beforeEach(() => {
  HOLIDAYS.length = 0;
});

describe("suggestFreeSlot — nunca devolve horário vencido", () => {
  it("card com due_date de ontem recebe slot a partir de agora", async () => {
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card({ due_date: "2026-08-17", due_time: "14:30" }),
      now: NOW,
      durations: {} as any,
    });
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe("2026-08-18");
    expect(slot!.startTime >= "14:15").toBe(true);
  });

  it("card com due_date de vários dias atrás também não volta ao passado", async () => {
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card({ due_date: "2026-08-14", due_time: "15:55" }),
      now: NOW,
      durations: {} as any,
    });
    expect(slot).not.toBeNull();
    expect(`${slot!.date}T${slot!.startTime}` >= "2026-08-18T14:12").toBe(true);
  });

  it("card com due_date futuro mantém a data pedida", async () => {
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card({ due_date: "2026-08-20", due_time: "10:00" }),
      now: NOW,
      durations: {} as any,
    });
    expect(slot!.date).toBe("2026-08-20");
    expect(slot!.startTime >= "10:00").toBe(true);
  });

  it("etapa sem agenda operacional não recebe sugestão", async () => {
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card({ current_function_key: "aguardando_cliente", due_date: "2026-08-14", due_time: "15:55" }),
      now: NOW,
      durations: {} as any,
    });
    expect(slot).toBeNull();
  });
});

describe("suggestFreeSlot — relógio canônico e calendário", () => {
  it("usa o wallclock de São Paulo, não o timezone do runtime", async () => {
    // 02:30 UTC de 19/08 = 23:30 de 18/08 em São Paulo: o dia 18 já acabou.
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card(),
      now: new Date("2026-08-19T02:30:00.000Z"),
      durations: {} as any,
    });
    expect(slot).not.toBeNull();
    expect(`${slot!.date}T${slot!.startTime}` >= "2026-08-19T09:00").toBe(true);
  });

  it("pula feriado e cai no próximo dia útil", async () => {
    HOLIDAYS.push("2026-08-19");
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card({ due_date: "2026-08-19", due_time: "09:00" }),
      now: NOW,
      durations: {} as any,
    });
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe("2026-08-20");
  });

  it("pula o fim de semana", async () => {
    const slot = await suggestFreeSlot({
      tenantId: TENANT,
      userId: USER,
      card: card({ due_date: "2026-08-22", due_time: "09:00" }), // sábado
      now: NOW,
      durations: {} as any,
    });
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe("2026-08-24"); // segunda
  });
});
