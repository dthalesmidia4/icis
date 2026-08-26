import { describe, expect, it } from "vitest";
import { hasOfficeCardSpan, officeCardSpan, officeTimeLabel } from "./officeCardTime";

describe("officeCardTime", () => {
  it("formata data + hora curta", () => {
    expect(officeTimeLabel("2026-08-24", "17:30:00")).toBe("24/08 17:30");
    expect(officeTimeLabel("2026-08-24", null)).toBe("24/08");
    expect(officeTimeLabel(null, "17:30")).toBeNull();
  });

  it("mostra início e término quando ambos existem", () => {
    expect(
      officeCardSpan({
        dueDate: "2026-08-24",
        dueTime: "17:30",
        deliveryDate: "2026-08-26",
        deliveryTime: "18:00",
      }),
    ).toEqual({ start: "24/08 17:30", end: "26/08 18:00" });
  });

  it("não inventa término quando falta a entrega", () => {
    const span = officeCardSpan({ dueDate: "2026-08-24", dueTime: "09:00" });
    expect(span.end).toBeNull();
    expect(hasOfficeCardSpan(span)).toBe(true);
  });

  it("mostra apenas o término quando falta o início", () => {
    const span = officeCardSpan({ deliveryDate: "2026-08-26", deliveryTime: "18:00" });
    expect(span).toEqual({ start: null, end: "26/08 18:00" });
    expect(hasOfficeCardSpan(span)).toBe(true);
  });

  it("sem datas não há faixa temporal", () => {
    expect(hasOfficeCardSpan(officeCardSpan({}))).toBe(false);
  });
});
