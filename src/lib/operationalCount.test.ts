import { describe, it, expect } from "vitest";
import {
  countOperationalDemands,
  describeCollaboratorCounts,
  isActiveOwnedRow,
  type CountableDemandRow,
} from "./operationalCount";

const LUCIA = "lucia";

/** Fixture do caso real: 66 ativas, 29 com dispatch ativo → 37 na fila. */
function fixture() {
  const rows: CountableDemandRow[] = [];
  for (let i = 0; i < 66; i++) {
    rows.push({ id: `c${i}`, assigned_to: LUCIA, archived_at: null, is_draft: false });
  }
  // ruído que nunca deve contar
  rows.push({ id: "arch", assigned_to: LUCIA, archived_at: "2026-01-01", is_draft: false });
  rows.push({ id: "draft", assigned_to: LUCIA, archived_at: null, is_draft: true });
  rows.push({ id: "outro", assigned_to: "henrique", archived_at: null, is_draft: false });
  const dispatch = new Set<string>(Array.from({ length: 29 }, (_, i) => `c${i}`));
  return { rows, dispatch };
}

describe("countOperationalDemands", () => {
  it("raw=66, dispatch ativo=29 => operational=37", () => {
    const { rows, dispatch } = fixture();
    const counts = countOperationalDemands(rows, LUCIA, dispatch);
    expect(counts.totalActiveDemandCount).toBe(66);
    expect(counts.scheduledDemandCount).toBe(29);
    expect(counts.operationalDemandCount).toBe(37);
  });

  it("additional_assignee não infla ownership principal", () => {
    const rows: CountableDemandRow[] = [
      { id: "a", assigned_to: "henrique", archived_at: null, is_draft: false },
    ];
    (rows[0] as any).additional_assignees = [LUCIA];
    expect(countOperationalDemands(rows, LUCIA, new Set()).totalActiveDemandCount).toBe(0);
  });

  it("arquivado e rascunho ficam fora", () => {
    expect(isActiveOwnedRow({ id: "x", assigned_to: LUCIA, archived_at: "2026-01-01" }, LUCIA)).toBe(false);
    expect(isActiveOwnedRow({ id: "x", assigned_to: LUCIA, is_draft: true }, LUCIA)).toBe(false);
    expect(isActiveOwnedRow({ id: "x", assigned_to: LUCIA }, LUCIA)).toBe(true);
  });
});

describe("describeCollaboratorCounts", () => {
  it("mostra agendadas separadamente", () => {
    const { rows, dispatch } = fixture();
    const counts = countOperationalDemands(rows, LUCIA, dispatch);
    expect(describeCollaboratorCounts(counts)).toBe(
      "+29 com publicação agendada · 66 ativas no total",
    );
  });

  it("sem agendadas não gera texto secundário", () => {
    expect(
      describeCollaboratorCounts({
        totalActiveDemandCount: 5,
        scheduledDemandCount: 0,
        operationalDemandCount: 5,
      }),
    ).toBeNull();
  });
});
