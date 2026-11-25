import { describe, expect, it } from "vitest";
import {
  buildFlowSequence,
  pickFunctionForAssignee,
  resolveFunctionsFromContext,
  type SharedFlowContext,
} from "@/lib/flowResolution";
import type { StageCompletion } from "@/lib/stageCompletions";

const FNS = [
  { function_key: "criar_arte" },
  { function_key: "revisar_arte" },
  { function_key: "enviar_cliente", requires_client_origin: false },
  { function_key: "publicar" },
];

describe("buildFlowSequence", () => {
  it("sem regras, usa todas as funções da área", () => {
    expect(buildFlowSequence(FNS, [], false)).toEqual([
      "criar_arte",
      "revisar_arte",
      "enviar_cliente",
      "publicar",
    ]);
  });

  it("com regras `required`, restringe à etapa exigida", () => {
    expect(
      buildFlowSequence(FNS, [
        { function_key: "criar_arte", requirement: "required" },
        { function_key: "publicar", requirement: "optional" },
      ], false),
    ).toEqual(["criar_arte"]);
  });

  it("etapa que exige origem de cliente cai fora quando a origem é interna", () => {
    const fns = [...FNS, { function_key: "briefing_cliente", requires_client_origin: true }];
    expect(buildFlowSequence(fns, [], false)).not.toContain("briefing_cliente");
    expect(buildFlowSequence(fns, [], true)).toContain("briefing_cliente");
  });
});

const completionsFor = (key: string, userId: string): Map<string, StageCompletion> =>
  new Map([[key, { functionKey: key, userIds: [userId] } as any]]);


describe("pickFunctionForAssignee", () => {
  const sequence = ["criar_arte", "revisar_arte", "publicar"];

  it("mantém a etapa atual quando o colaborador pode executá-la", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set(["criar_arte", "revisar_arte"]),
        completions: null,
        assigneeUserId: "u1",
        currentFunctionKey: "criar_arte",
        administrative: false,
      }),
    ).toBe("criar_arte");
  });

  it("sem a função da etapa atual, avança para a próxima permitida", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set(["publicar"]),
        completions: null,
        assigneeUserId: "u1",
        currentFunctionKey: "criar_arte",
        administrative: false,
      }),
    ).toBe("publicar");
  });

  it("não devolve etapa para quem não tem nenhuma função", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set<string>(),
        completions: null,
        assigneeUserId: "u1",
        currentFunctionKey: "criar_arte",
        administrative: false,
      }),
    ).toBeNull();
  });

  it("anti-autorrevisão: quem criou não recebe a revisão", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set(["revisar_arte"]),
        completions: completionsFor("criar_arte", "u1"),
        assigneeUserId: "u1",
        currentFunctionKey: "revisar_arte",
        administrative: false,
      }),
    ).toBeNull();
  });
});

describe("resolveFunctionsFromContext", () => {
  it("resolve todos os colaboradores a partir de UMA carga compartilhada", () => {
    const context: SharedFlowContext = {
      sequence: ["criar_arte", "revisar_arte"],
      allowedByUser: new Map([
        ["u1", new Set(["criar_arte"])],
        ["u2", new Set(["revisar_arte"])],
        ["u3", new Set<string>()],
      ]),
      completions: null,
    };
    expect(
      resolveFunctionsFromContext({
        context,
        userIds: ["u1", "u2", "u3"],
        currentFunctionKey: "criar_arte",
        administrative: false,
      }),
    ).toEqual({ u1: "criar_arte", u2: "revisar_arte", u3: null });
  });
});

describe("pickFunctionForAssignee — etapa de Testar", () => {
  const sequence = ["desenvolver", "testar", "publicar"];

  it("quem desenvolveu e tem Testar habilitada recebe Testar", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set(["desenvolver", "testar"]),
        completions: completionsFor("desenvolver", "u1"),
        assigneeUserId: "u1",
        currentFunctionKey: "desenvolver",
        administrative: false,
      }),
    ).toBe("testar");
  });

  it("mantém Testar quando ele é a etapa atual e o responsável tem a função", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set(["desenvolver", "testar"]),
        completions: completionsFor("desenvolver", "u1"),
        assigneeUserId: "u1",
        currentFunctionKey: "testar",
        administrative: false,
      }),
    ).toBe("testar");
  });

  it("sem a função Testar habilitada, não recebe a etapa", () => {
    expect(
      pickFunctionForAssignee({
        sequence,
        allowedKeys: new Set(["desenvolver"]),
        completions: completionsFor("desenvolver", "u1"),
        assigneeUserId: "u1",
        currentFunctionKey: "desenvolver",
        administrative: false,
      }),
    ).toBeNull();
  });

  it("revisão independente continua bloqueada para quem desenvolveu", () => {
    expect(
      pickFunctionForAssignee({
        sequence: ["desenvolver", "revisar", "publicar"],
        allowedKeys: new Set(["desenvolver", "revisar"]),
        completions: completionsFor("desenvolver", "u1"),
        assigneeUserId: "u1",
        currentFunctionKey: "desenvolver",
        administrative: false,
      }),
    ).toBeNull();
  });
});

describe("pickFunctionForAssignee — administrativo preserva etapa atual", () => {
  it("mantém testar atual mesmo com entrega anterior do mesmo usuário", async () => {
    const { pickFunctionForAssignee } = await import("./flowResolution");
    const completions = new Map<string, any>([
      ["desenvolver", { userIds: new Set(["eric"]), userId: "eric" }],
      ["testar", { userIds: new Set(["eric"]), userId: "eric" }],
    ]);
    const r = pickFunctionForAssignee({
      sequence: ["especificar", "desenvolver", "testar", "revisar"],
      allowedKeys: new Set(["desenvolver", "testar"]),
      completions: completions as any,
      assigneeUserId: "eric",
      currentFunctionKey: "testar",
      administrative: true,
    });
    expect(r).toBe("testar");
  });
});
