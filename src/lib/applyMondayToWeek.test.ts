import { describe, expect, it } from "vitest";
import {
  commitAndPlanApplyWeek,
  type ScheduleBlock,
} from "@/lib/areaScheduleBlocks";

const block = (o: Partial<ScheduleBlock> & { id: string; weekday: number; start_time: string; end_time: string }): ScheduleBlock => ({
  user_id: "u1",
  work_area: "midia",
  ...o,
});

describe("commitAndPlanApplyWeek (aplicar seg → ter-sex)", () => {
  it("comita o período recém-adicionado antes de montar o plano", async () => {
    // Banco: segunda com apenas 08–12 persistido.
    const db: ScheduleBlock[] = [
      block({ id: "m1", weekday: 1, start_time: "08:00", end_time: "12:00" }),
    ];
    let committed = false;

    const { plan, sourceCount } = await commitAndPlanApplyWeek({
      // Draft válido 13:30–18:00 ainda não salvo (usuário clicou imediatamente).
      pendingCommit: async () => {
        committed = true;
        db.push(block({ id: "m2", weekday: 1, start_time: "13:30", end_time: "18:00" }));
        return true;
      },
      fetchRows: async () => [...db],
      userId: "u1",
      area: "midia",
      sourceWeekday: 1,
      targetWeekdays: [2, 3, 4, 5],
    });

    expect(committed).toBe(true);
    expect(sourceCount).toBe(2);
    expect(plan.toInsert).toHaveLength(8); // 2 blocos × 4 dias
    [2, 3, 4, 5].forEach((wd) => {
      const day = plan.toInsert.filter((b) => b.weekday === wd);
      expect(day.map((b) => `${b.start_time}-${b.end_time}`).sort()).toEqual([
        "08:00-12:00",
        "13:30-18:00",
      ]);
    });
  });

  it("substitui os dias destino sem duplicar períodos", async () => {
    const db: ScheduleBlock[] = [
      block({ id: "m1", weekday: 1, start_time: "08:00", end_time: "12:00" }),
      block({ id: "m2", weekday: 1, start_time: "13:30", end_time: "18:00" }),
      block({ id: "t1", weekday: 2, start_time: "09:00", end_time: "17:00" }),
    ];
    const { plan } = await commitAndPlanApplyWeek({
      fetchRows: async () => db,
      userId: "u1",
      area: "midia",
      sourceWeekday: 1,
      targetWeekdays: [2, 3, 4, 5],
    });
    expect(plan.toDelete).toEqual(["t1"]);
    expect(plan.toInsert.filter((b) => b.weekday === 2)).toHaveLength(2);
  });

  it("usa leitura fresca do banco (rows locais obsoletas não importam)", async () => {
    const { sourceCount } = await commitAndPlanApplyWeek({
      fetchRows: async () => [
        block({ id: "m1", weekday: 1, start_time: "08:00", end_time: "12:00" }),
        block({ id: "m2", weekday: 1, start_time: "13:30", end_time: "18:00" }),
      ],
      userId: "u1",
      area: "midia",
      sourceWeekday: 1,
      targetWeekdays: [2, 3, 4, 5],
    });
    expect(sourceCount).toBe(2);
  });

  it("aborta quando o commit do draft falha", async () => {
    await expect(
      commitAndPlanApplyWeek({
        pendingCommit: async () => false,
        fetchRows: async () => [],
        userId: "u1",
        area: "midia",
        sourceWeekday: 1,
        targetWeekdays: [2],
      }),
    ).rejects.toThrow();
  });

  it("segunda vazia devolve sourceCount 0 (sem plano aplicável)", async () => {
    const { sourceCount, plan } = await commitAndPlanApplyWeek({
      fetchRows: async () => [block({ id: "x", weekday: 3, start_time: "08:00", end_time: "12:00" })],
      userId: "u1",
      area: "midia",
      sourceWeekday: 1,
      targetWeekdays: [2, 3, 4, 5],
    });
    expect(sourceCount).toBe(0);
    expect(plan.toInsert).toHaveLength(0);
  });
});
