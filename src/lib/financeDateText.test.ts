import { describe, it, expect } from "vitest";
import {
  calendarDateToIso,
  dateTextToIso,
  isIncompleteDateText,
  isoToCalendarDate,
  isoToDateText,
  isRealDate,
  maskDateText,
} from "./financeDateText";

describe("financeDateText", () => {
  it("digitação 05/08/2026 vira ISO 2026-08-05", () => {
    expect(dateTextToIso("05/08/2026")).toBe("2026-08-05");
  });

  it("ISO vira texto brasileiro", () => {
    expect(isoToDateText("2026-08-05")).toBe("05/08/2026");
    expect(isoToDateText(null)).toBe("");
  });

  it("máscara insere barras conforme digita e ao colar", () => {
    expect(maskDateText("0")).toBe("0");
    expect(maskDateText("05")).toBe("05");
    expect(maskDateText("058")).toBe("05/8");
    expect(maskDateText("05082026")).toBe("05/08/2026");
    expect(maskDateText("05/08/2026999")).toBe("05/08/2026");
  });

  it("edição parcial não produz ISO, mas é sinalizada como incompleta", () => {
    expect(dateTextToIso("05/0")).toBeNull();
    expect(isIncompleteDateText("05/0")).toBe(true);
    expect(isIncompleteDateText("")).toBe(false);
    expect(isIncompleteDateText("05/08/2026")).toBe(false);
  });

  it("data impossível não vira outra data silenciosamente", () => {
    expect(dateTextToIso("31/02/2026")).toBeNull();
    expect(dateTextToIso("00/01/2026")).toBeNull();
    expect(dateTextToIso("10/13/2026")).toBeNull();
    expect(isRealDate(29, 2, 2024)).toBe(true);
    expect(isRealDate(29, 2, 2026)).toBe(false);
  });

  it("ida e volta com o calendário preserva o dia", () => {
    const date = isoToCalendarDate("2026-08-05");
    expect(date).toBeInstanceOf(Date);
    expect(calendarDateToIso(date as Date)).toBe("2026-08-05");
    expect(isoToCalendarDate("2026-02-31")).toBeUndefined();
  });
});
