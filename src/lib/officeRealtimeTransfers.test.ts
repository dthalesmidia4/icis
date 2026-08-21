import { describe, expect, it } from "vitest";
import {
  buildAssignmentSnapshot,
  dedupeTransfers,
  detectTransfers,
  transferFromRealtime,
} from "@/lib/officeTransfers";

const base = () =>
  buildAssignmentSnapshot([{ id: "d1", title: "Card 1", assignedTo: "A" }]);

describe("transferFromRealtime", () => {
  it("gera evento A→B imediatamente no UPDATE realtime", () => {
    const { event, snapshot } = transferFromRealtime(base(), { id: "d1", assignedTo: "B" });
    expect(event).toEqual({ demandId: "d1", title: "Card 1", fromUserId: "A", toUserId: "B" });
    expect(snapshot?.d1.assignedTo).toBe("B");
  });

  it("usa old.assigned_to quando disponível", () => {
    const { event } = transferFromRealtime(base(), {
      id: "d1",
      assignedTo: "C",
      oldAssignedTo: "B",
    });
    expect(event?.fromUserId).toBe("B");
    expect(event?.toUserId).toBe("C");
  });

  it("snapshot posterior já com B não repete a animação", () => {
    const { snapshot } = transferFromRealtime(base(), { id: "d1", assignedTo: "B" });
    const refetched = buildAssignmentSnapshot([{ id: "d1", title: "Card 1", assignedTo: "B" }]);
    expect(detectTransfers(snapshot, refetched)).toEqual([]);
  });

  it("dois UPDATEs idênticos resultam em uma única animação (dedupe)", () => {
    const first = transferFromRealtime(base(), { id: "d1", assignedTo: "B" });
    const second = transferFromRealtime(base(), { id: "d1", assignedTo: "B" });
    const now = Date.now();
    const r1 = dedupeTransfers([first.event!], {}, now);
    const r2 = dedupeTransfers([second.event!], r1.recent, now + 100);
    expect(r1.events).toHaveLength(1);
    expect(r2.events).toHaveLength(0);
  });

  it("evento sem mudança de responsável (título/status) não anima", () => {
    const { event } = transferFromRealtime(base(), { id: "d1", title: "Novo título", assignedTo: "A" });
    expect(event).toBeNull();
  });

  it("baseline ausente nunca anima", () => {
    expect(transferFromRealtime(null, { id: "d1", assignedTo: "B" }).event).toBeNull();
  });

  it("card desconhecido no snapshot não anima", () => {
    expect(transferFromRealtime(base(), { id: "zz", assignedTo: "B" }).event).toBeNull();
  });

  it("A→null (desatribuição) não anima", () => {
    expect(transferFromRealtime(base(), { id: "d1", assignedTo: null }).event).toBeNull();
  });
});
