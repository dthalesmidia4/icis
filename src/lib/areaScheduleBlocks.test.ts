import { describe, expect, it } from "vitest";
import {
  blocksForCell,
  describeGaps,
  planApplyDayToWeek,
  validateBlock,
  type ScheduleBlock,
} from "./areaScheduleBlocks";

const block = (
  id: string,
  weekday: number,
  start: string,
  end: string,
  area = "midia",
  user = "u1",
): ScheduleBlock => ({
  id,
  user_id: user,
  work_area: area,
  weekday,
  start_time: start,
  end_time: end,
});

describe("blocos de expediente por dia/área", () => {
  it("aceita dois blocos válidos no mesmo dia (expediente + intervalo)", () => {
    const rows = [block("b1", 1, "08:00", "12:00")];
    const existing = blocksForCell(rows, "u1", 1, "midia");
    expect(validateBlock(existing, { start: "13:30", end: "18:00" })).toEqual({ ok: true });
    expect(describeGaps([...existing, block("b2", 1, "13:30", "18:00")])).toEqual(["12:00–13:30"]);
  });

  it("rejeita sobreposição, duplicidade e fim <= início", () => {
    const existing = [block("b1", 1, "08:00", "12:00")];
    expect(validateBlock(existing, { start: "11:00", end: "15:00" }).ok).toBe(false);
    expect(validateBlock(existing, { start: "08:00", end: "12:00" }).ok).toBe(false);
    expect(validateBlock(existing, { start: "18:00", end: "17:00" }).ok).toBe(false);
    // adjacente é permitido
    expect(validateBlock(existing, { start: "12:00", end: "18:00" }).ok).toBe(true);
  });

  it("um único bloco legado continua válido e sem gap", () => {
    const rows = [block("b1", 3, "09:00", "18:00")];
    expect(blocksForCell(rows, "u1", 3, "midia")).toHaveLength(1);
    expect(describeGaps(rows)).toEqual([]);
  });

  it("aplicar segunda → ter–sex copia TODOS os blocos", () => {
    const rows = [
      block("b1", 1, "08:00", "12:00"),
      block("b2", 1, "13:30", "18:00"),
      block("old", 2, "10:00", "16:00"),
    ];
    const plan = planApplyDayToWeek({
      rows,
      userId: "u1",
      area: "midia",
      sourceWeekday: 1,
      targetWeekdays: [2, 3, 4, 5],
    });
    expect(plan.toDelete).toEqual(["old"]);
    expect(plan.toInsert).toHaveLength(8);
    expect(plan.toInsert.filter((b) => b.weekday === 4)).toEqual([
      { weekday: 4, start_time: "08:00", end_time: "12:00" },
      { weekday: 4, start_time: "13:30", end_time: "18:00" },
    ]);
  });

  it("remover 1 bloco preserva os demais", () => {
    const rows = [block("b1", 1, "08:00", "12:00"), block("b2", 1, "13:30", "18:00")];
    const after = rows.filter((r) => r.id !== "b1");
    expect(blocksForCell(after, "u1", 1, "midia").map((r) => r.id)).toEqual(["b2"]);
  });

  it("não confunde áreas diferentes no mesmo dia", () => {
    const rows = [block("b1", 1, "08:00", "12:00", "midia"), block("b2", 1, "08:00", "12:00", "sistemas")];
    expect(blocksForCell(rows, "u1", 1, "sistemas").map((r) => r.id)).toEqual(["b2"]);
  });
});
