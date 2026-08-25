import { describe, expect, it } from "vitest";
import {
  buildDraftExecutionRun,
  buildExecutionTransitionWarning,
  draftExecutionItemTexts,
  makeDraftExecutionItem,
  closingStatusFor,
  computeExecutionProgress,
  countPendingExecutionItems,
  executionBadgeCount,
  isExecutionRunFullyDone,
  nextPassNumber,
  normalizeExecutionItemTexts,
  passLabel,
  resolveAutoOpenTab,
  sortExecutionItems,
  partitionExecutionItems,
  reorderExecutionItems,
  applyExecutionToggleOrder,
  executionPositionUpdates,
  reorderDraftExecutionItems,
  applyDraftExecutionToggleOrder,
  isExecutionDragEnabled,
  resolveExecutionItemEdit,
  applyExecutionItemText,
  runMatchesContext,
  shouldShowExecutionTab,
  type ExecutionItem,
  type ExecutionRun,
  type ExecutionRunWithItems,
} from "./demandExecutionRules";

const item = (over: Partial<ExecutionItem> = {}): ExecutionItem => ({
  id: over.id ?? "i1",
  execution_run_id: "r1",
  tenant_id: "t1",
  text: over.text ?? "fazer",
  is_completed: over.is_completed ?? false,
  position: over.position ?? 0,
  completed_by: null,
  completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const run = (over: Partial<ExecutionRunWithItems> = {}): ExecutionRunWithItems => ({
  id: over.id ?? "r1",
  tenant_id: "t1",
  demand_id: "d1",
  function_key: over.function_key ?? "editar",
  demand_type_key: over.demand_type_key ?? "video_captado",
  assigned_to: over.assigned_to ?? "u1",
  pass_number: over.pass_number ?? 1,
  status: over.status ?? "active",
  created_by: "u1",
  created_at: "2026-01-01T00:00:00Z",
  completed_at: null,
  updated_at: "2026-01-01T00:00:00Z",
  metadata: {},
  ...over,
  items: over.items ?? [],
});

describe("progresso e pendências", () => {
  it("conta pendências apenas do run ativo", () => {
    const items = [item({ id: "a" }), item({ id: "b", is_completed: true })];
    expect(countPendingExecutionItems(run({ items }))).toBe(1);
    expect(countPendingExecutionItems(run({ items, status: "completed" }))).toBe(0);
    expect(countPendingExecutionItems(null)).toBe(0);
  });

  it("progresso reflete concluídos e total", () => {
    const items = [item({ id: "a", is_completed: true }), item({ id: "b" })];
    expect(computeExecutionProgress(run({ items }))).toEqual({ done: 1, total: 2 });
    expect(computeExecutionProgress(null)).toEqual({ done: 0, total: 0 });
  });

  it("run sem itens nunca é 'tudo feito'", () => {
    expect(isExecutionRunFullyDone(run({ items: [] }))).toBe(false);
    expect(isExecutionRunFullyDone(run({ items: [item({ is_completed: true })] }))).toBe(true);
  });

  it("badge = pendências do run ativo", () => {
    expect(executionBadgeCount(run({ items: [item(), item({ id: "b" })] }))).toBe(2);
  });

  it("status de fechamento respeita pendências", () => {
    expect(closingStatusFor(run({ items: [item()] }))).toBe("completed_with_pending");
    expect(closingStatusFor(run({ items: [item({ is_completed: true })] }))).toBe("completed");
    expect(closingStatusFor(run({ items: [] }))).toBe("completed");
  });
});

describe("identidade da passagem", () => {
  it("compara etapa, tipo e responsável", () => {
    const r = run();
    expect(
      runMatchesContext(r, { functionKey: "editar", demandTypeKey: "video_captado", assignedTo: "u1" }),
    ).toBe(true);
    expect(
      runMatchesContext(r, { functionKey: "revisar", demandTypeKey: "video_captado", assignedTo: "u1" }),
    ).toBe(false);
    expect(
      runMatchesContext(r, { functionKey: "editar", demandTypeKey: "estatico", assignedTo: "u1" }),
    ).toBe(false);
    expect(
      runMatchesContext(r, { functionKey: "editar", demandTypeKey: "video_captado", assignedTo: "u2" }),
    ).toBe(false);
    expect(runMatchesContext(null, { functionKey: null, demandTypeKey: null, assignedTo: null })).toBe(false);
  });

  it("normaliza vazio e nulo como mesma identidade", () => {
    const r = run({ function_key: "", demand_type_key: null, assigned_to: null });
    expect(runMatchesContext(r, { functionKey: null, demandTypeKey: "", assignedTo: null })).toBe(true);
  });

  it("número da passagem conta execuções anteriores da mesma etapa", () => {
    const history: ExecutionRun[] = [
      run({ id: "a", function_key: "editar" }),
      run({ id: "b", function_key: "revisar" }),
      run({ id: "c", function_key: "editar" }),
    ];
    expect(nextPassNumber(history, "editar")).toBe(3);
    expect(nextPassNumber(history, "revisar")).toBe(2);
    expect(nextPassNumber(history, "captar")).toBe(1);
    expect(nextPassNumber([], "editar")).toBe(1);
  });

  it("rótulo da passagem", () => {
    expect(passLabel(1)).toBe("1ª passagem");
    expect(passLabel(3)).toBe("3ª passagem");
    expect(passLabel(0)).toBe("1ª passagem");
  });
});

describe("abas e auto-open", () => {
  it("aba existe em card salvo E também no rascunho (criação manual)", () => {
    expect(shouldShowExecutionTab({})).toBe(true);
    expect(shouldShowExecutionTab({ isDraft: true })).toBe(true);
  });

  it("Alterações tem prioridade sobre Execução", () => {
    expect(resolveAutoOpenTab({ alterationsPending: 2, executionPending: 3 })).toBe("alteracoes");
    expect(resolveAutoOpenTab({ alterationsPending: 0, executionPending: 3 })).toBe("execucao");
    expect(resolveAutoOpenTab({ alterationsPending: 0, executionPending: 0 })).toBeNull();
    expect(resolveAutoOpenTab({ isDraft: true, alterationsPending: 5, executionPending: 5 })).toBeNull();
  });
});

describe("drafts e avisos", () => {
  it("normaliza itens digitados", () => {
    expect(normalizeExecutionItemTexts([" a ", "", "A", "b", null])).toEqual([
      { text: "a", position: 0 },
      { text: "b", position: 1 },
    ]);
  });

  it("aviso de transição nunca bloqueia e lista pendências na ordem", () => {
    expect(buildExecutionTransitionWarning(run({ items: [item({ is_completed: true })] }))).toBeNull();
    const warning = buildExecutionTransitionWarning(
      run({
        items: [
          item({ id: "b", text: "segundo", position: 1 }),
          item({ id: "a", text: "primeiro", position: 0 }),
        ],
      }),
    );
    expect(warning).toEqual({ pending: 2, total: 2, pendingTexts: ["primeiro", "segundo"] });
  });

  it("run fechado não gera aviso", () => {
    expect(buildExecutionTransitionWarning(run({ status: "completed", items: [item()] }))).toBeNull();
  });
});


describe("checklist de rascunho", () => {
  it("run sintético reflete os itens locais e o contexto da passagem", () => {
    const items = [makeDraftExecutionItem("Gravar"), makeDraftExecutionItem("Editar")];
    items[0].is_completed = true;
    const run = buildDraftExecutionRun(items, {
      functionKey: "editar_video",
      demandTypeKey: "video_captado",
      assignedTo: "u1",
    });
    expect(run.status).toBe("active");
    expect(run.items.map((i) => i.position)).toEqual([0, 1]);
    expect(countPendingExecutionItems(run)).toBe(1);
    expect(run.function_key).toBe("editar_video");
  });

  it("textos materializados são normalizados (vazios e duplicados fora)", () => {
    const items = [
      makeDraftExecutionItem("Gravar"),
      makeDraftExecutionItem("gravar"),
      makeDraftExecutionItem("  "),
      makeDraftExecutionItem("Editar"),
    ];
    expect(draftExecutionItemTexts(items)).toEqual(["Gravar", "Editar"]);
  });
});

describe("reordenação manual do checklist", () => {
  const items = [
    item({ id: "p1", text: "p1", position: 0 }),
    item({ id: "p2", text: "p2", position: 1 }),
    item({ id: "p3", text: "p3", position: 2 }),
    item({ id: "c1", text: "c1", position: 3, is_completed: true }),
    item({ id: "c2", text: "c2", position: 4, is_completed: true }),
  ];

  it("ordem canônica: pendentes antes de concluídos", () => {
    const shuffled = [items[3], items[1], items[4], items[0], items[2]];
    expect(sortExecutionItems(shuffled).map((i) => i.id)).toEqual(["p1", "p2", "p3", "c1", "c2"]);
    expect(partitionExecutionItems(shuffled).completed.map((i) => i.id)).toEqual(["c1", "c2"]);
  });

  it("reordena pendentes entre pendentes com posições contíguas", () => {
    const out = reorderExecutionItems(items, 0, 2);
    expect(out.map((i) => i.id)).toEqual(["p2", "p3", "p1", "c1", "c2"]);
    expect(out.map((i) => i.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it("reordena concluídos entre concluídos", () => {
    expect(reorderExecutionItems(items, 4, 3).map((i) => i.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "c2",
      "c1",
    ]);
  });

  it("tentativa de cruzar grupos é limitada à borda do próprio grupo", () => {
    // pendente arrastado para dentro dos concluídos para no fim dos pendentes
    expect(reorderExecutionItems(items, 0, 4).map((i) => i.id)).toEqual([
      "p2",
      "p3",
      "p1",
      "c1",
      "c2",
    ]);
    // concluído arrastado para o topo para no início dos concluídos
    expect(reorderExecutionItems(items, 4, 0).map((i) => i.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "c2",
      "c1",
    ]);
  });

  it("concluir manda para o fim dos concluídos; reabrir, para o fim dos pendentes", () => {
    const done = applyExecutionToggleOrder(items, "p1", true);
    expect(done.map((i) => i.id)).toEqual(["p2", "p3", "c1", "c2", "p1"]);
    expect(done.map((i) => i.position)).toEqual([0, 1, 2, 3, 4]);

    const reopened = applyExecutionToggleOrder(items, "c1", false);
    expect(reopened.map((i) => i.id)).toEqual(["p1", "p2", "p3", "c1", "c2"]);
    expect(reopened.find((i) => i.id === "c1")?.is_completed).toBe(false);
  });

  it("posições gravadas são contíguas 0..n-1", () => {
    expect(executionPositionUpdates(reorderExecutionItems(items, 1, 0))).toEqual([
      { id: "p2", position: 0 },
      { id: "p1", position: 1 },
      { id: "p3", position: 2 },
      { id: "c1", position: 3 },
      { id: "c2", position: 4 },
    ]);
  });

  it("rascunho reordena em memória preservando a ordem materializada", () => {
    const drafts = [
      makeDraftExecutionItem("a"),
      makeDraftExecutionItem("b"),
      makeDraftExecutionItem("c"),
    ];
    const moved = reorderDraftExecutionItems(drafts, 2, 0);
    expect(moved.map((i) => i.text)).toEqual(["c", "a", "b"]);
    expect(draftExecutionItemTexts(moved)).toEqual(["c", "a", "b"]);

    const toggled = applyDraftExecutionToggleOrder(moved, moved[0].id, true);
    expect(toggled.map((i) => i.text)).toEqual(["a", "b", "c"]);
  });
});

describe("trava de arraste (isExecutionDragEnabled)", () => {
  const base = { readOnly: false, hasReorderHandler: true };

  it("libera quando nada está em curso", () => {
    expect(isExecutionDragEnabled(base)).toBe(true);
  });

  it("bloqueia em modo somente leitura e sem callback de reorder", () => {
    expect(isExecutionDragEnabled({ ...base, readOnly: true })).toBe(false);
    expect(isExecutionDragEnabled({ ...base, hasReorderHandler: false })).toBe(false);
  });

  it("bloqueia durante reordenação salvando ou concluir-tudo", () => {
    expect(isExecutionDragEnabled({ ...base, reordering: true })).toBe(false);
    expect(isExecutionDragEnabled({ ...base, completingAll: true })).toBe(false);
  });

  it("bloqueia enquanto um item está sendo marcado/removido (busyItemId)", () => {
    expect(isExecutionDragEnabled({ ...base, busyItemId: "p1" })).toBe(false);
    expect(isExecutionDragEnabled({ ...base, busyItemId: null })).toBe(true);
  });

  it("bloqueia enquanto um item está sendo adicionado", () => {
    expect(isExecutionDragEnabled({ ...base, adding: true })).toBe(false);
  });

  it("combina todas as travas: qualquer flag basta para bloquear", () => {
    expect(
      isExecutionDragEnabled({
        readOnly: false,
        hasReorderHandler: true,
        reordering: false,
        completingAll: false,
        busyItemId: "x",
        adding: true,
      }),
    ).toBe(false);
  });
});

describe("edição inline do texto do item", () => {
  it("texto vazio não salva", () => {
    expect(resolveExecutionItemEdit({ currentText: "a", nextText: "   " })).toEqual({
      shouldSave: false,
      text: "",
    });
  });

  it("texto igual (após trim) cancela sem request", () => {
    expect(resolveExecutionItemEdit({ currentText: "fazer", nextText: " fazer " })).toEqual({
      shouldSave: false,
      text: "fazer",
    });
  });

  it("texto novo salva com trim", () => {
    expect(resolveExecutionItemEdit({ currentText: "fazer", nextText: "  fazer melhor " })).toEqual({
      shouldSave: true,
      text: "fazer melhor",
    });
  });

  it("aplica texto ao item correto preservando posição e conclusão", () => {
    const items = [
      item({ id: "a", text: "a", position: 0 }),
      item({ id: "b", text: "b", position: 1, is_completed: true }),
    ];
    const out = applyExecutionItemText(items, "b", " novo ");
    expect(out.map((i) => [i.id, i.text, i.position, i.is_completed])).toEqual([
      ["a", "a", 0, false],
      ["b", "novo", 1, true],
    ]);
  });

  it("edição em linha suspende o arraste mas o restante segue liberado", () => {
    expect(
      isExecutionDragEnabled({ readOnly: false, hasReorderHandler: true, editingItemId: "a" }),
    ).toBe(false);
    expect(
      isExecutionDragEnabled({ readOnly: false, hasReorderHandler: true, editingItemId: null }),
    ).toBe(true);
  });
});
