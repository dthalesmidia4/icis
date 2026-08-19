import { describe, expect, it, vi } from "vitest";
import {
  buildBulkExecutionExitSummary,
  buildExecutionExitPreflight,
  finalizeBulkExecutionExit,
  performExecutionExit,
  toExitOutcome,
} from "./executionExit";
import {
  hasOperationalExecutionContext,
  resolveInitialSection,
  resolvePostLoadOverride,
  type ExecutionItem,
  type ExecutionRunWithItems,
} from "./demandExecutionRules";

const item = (over: Partial<ExecutionItem> = {}): ExecutionItem => ({
  id: over.id ?? "i1",
  execution_run_id: over.execution_run_id ?? "r1",
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
  demand_id: over.demand_id ?? "d1",
  function_key: "editar",
  demand_type_key: "video_captado",
  assigned_to: "u1",
  pass_number: 1,
  status: over.status ?? "active",
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  completed_at: null,
  updated_at: "2026-01-01T00:00:00Z",
  metadata: {},
  items: over.items ?? [item()],
  ...over,
});

const deps = () => {
  const closeRun = vi.fn(async () => true);
  const completeAllPending = vi.fn(async () => {});
  return { closeRun, completeAllPending };
};

describe("preflight", () => {
  it("avisa só quando há pendência no run ativo", () => {
    expect(buildExecutionExitPreflight(run())?.pending).toBe(1);
    expect(buildExecutionExitPreflight(run({ items: [item({ is_completed: true })] }))).toBeNull();
    expect(buildExecutionExitPreflight(run({ status: "completed" }))).toBeNull();
    expect(buildExecutionExitPreflight(null)).toBeNull();
  });
});

describe("toExitOutcome", () => {
  it("normaliza resultados heterogêneos", () => {
    expect(toExitOutcome({ success: true })).toBe("success");
    expect(toExitOutcome({ success: false, stale: true })).toBe("stale");
    expect(toExitOutcome({ status: "ok" })).toBe("success");
    expect(toExitOutcome({ status: "stale" })).toBe("stale");
    expect(toExitOutcome({ status: "error" })).toBe("failure");
    expect(toExitOutcome(true)).toBe("success");
    expect(toExitOutcome(false)).toBe("failure");
    expect(toExitOutcome(undefined)).toBe("failure");
  });
});

describe("performExecutionExit — ordem transacional", () => {
  it("falha não fecha run nem marca itens", async () => {
    const d = deps();
    const r = await performExecutionExit({
      preflight: buildExecutionExitPreflight(run()),
      reason: "x",
      perform: async () => ({ success: false }),
      deps: d,
    });
    expect(r).toEqual({ outcome: "failure", closed: null, markedAll: false });
    expect(d.closeRun).not.toHaveBeenCalled();
    expect(d.completeAllPending).not.toHaveBeenCalled();
  });

  it("stale não fecha run", async () => {
    const d = deps();
    const r = await performExecutionExit({
      preflight: buildExecutionExitPreflight(run()),
      reason: "x",
      perform: async () => ({ status: "stale" }),
      deps: d,
    });
    expect(r.outcome).toBe("stale");
    expect(d.closeRun).not.toHaveBeenCalled();
  });

  it("sucesso com pendências mantidas fecha como completed_with_pending", async () => {
    const d = deps();
    const r = await performExecutionExit({
      preflight: buildExecutionExitPreflight(run()),
      reason: "flow",
      perform: async () => ({ success: true }),
      deps: d,
    });
    expect(r.closed).toBe("completed_with_pending");
    expect(d.closeRun).toHaveBeenCalledWith({
      runId: "r1",
      status: "completed_with_pending",
      reason: "flow",
    });
  });

  it("'marcar tudo e continuar' marca só depois do sucesso e fecha como completed", async () => {
    const d = deps();
    const order: string[] = [];
    d.completeAllPending.mockImplementation(async () => { order.push("mark"); });
    const r = await performExecutionExit({
      preflight: buildExecutionExitPreflight(run()),
      choice: "complete_all",
      reason: "flow",
      perform: async () => { order.push("mutation"); return { success: true }; },
      deps: d,
    });
    expect(order).toEqual(["mutation", "mark"]);
    expect(r.markedAll).toBe(true);
    expect(r.closed).toBe("completed");
  });

  it("sem pendência ainda encerra a passagem por id (CAS)", async () => {
    const d = deps();
    const r = await performExecutionExit({
      preflight: null,
      runId: "r9",
      reason: "flow",
      perform: async () => true,
      deps: d,
    });
    expect(r.closed).toBe("completed");
    expect(d.closeRun).toHaveBeenCalledWith({ runId: "r9", status: "completed", reason: "flow" });
  });

  it("CAS perdido (run já fechado) não reporta fechamento", async () => {
    const d = deps();
    d.closeRun.mockResolvedValue(false);
    const r = await performExecutionExit({
      preflight: null,
      runId: "r1",
      reason: "flow",
      perform: async () => true,
      deps: d,
    });
    expect(r.closed).toBeNull();
  });

  it("sem run ativo não tenta fechar nada", async () => {
    const d = deps();
    await performExecutionExit({ preflight: null, runId: null, reason: "x", perform: async () => true, deps: d });
    expect(d.closeRun).not.toHaveBeenCalled();
  });
});

