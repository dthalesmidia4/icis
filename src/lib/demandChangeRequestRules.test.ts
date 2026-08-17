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

describe("gestão de solicitações (exclusão e conclusão)", () => {
  it("notes sem checklist manual gera exatamente 1 item", () => {
    const draft = normalizeChangeRequestDraft("Trocar a cor do fundo", ["", "  "]);
    expect(draft.items).toEqual([{ text: "Trocar a cor do fundo", position: 0 }]);
    expect(draft.notes).toBe("Trocar a cor do fundo");
  });

  it("o item derivado de notes conta como pendência e permite auto-resolve", () => {
    const draft = normalizeChangeRequestDraft("Ajustar título", []);
    const pendingReq = makeRequest({
      notes: draft.notes,
      items: [item("gen", false)],
    });
    expect(countPendingItems(pendingReq)).toBe(1);
    expect(shouldAutoResolve(pendingReq)).toBe(false);

    const doneReq = { ...pendingReq, items: [item("gen", true)] };
    expect(countPendingItems(doneReq)).toBe(0);
    expect(shouldAutoResolve(doneReq)).toBe(true);
  });

  it("notes + checklist manual não duplica notes como item", () => {
    const draft = normalizeChangeRequestDraft("Contexto geral", ["Item A", "Item B"]);
    expect(draft.items.map((i) => i.text)).toEqual(["Item A", "Item B"]);
    expect(draft.notes).toBe("Contexto geral");
  });

  it("request ativa vazia (sem notes e sem items) não gera pendência", () => {
    const empty = makeRequest({ notes: null, items: [] });
    expect(countPendingItems(empty)).toBe(0);
    expect(shouldOpenAlterationsTab(empty)).toBe(false);
    expect(shouldAutoResolve(empty)).toBe(false);
    expect(normalizeChangeRequestDraft("", []).items).toEqual([]);
  });

  it("aba continua visível após excluir a última solicitação", () => {
    expect(shouldShowAlterationsTab({})).toBe(true);
    expect(hasAnyChangeRequest(null, [])).toBe(false);
  });

  it("excluir uma histórica não altera as demais requests", () => {
    const a = makeRequest({ id: "h1", status: "resolved" });
    const b = makeRequest({ id: "h2", status: "superseded" });
    const active = makeRequest({ id: "act", items: [item("i", false)] });
    const historyAfter = [a, b].filter((r) => r.id !== "h1");
    expect(historyAfter.map((r) => r.id)).toEqual(["h2"]);
    expect(historyAfter[0].status).toBe("superseded");
    expect(active.status).toBe("active");
    expect(countPendingItems(active)).toBe(1);
  });
});
