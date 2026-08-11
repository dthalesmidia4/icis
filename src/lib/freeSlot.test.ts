import { describe, it, expect } from "vitest";
import {
  buildDayWindows,
  firstFreeStart,
  mergeSpans,
  toMin,
  fromMin,
  DEFAULT_WORK_WINDOWS,
} from "@/lib/freeSlot";

describe("mergeSpans", () => {
  it("une sobreposições e descarta spans vazios", () => {
    expect(mergeSpans([{ s: 10, e: 20 }, { s: 15, e: 30 }, { s: 40, e: 40 }])).toEqual([
      { s: 10, e: 30 },
    ]);
  });
});

describe("buildDayWindows", () => {
  it("sem configuração usa o expediente padrão", () => {
    expect(buildDayWindows([], "midia")).toEqual(DEFAULT_WORK_WINDOWS);
  });

  it("usa apenas as faixas da área pedida", () => {
    const rows = [
      { work_area: "midia", start_time: "08:00", end_time: "12:00" },
      { work_area: "sistemas", start_time: "13:00", end_time: "18:00" },
    ];
    expect(buildDayWindows(rows, "midia")).toEqual([{ s: toMin("08:00"), e: toMin("12:00") }]);
  });

  it("dia dedicado a outra área fica indisponível", () => {
    const rows = [{ work_area: "sistemas", start_time: "09:00", end_time: "18:00" }];
    expect(buildDayWindows(rows, "midia")).toEqual([]);
  });
});

describe("firstFreeStart", () => {
  const windows = [{ s: toMin("09:00"), e: toMin("12:00") }];

  it("devolve o início do expediente quando o dia está livre", () => {
    const start = firstFreeStart({ windows, busy: [], duration: 60 });
    expect(start !== null && fromMin(start)).toBe("09:00");
  });

  it("pula o bloco ocupado", () => {
    const busy = [{ s: toMin("09:00"), e: toMin("10:30") }];
    const start = firstFreeStart({ windows, busy, duration: 60 });
    expect(start !== null && fromMin(start)).toBe("10:30");
  });

  it("respeita o horário mínimo pedido", () => {
    const start = firstFreeStart({ windows, busy: [], duration: 60, earliest: toMin("10:00") });
    expect(start !== null && fromMin(start)).toBe("10:00");
  });

  it("retorna null quando não cabe na janela", () => {
    expect(firstFreeStart({ windows, busy: [], duration: 300 })).toBeNull();
  });

  it("ignora inícios já reprovados", () => {
    const start = firstFreeStart({ windows, busy: [], duration: 60, rejected: [toMin("09:00")] });
    expect(start !== null && fromMin(start)).toBe("09:15");
  });

  it("atravessa o almoço usando a segunda janela do expediente padrão", () => {
    const busy = [{ s: toMin("09:00"), e: toMin("12:00") }];
    const start = firstFreeStart({ windows: DEFAULT_WORK_WINDOWS, busy, duration: 60 });
    expect(start !== null && fromMin(start)).toBe("13:30");
  });
});
