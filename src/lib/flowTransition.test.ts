import { describe, it, expect } from "vitest";
import { applyFlowCasFilters, buildFlowState } from "@/lib/flowTransition";

/** Query builder falso que registra os filtros aplicados. */
function fakeQuery() {
  const calls: Array<[string, string, any]> = [];
  const q: any = {
    calls,
    eq(col: string, val: any) {
      calls.push(["eq", col, val]);
      return q;
    },
    is(col: string, val: any) {
      calls.push(["is", col, val]);
      return q;
    },
  };
  return q;
}

describe("applyFlowCasFilters", () => {
  it("compara a etapa esperada com eq quando há chave", () => {
    const q = fakeQuery();
    applyFlowCasFilters(q, { expectedFunctionKey: "revisar" });
    expect(q.calls).toEqual([["eq", "current_function_key", "revisar"]]);
  });

  it("usa is null quando a etapa esperada é vazia", () => {
    const q = fakeQuery();
    applyFlowCasFilters(q, { expectedFunctionKey: null });
    expect(q.calls).toEqual([["is", "current_function_key", null]]);
  });

  it("ignora o responsável quando não informado (undefined)", () => {
    const q = fakeQuery();
    applyFlowCasFilters(q, { expectedFunctionKey: "captar", expectedAssignee: undefined });
    expect(q.calls).toEqual([["eq", "current_function_key", "captar"]]);
  });

  it("compara responsável esperado e aceita null como is null", () => {
    const q1 = fakeQuery();
    applyFlowCasFilters(q1, { expectedFunctionKey: "captar", expectedAssignee: "user-1" });
    expect(q1.calls).toEqual([
      ["eq", "current_function_key", "captar"],
      ["eq", "assigned_to", "user-1"],
    ]);

    const q2 = fakeQuery();
    applyFlowCasFilters(q2, { expectedFunctionKey: "captar", expectedAssignee: null });
    expect(q2.calls).toEqual([
      ["eq", "current_function_key", "captar"],
      ["is", "assigned_to", null],
    ]);
  });

  it("não aplica filtro algum quando nada é esperado", () => {
    const q = fakeQuery();
    applyFlowCasFilters(q, {});
    expect(q.calls).toEqual([]);
  });
});

describe("buildFlowState", () => {
  it("devolve undefined quando não há linha (transição stale)", () => {
    expect(buildFlowState(null)).toBeUndefined();
    expect(buildFlowState(undefined)).toBeUndefined();
  });

  it("normaliza campos ausentes e additional_assignees inválido", () => {
    const state = buildFlowState({ id: "d1", additional_assignees: null });
    expect(state?.assigned_to).toBeNull();
    expect(state?.current_function_key).toBeNull();
    expect(state?.additional_assignees).toEqual([]);
  });

  it("preserva o estado real devolvido pelo banco", () => {
    const state = buildFlowState({
      assigned_to: "user-2",
      current_function_key: "revisar",
      released_at: "2026-08-11T10:00:00Z",
      additional_assignees: ["user-3", null],
      client_resend_count: 2,
    });
    expect(state).toMatchObject({
      assigned_to: "user-2",
      current_function_key: "revisar",
      released_at: "2026-08-11T10:00:00Z",
      additional_assignees: ["user-3"],
      client_resend_count: 2,
    });
  });
});
