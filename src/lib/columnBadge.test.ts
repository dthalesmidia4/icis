import { describe, it, expect } from "vitest";
import { countColumnBadge, describeColumnBadge } from "./columnBadge";

const card = (id: string) => ({ id });

describe("countColumnBadge", () => {
  it("conta IDs únicos entre agrupamentos", () => {
    const production = [card("a"), card("b")];
    const review = [card("c")];
    const awaiting = [card("d")];
    expect(countColumnBadge([production, review, awaiting])).toBe(4);
  });

  it("card em revisão não é contado de novo na produção", () => {
    const production = [card("a"), card("b")];
    const review = [card("b")]; // mesmo ID em dois agrupamentos
    expect(countColumnBadge([production, review])).toBe(2);
  });

  it("aguardando cliente não duplica o mesmo ID", () => {
    expect(countColumnBadge([[card("a")], [card("a")], [card("a")]])).toBe(1);
  });

  it("sub-colunas do modo foco somam sem duplicar", () => {
    expect(
      countColumnBadge([
        [card("a"), card("b")],
        [card("b")],
        [card("c")],
        null,
        undefined,
      ]),
    ).toBe(3);
  });

  it("realtime que concatena o mesmo card não altera o total", () => {
    const base = [card("a"), card("b")];
    const afterRealtime = [...base, card("b")];
    expect(countColumnBadge([afterRealtime])).toBe(countColumnBadge([base]));
  });
});

describe("describeColumnBadge", () => {
  it("caso Lúcia: badge 37 e total 66 explica os 29 fora da visualização", () => {
    expect(describeColumnBadge({ badge: 37, totalActiveDemandCount: 66 })).toBe(
      "37 na fila desta coluna · 29 fora desta visualização (publicação/agendamento, avaliação ou fila) · 66 atribuídas no total",
    );
  });

  it("sem diferença não inventa texto extra", () => {
    expect(describeColumnBadge({ badge: 12, totalActiveDemandCount: 12 })).toBe(
      "12 na fila desta coluna",
    );
    expect(describeColumnBadge({ badge: 12, totalActiveDemandCount: null })).toBe(
      "12 na fila desta coluna",
    );
  });
});