describe("lote", () => {
  it("resume pendências de vários cards em uma confirmação", () => {
    const summary = buildBulkExecutionExitSummary([
      { cardId: "a", run: run({ id: "ra", demand_id: "a" }) },
      { cardId: "b", run: run({ id: "rb", demand_id: "b", items: [item({ is_completed: true })] }) },
      { cardId: "c", run: null },
    ]);
    expect(summary?.cards).toBe(1);
    expect(summary?.pending).toBe(1);
    expect(buildBulkExecutionExitSummary([{ cardId: "b", run: null }])).toBeNull();
  });

  it("fecha somente os cards que realmente se moveram", async () => {
    const d = deps();
    const res = await finalizeBulkExecutionExit({
      runsByCard: {
        a: run({ id: "ra", demand_id: "a" }),
        b: run({ id: "rb", demand_id: "b" }),
      },
      appliedCardIds: ["a"],
      reason: "bulk",
      deps: d,
    });
    expect(res.closedCardIds).toEqual(["a"]);
    expect(d.closeRun).toHaveBeenCalledTimes(1);
    expect(d.closeRun).toHaveBeenCalledWith({
      runId: "ra",
      status: "completed_with_pending",
      reason: "bulk",
    });
  });
});

describe("contexto operacional e aba inicial", () => {
  const classify = {
    isClientFacing: (k?: string | null) =>
      ["aguardando_cliente", "enviar_cliente", "entregar_cliente", "feedback_cliente"].includes(k || ""),
    isEvaluation: (k?: string | null) => k === "avaliar",
  };

  it("exige responsável, etapa e etapa não client-facing", () => {
    const base = { assigned_to: "u1", current_function_key: "editar" };
    expect(hasOperationalExecutionContext(base, classify)).toBe(true);
    expect(hasOperationalExecutionContext({ ...base, assigned_to: null }, classify)).toBe(false);
    expect(hasOperationalExecutionContext({ ...base, current_function_key: null }, classify)).toBe(false);
    expect(hasOperationalExecutionContext({ ...base, current_function_key: "aguardando_cliente" }, classify)).toBe(false);
    expect(hasOperationalExecutionContext({ ...base, current_function_key: "avaliar" }, classify)).toBe(false);
    expect(hasOperationalExecutionContext({ ...base, is_draft: true }, classify)).toBe(false);
    expect(hasOperationalExecutionContext({ ...base, archived_at: "2026-01-01" }, classify)).toBe(false);
  });

  it("abre em Execução no contexto operacional, senão no fallback", () => {
    const common = {
      showExecutionTab: true,
      fallback: "description" as const,
      briefingSection: "briefing" as const,
      executionSection: "execucao" as const,
    };
    expect(resolveInitialSection({ ...common, operational: true })).toBe("execucao");
    expect(resolveInitialSection({ ...common, operational: false, hasBriefing: true })).toBe("briefing");
    expect(resolveInitialSection({ ...common, operational: false })).toBe("description");
    expect(resolveInitialSection({ ...common, operational: true, isDraft: true })).toBe("description");
    expect(resolveInitialSection({ ...common, operational: true, showExecutionTab: false, hasBriefing: true })).toBe("briefing");
  });

  it("só Alterações pendentes trocam a aba depois do load, e nunca após navegação manual", () => {
    expect(
      resolvePostLoadOverride({ userNavigated: false, alterationsPending: 2, alterationsSection: "alteracoes" }),
    ).toBe("alteracoes");
    expect(
      resolvePostLoadOverride({ userNavigated: true, alterationsPending: 2, alterationsSection: "alteracoes" }),
    ).toBeNull();
    expect(
      resolvePostLoadOverride({ userNavigated: false, alterationsPending: 0, alterationsSection: "alteracoes" }),
    ).toBeNull();
    expect(
      resolvePostLoadOverride({ isDraft: true, userNavigated: false, alterationsPending: 3, alterationsSection: "alteracoes" }),
    ).toBeNull();
  });
});
