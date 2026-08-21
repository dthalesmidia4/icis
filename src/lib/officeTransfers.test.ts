import { describe, expect, it } from "vitest";
import {
  buildAssignmentSnapshot,
  dedupeTransfers,
  detectTransfers,
} from "./officeTransfers";

const card = (id: string, assignedTo: string | null, title = `Card ${id}`) => ({
  id,
  title,
  assignedTo,
});

describe("detectTransfers", () => {
  it("A→B gera exatamente 1 evento", () => {
    const prev = buildAssignmentSnapshot([card("d1", "A"), card("d2", "C")]);
    const next = buildAssignmentSnapshot([card("d1", "B"), card("d2", "C")]);
    const events = detectTransfers(prev, next);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ demandId: "d1", fromUserId: "A", toUserId: "B" });
  });

  it("A→A não gera evento", () => {
    const prev = buildAssignmentSnapshot([card("d1", "A")]);
    const next = buildAssignmentSnapshot([card("d1", "A")]);
    expect(detectTransfers(prev, next)).toHaveLength(0);
  });

  it("reorder (mesma pessoa, datas diferentes) não gera evento", () => {
    const prev = buildAssignmentSnapshot([card("d1", "A"), card("d2", "A")]);
    // ordem invertida no array = reorder na fila, mesmo assigned_to
    const next = buildAssignmentSnapshot([card("d2", "A"), card("d1", "A")]);
    expect(detectTransfers(prev, next)).toHaveLength(0);
  });

  it("snapshot inicial não gera eventos", () => {
    const next = buildAssignmentSnapshot([card("d1", "A"), card("d2", "B")]);
    expect(detectTransfers(null, next)).toHaveLength(0);
  });

  it("A→null e null→B não são transferências", () => {
    const prev = buildAssignmentSnapshot([card("d1", "A"), card("d2", null)]);
    const next = buildAssignmentSnapshot([card("d1", null), card("d2", "B")]);
    expect(detectTransfers(prev, next)).toHaveLength(0);
  });

  it("card novo não é transferência", () => {
    const prev = buildAssignmentSnapshot([card("d1", "A")]);
    const next = buildAssignmentSnapshot([card("d1", "A"), card("d9", "B")]);
    expect(detectTransfers(prev, next)).toHaveLength(0);
  });
});

describe("dedupeTransfers", () => {
  const ev = { demandId: "d1", title: "t", fromUserId: "A", toUserId: "B" };

  it("evento duplicado dentro da janela não repete", () => {
    const first = dedupeTransfers([ev], {}, 1000);
    expect(first.events).toHaveLength(1);
    const second = dedupeTransfers([ev], first.recent, 2000);
    expect(second.events).toHaveLength(0);
  });

  it("depois da janela o mesmo evento é aceito novamente", () => {
    const first = dedupeTransfers([ev], {}, 1000);
    const later = dedupeTransfers([ev], first.recent, 1000 + 6000);
    expect(later.events).toHaveLength(1);
  });
});
