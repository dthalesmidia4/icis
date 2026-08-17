import { describe, it, expect } from "vitest";
import {
  countPendingItems,
  computeProgress,
  shouldOpenAlterationsTab,
  hasAnyChangeRequest,
  shouldAutoResolve,
  normalizeDraftItems,
  isEmptyChangeRequestDraft,
  type ChangeRequestWithItems,
} from "./demandChangeRequests";

const makeRequest = (
  overrides: Partial<ChangeRequestWithItems> = {},
): ChangeRequestWithItems => ({
  id: "req-1",
  tenant_id: "t1",
  demand_id: "d1",
  requested_by: "u1",
  source_function_key: "revisar",
  target_function_key: "criar",
  notes: null,
  status: "active",
  created_at: new Date().toISOString(),
  resolved_at: null,
  updated_at: new Date().toISOString(),
  items: [],
  ...overrides,
});

const item = (id: string, done: boolean, position = 0) => ({
  id,
  request_id: "req-1",
  tenant_id: "t1",
  text: `item ${id}`,
  is_completed: done,
  completed_by: done ? "u1" : null,
  completed_at: done ? new Date().toISOString() : null,
  position,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe("demandChangeRequests", () => {
  it("card sem alteração não abre em Alterações", () => {
    expect(shouldOpenAlterationsTab(null)).toBe(false);
    expect(countPendingItems(null)).toBe(0);
  });

  it("request ativa só com texto não abre automaticamente", () => {
    const r = makeRequest({ notes: "Trocar a cor do fundo" });
    expect(shouldOpenAlterationsTab(r)).toBe(false);
    expect(hasAnyChangeRequest(r, [])).toBe(true);
  });

  it("request ativa com 1 item pendente abre em Alterações", () => {
    const r = makeRequest({ items: [item("a", true), item("b", true, 1), item("c", false, 2)] });
    expect(countPendingItems(r)).toBe(1);
    expect(shouldOpenAlterationsTab(r)).toBe(true);
    expect(computeProgress(r)).toEqual({ done: 2, total: 3 });
  });

  it("rascunho nunca abre em Alterações", () => {
    const r = makeRequest({ items: [item("a", false)] });
    expect(shouldOpenAlterationsTab(r, { isDraft: true })).toBe(false);
  });

  it("todos os itens concluídos → auto resolve", () => {
    const done = makeRequest({ items: [item("a", true), item("b", true, 1)] });
    expect(shouldAutoResolve(done)).toBe(true);
    expect(shouldOpenAlterationsTab(done)).toBe(false);
  });

  it("solicitação sem itens não é resolvida automaticamente", () => {
    expect(shouldAutoResolve(makeRequest({ notes: "texto" }))).toBe(false);
  });

  it("solicitação não ativa não gera pendências", () => {
    const r = makeRequest({ status: "resolved", items: [item("a", false)] });
    expect(countPendingItems(r)).toBe(0);
    expect(shouldAutoResolve(r)).toBe(false);
  });

  it("normaliza itens removendo vazios e reindexando", () => {
    expect(normalizeDraftItems(["  a ", "", "   ", "b"])).toEqual([
      { text: "a", position: 0 },
      { text: "b", position: 1 },
    ]);
  });

  it("draft vazio não deve criar request", () => {
    expect(isEmptyChangeRequestDraft("   ", ["", "  "])).toBe(true);
    expect(isEmptyChangeRequestDraft("ajustar", [])).toBe(false);
    expect(isEmptyChangeRequestDraft("", ["item"])).toBe(false);
  });
});
