import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDemand, jumpToFunction, proceedDemand } from "./proceedDemand";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  transition: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/stageRouting", () => ({ getEligibleStageCandidates: mocks.candidates }));
vi.mock("@/lib/demandTransition", () => ({ transitionDemand: mocks.transition }));
vi.mock("@/lib/flowTransition", () => ({ fetchFlowState: vi.fn(async () => null), STALE_TRANSITION_MESSAGE: "stale" }));
vi.mock("@/lib/stageCompletions", () => ({ getStageCompletions: vi.fn(async () => new Map()), lastUserOfStage: vi.fn() }));
vi.mock("@/lib/recordTouchpoint", () => ({ recordStageTouchpoint: vi.fn() }));
vi.mock("@/lib/flowHistory", () => ({ recordFlowHistory: vi.fn(), recordFlowHistoryForUsers: vi.fn() }));
vi.mock("@/lib/scheduleOccupancy", () => ({ checkAssignmentConflicts: vi.fn(async () => ({ hard: [] })), suggestFreeSlot: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transition.mockResolvedValue({ status: "applied" });
  mocks.from.mockImplementation((table: string) => {
    const data = table === "demands"
      ? { id: "d1", tenant_id: "t1", assigned_to: "author", current_function_key: "publicar", additional_assignees: [], work_area: "midia", origin: "interno", demand_type_key: "criativo_estatico", due_date: null, delivery_date: null }
      : table === "flow_functions"
        ? [{ function_key: "publicar", name: "Publicar" }, { function_key: "revisar_publicacao", name: "Revisar publicação" }]
        : table === "demand_type_flow_rules"
          ? [{ function_key: "publicar", requirement: "required" }, { function_key: "revisar_publicacao", requirement: "required" }]
          : table === "pipeline_statuses"
            ? [{ id: "published", name: "Publicado" }, { id: "done", name: "Feito" }]
            : [];
    const result = { data, error: null };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(async () => result),
      maybeSingle: vi.fn(async () => result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  });
});

const jump = () => jumpToFunction({ demandId: "d1", tenantId: "t1", demandTypeKey: "criativo_estatico", targetFunctionKey: "revisar_publicacao", currentFunctionKey: "publicar" });

describe("salto manual para revisão", () => {
  it("não tenta novamente sem excluir o executor quando falta revisor independente", async () => {
    mocks.candidates.mockResolvedValue([]);
    expect((await jump()).success).toBe(false);
    expect(mocks.candidates).toHaveBeenCalledTimes(1);
    expect(mocks.candidates).toHaveBeenCalledWith(expect.objectContaining({ excludeUserIds: ["author"] }));
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it("preserva o avanço com revisor habilitado e independente", async () => {
    mocks.candidates.mockResolvedValue([{ userId: "reviewer", fullName: "Revisor", preferred: false }]);
    expect(await jump()).toMatchObject({ success: true, assignedTo: "reviewer" });
    expect(mocks.transition).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: "reviewer", targetFunctionKey: "revisar_publicacao" }));
  });
});

describe("conclusão canônica", () => {
  it("envia deliver para Feito, nunca Publicado", async () => {
    expect(await deliverDemand("d1", "p1")).toMatchObject({ success: true, statusId: "done" });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition).toHaveBeenCalledWith(expect.objectContaining({ intent: "deliver", targetStatusId: "done" }));
    expect(mocks.from).not.toHaveBeenCalledWith("scheduled_publication_dispatches");
  });

  it("propaga falha do kernel sem retornar conclusão bem-sucedida", async () => {
    mocks.transition.mockResolvedValue({ status: "blocked", message: "Falha de conclusão" });
    expect(await deliverDemand("d1", "p1")).toEqual({ success: false, message: "Falha de conclusão" });
  });
});

const SISTEMAS_SEQ = [
  { function_key: "desenvolver", name: "Desenvolver" },
  { function_key: "testar", name: "Testar" },
  { function_key: "revisar", name: "Revisar" },
  { function_key: "publicar", name: "Publicar" },
];
const SISTEMAS_RULES = SISTEMAS_SEQ.map((f) => ({
  function_key: f.function_key,
  requirement: "required",
}));

/** Card de Sistemas em Desenvolver, responsável `eric` (tem a função Testar). */
const mockSistemasFlow = (assignments: any[] | null = [{ id: "a1" }]) => {
  mocks.from.mockImplementation((table: string) => {
    const data =
      table === "demands"
        ? {
            id: "d1",
            tenant_id: "t1",
            assigned_to: "eric",
            current_function_key: "desenvolver",
            additional_assignees: [],
            work_area: "sistemas",
            origin: "interno",
            demand_type_key: "desenvolvimento",
            due_date: null,
            delivery_date: null,
          }
        : table === "flow_functions"
          ? SISTEMAS_SEQ
          : table === "demand_type_flow_rules"
            ? SISTEMAS_RULES
            : table === "collaborator_function_assignments"
              ? assignments
              : table === "profiles"
                ? { id: "eric", full_name: "Eric" }
                : table === "pipeline_statuses"
                  ? [{ id: "published", name: "Publicado" }, { id: "done", name: "Feito" }]
                  : [];
    const result = { data, error: null };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(async () => result),
      maybeSingle: vi.fn(async () => result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  });
};

const jumpToSystemsStage = (targetFunctionKey: string) =>
  jumpToFunction({
    demandId: "d1",
    tenantId: "t1",
    demandTypeKey: "desenvolvimento",
    targetFunctionKey,
    currentFunctionKey: "desenvolver",
  });

describe("etapa de Testar: quem desenvolveu pode testar o próprio desenvolvimento", () => {
  it("salto manual para Testar mantém quem desenvolveu, sem excluir ninguém", async () => {
    mockSistemasFlow();
    mocks.candidates.mockResolvedValue([]);
    const res = await jumpToSystemsStage("testar");
    expect(res).toMatchObject({ success: true, assignedTo: "eric", functionKey: "testar" });
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ targetUserId: "eric", targetFunctionKey: "testar" }),
    );
    expect(mocks.candidates).not.toHaveBeenCalled();
  });

  it("prosseguir de Desenvolver para Testar prefere quem desenvolveu", async () => {
    mockSistemasFlow();
    mocks.candidates.mockResolvedValue([{ userId: "eric", fullName: "Eric", preferred: false }]);
    const res = await proceedDemand({
      demandId: "d1",
      tenantId: "t1",
      demandTypeKey: "desenvolvimento",
      currentFunctionKey: "desenvolver",
    });
    expect(res).toMatchObject({ success: true, assignedTo: "eric", functionKey: "testar" });
    expect(mocks.candidates).toHaveBeenCalledWith(
      expect.objectContaining({ functionKey: "testar", excludeUserIds: [] }),
    );
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ targetFunctionKey: "testar", preferredUserId: "eric" }),
    );
  });

  it("sem a função Testar habilitada, o salto não mantém o responsável", async () => {
    mockSistemasFlow(null);
    mocks.candidates.mockResolvedValue([]);
    const res = await jumpToSystemsStage("testar");
    expect(res.success).toBe(false);
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it("revisão continua exigindo revisor diferente de quem desenvolveu", async () => {
    mockSistemasFlow();
    mocks.candidates.mockResolvedValue([]);
    const res = await jumpToSystemsStage("revisar");
    expect(res.success).toBe(false);
    expect(mocks.candidates).toHaveBeenCalledWith(
      expect.objectContaining({ functionKey: "revisar", excludeUserIds: ["eric"] }),
    );
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});