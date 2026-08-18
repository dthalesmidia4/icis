import { describe, expect, it, vi } from "vitest";

/**
 * Dados por tabela devolvidos pelo mock do Supabase.
 * `demands` = agenda ocupada; `user_area_schedules` = expediente.
 */
const TABLES: Record<string, any[]> = {
  demands: [],
  user_area_schedules: [],
};

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

vi.mock("@/lib/areaConflicts", () => ({
  AREA_LABEL: { midia: "Mídia", sistemas: "Sistemas" },
  findScheduleAreaConflicts: vi.fn(async () => []),
  findAreaConflicts: vi.fn(async () => []),
  checkAreaConflict: vi.fn(async () => null),
}));

import { suggestFreeSlot } from "@/lib/scheduleOccupancy";

const NOW = new Date(2026, 7, 18, 14, 12); // 18/08/2026 (terça) 14:12 local
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
