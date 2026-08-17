import { describe, it, expect } from "vitest";
import {
  countPendingItems,
  computeProgress,
  shouldOpenAlterationsTab,
  hasAnyChangeRequest,
  shouldAutoResolve,
  normalizeDraftItems,
  isEmptyChangeRequestDraft,
  shouldShowAlterationsTab,
  canConfirmChangeRequest,
  normalizeChangeRequestDraft,
  type ChangeRequestWithItems,
} from "./demandChangeRequestRules";

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

describe("visibilidade da aba e modos do modal", () => {
  it("aba Alterações existe em card salvo sem qualquer solicitação", () => {
    expect(shouldShowAlterationsTab({ isDraft: false })).toBe(true);
    expect(shouldShowAlterationsTab()).toBe(true);
  });

  it("rascunho não mostra a aba", () => {
    expect(shouldShowAlterationsTab({ isDraft: true })).toBe(false);
  });

  it("aba permanece visível depois de solicitação resolvida/histórica", () => {
    const resolved = makeRequest({ status: "resolved", items: [item("i1", true)] });
    expect(shouldShowAlterationsTab({ isDraft: false })).toBe(true);
    expect(hasAnyChangeRequest(null, [resolved])).toBe(true);
    expect(shouldOpenAlterationsTab(resolved)).toBe(false);
  });

  it("regressão vazia pode ser confirmada (sem criar request)", () => {
    expect(canConfirmChangeRequest("regress", "", [""])).toBe(true);
    expect(isEmptyChangeRequestDraft("", [""])).toBe(true);
  });

  it("solicitação avulsa exige texto ou pelo menos um item", () => {
    expect(canConfirmChangeRequest("standalone", "", [""])).toBe(false);
    expect(canConfirmChangeRequest("standalone", "trocar cor", [""])).toBe(true);
    expect(canConfirmChangeRequest("standalone", "", ["ajustar slide 2"])).toBe(true);
  });

  it("checkbox pendente torna Alterações a aba inicial; texto puro não", () => {
    expect(shouldOpenAlterationsTab(makeRequest({ items: [item("i1", false)] }))).toBe(true);
    expect(shouldOpenAlterationsTab(makeRequest({ notes: "revisar tudo" }))).toBe(false);
  });

  it("solicitação avulsa não carrega etapa de destino", () => {
    const standalone = makeRequest({ target_function_key: null, items: [item("i1", false)] });
    expect(standalone.target_function_key).toBeNull();
    expect(countPendingItems(standalone)).toBe(1);
  });
});

describe("normalizeChangeRequestDraft (garantia de 1 item)", () => {
  it("notes sem checklist → 1 item derivado do próprio texto", () => {
    const r = normalizeChangeRequestDraft("Trocar o título para X", ["", "  "]);
    expect(r.notes).toBe("Trocar o título para X");
    expect(r.items).toEqual([{ text: "Trocar o título para X", position: 0 }]);
  });

  it("notes + 2 itens manuais → apenas os 2 manuais", () => {
    const r = normalizeChangeRequestDraft("contexto geral", ["ajustar slide 2", " trocar cor "]);
    expect(r.notes).toBe("contexto geral");
    expect(r.items).toEqual([
      { text: "ajustar slide 2", position: 0 },
      { text: "trocar cor", position: 1 },
    ]);
  });

  it("checklist manual sem notes → notes null e itens preservados", () => {
    const r = normalizeChangeRequestDraft("", ["item unico"]);
    expect(r.notes).toBeNull();
    expect(r.items).toEqual([{ text: "item unico", position: 0 }]);
  });

  it("draft totalmente vazio → nada a persistir", () => {
    const r = normalizeChangeRequestDraft("   ", [""]);
    expect(r.notes).toBeNull();
    expect(r.items).toEqual([]);
    expect(canConfirmChangeRequest("standalone", "   ", [""])).toBe(false);
    expect(canConfirmChangeRequest("regress", "   ", [""])).toBe(true);
  });

  it("item derivado de notes se comporta como checklist normal", () => {
    const { items } = normalizeChangeRequestDraft("Trocar título", []);
    const pending = makeRequest({ items: [item("gen", false)] });
    expect(items).toHaveLength(1);
    expect(countPendingItems(pending)).toBe(1);
    expect(shouldOpenAlterationsTab(pending)).toBe(true);
    const done = makeRequest({ items: [item("gen", true)] });
    expect(shouldAutoResolve(done)).toBe(true);
  });
});
