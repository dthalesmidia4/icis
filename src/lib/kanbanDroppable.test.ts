import { describe, it, expect } from "vitest";
import {
  parseKanbanDroppableId,
  decideKanbanDrop,
  isCardDraggable,
} from "./kanbanDroppable";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

describe("parseKanbanDroppableId", () => {
  it("uuid simples devolve o próprio usuário", () => {
    expect(parseKanbanDroppableId(U1)).toEqual({ userId: U1, focusKind: null, unassigned: false });
  });

  it.each(["production", "review", "awaiting", "evaluate"] as const)(
    "id composto ::%s devolve uuid + agrupamento",
    (kind) => {
      expect(parseKanbanDroppableId(`${U1}::${kind}`)).toEqual({
        userId: U1,
        focusKind: kind,
        unassigned: false,
      });
    },
  );

  it("__unassigned__ é sem responsável", () => {
    const parsed = parseKanbanDroppableId("__unassigned__");
    expect(parsed.unassigned).toBe(true);
    expect(parsed.userId).toBeNull();
  });
});

describe("decideKanbanDrop", () => {
  it("string composta nunca chega como newAssignedTo", () => {
    const d = decideKanbanDrop({
      sourceDroppableId: `${U1}::production`,
      destinationDroppableId: `${U2}::production`,
      currentAssignedTo: U1,
    });
    expect(d.reassign).toBe(true);
    expect(d.newAssignedTo).toBe(U2);
  });

  it("drop entre sub-colunas do mesmo usuário não reassigna", () => {
    const d = decideKanbanDrop({
      sourceDroppableId: `${U1}::production`,
      destinationDroppableId: `${U1}::review`,
      currentAssignedTo: U1,
    });
    expect(d.reassign).toBe(false);
    expect(d.ignoredReason).toBe("same_owner");
  });

  it("drop em sem responsável limpa o assigned_to", () => {
    const d = decideKanbanDrop({
      sourceDroppableId: U1,
      destinationDroppableId: "__unassigned__",
      currentAssignedTo: U1,
    });
    expect(d).toMatchObject({ reassign: true, newAssignedTo: null });
  });
});

describe("isCardDraggable", () => {
  const base = { selectionMode: false, historyMode: false } as const;

  it.each(["production", "review", "awaiting"] as const)("card %s é arrastável", (kind) => {
    expect(isCardDraggable({ ...base, kind })).toBe(true);
  });

  it("selectionMode desabilita todos", () => {
    expect(isCardDraggable({ ...base, selectionMode: true, kind: "production" })).toBe(false);
  });

  it("history/evaluate/queued não são arrastáveis", () => {
    expect(isCardDraggable({ ...base, kind: "history" })).toBe(false);
    expect(isCardDraggable({ ...base, kind: "evaluate" })).toBe(false);
    expect(isCardDraggable({ ...base, kind: "queued" })).toBe(false);
    expect(isCardDraggable({ ...base, historyMode: true, kind: "production" })).toBe(false);
  });

  it("fila não liberada não arrasta", () => {
    expect(
      isCardDraggable({ ...base, kind: "production", operationallyReleased: false }),
    ).toBe(false);
  });
});
