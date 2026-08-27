import { beforeEach, describe, expect, it, vi } from "vitest";

/** Linhas por tabela devolvidas pelo mock. */
const TABLES: Record<string, any[]> = {
  flow_functions: [],
  demand_type_flow_rules: [],
  collaborator_function_assignments: [],
};

function chain(table: string) {
  const thenable: any = {
    select: () => thenable,
    eq: () => thenable,
    neq: () => thenable,
    is: () => thenable,
    in: () => thenable,
    or: () => thenable,
    order: () => thenable,
    then: (resolve: any) => resolve({ data: TABLES[table] ?? [], error: null }),
  };
  return thenable;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => chain(table) },
}));

vi.mock("@/lib/stageCompletions", () => ({
  getStageCompletions: vi.fn(async () => []),
  hasUserCompletedStage: () => false,
}));

import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";

const TENANT = "t1";
const USER = "u1";

const SEQUENCE = [
  { function_key: "captar", position: 1, active: true, requires_client_origin: false },
  { function_key: "criar_arte", position: 2, active: true, requires_client_origin: false },
  { function_key: "revisar", position: 3, active: true, requires_client_origin: false },
  { function_key: "enviar_cliente", position: 4, active: true, requires_client_origin: false },
  { function_key: "aguardando_cliente", position: 5, active: true, requires_client_origin: false },
];

// A consulta de funções permitidas agora é em lote (`in user_id`).
const allow = (...keys: string[]) =>
  keys.map((function_key) => ({ function_key, allowed: true, user_id: USER }));

beforeEach(() => {
  TABLES.flow_functions = SEQUENCE.map((f) => ({ ...f }));
  TABLES.demand_type_flow_rules = [];
  TABLES.collaborator_function_assignments = [];
});

describe("resolveFunctionForAssignee — modo administrative_reassign", () => {
  it("preserva a etapa atual quando o colaborador pode executá-la", async () => {
    TABLES.collaborator_function_assignments = allow("revisar");
    const key = await resolveFunctionForAssignee(TENANT, USER, null, "revisar", null, {
      workArea: "midia",
      mode: "administrative_reassign",
    });
    expect(key).toBe("revisar");
  });

  it("não avança `revisar` para etapa client-facing só porque o colaborador a possui", async () => {
    TABLES.collaborator_function_assignments = allow("enviar_cliente", "aguardando_cliente");
    const key = await resolveFunctionForAssignee(TENANT, USER, null, "revisar", null, {
      workArea: "midia",
      mode: "administrative_reassign",
    });
    expect(key).toBeNull();
  });

  it("remapeia para etapa OPERACIONAL atrás quando é a única compatível", async () => {
    TABLES.collaborator_function_assignments = allow("criar_arte", "aguardando_cliente");
    const key = await resolveFunctionForAssignee(TENANT, USER, null, "revisar", null, {
      workArea: "midia",
      mode: "administrative_reassign",
    });
    expect(key).toBe("criar_arte");
  });

  it("sem etapa alguma habilitada, rejeita (null)", async () => {
    TABLES.collaborator_function_assignments = [];
    const key = await resolveFunctionForAssignee(TENANT, USER, null, "revisar", null, {
      workArea: "midia",
      mode: "administrative_reassign",
    });
    expect(key).toBeNull();
  });

  it("card já em etapa client-facing pode permanecer nela", async () => {
    TABLES.collaborator_function_assignments = allow("aguardando_cliente");
    const key = await resolveFunctionForAssignee(TENANT, USER, null, "aguardando_cliente", null, {
      workArea: "midia",
      mode: "administrative_reassign",
    });
    expect(key).toBe("aguardando_cliente");
  });

  it("modo fluxo (default) continua podendo avançar para etapa de cliente", async () => {
    TABLES.collaborator_function_assignments = allow("enviar_cliente");
    const key = await resolveFunctionForAssignee(TENANT, USER, null, "revisar", null, {
      workArea: "midia",
    });
    expect(key).toBe("enviar_cliente");
  });
});
