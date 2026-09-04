/**
 * CONTRATO DA AUTORIDADE ÚNICA DE TRANSIÇÃO.
 *
 * Prova que a MESMA INTENÇÃO produz o MESMO PAYLOAD, seja ela disparada pelo
 * TaskCard, pelo Kanban, pelo Escritório ou pela alocação em massa — nenhuma
 * superfície pode inventar parâmetro próprio.
 */
import { describe, expect, it } from "vitest";
import {
  buildTransitionPayload,
  parseTransitionResponse,
  TRANSITION_MESSAGE,
  type TransitionRequest,
} from "@/lib/demandTransition";

const DEMAND = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

describe("buildTransitionPayload", () => {
  it("envia a intenção e o alvo, sem campos vazios", () => {
    const payload = buildTransitionPayload({
      demandId: DEMAND,
      intent: "reassign",
      targetUserId: USER,
      targetFunctionKey: "  ",
      source: "task_card",
    });
    expect(payload).toEqual({
      demand_id: DEMAND,
      intent: "reassign",
      source: "task_card",
      target_user_id: USER,
      target_function_key: null,
    });
  });

  it("propaga compare-and-set de responsável, etapa e updated_at", () => {
    const payload = buildTransitionPayload({
      demandId: DEMAND,
      intent: "jump_stage",
      targetFunctionKey: "revisar",
      expected: { assignedTo: null, functionKey: "criar_arte", updatedAt: "2026-09-04T10:00:00Z" },
    });
    expect(payload.expected_assigned_to).toBe("");
    expect(payload.expected_function_key).toBe("criar_arte");
    expect(payload.expected_updated_at).toBe("2026-09-04T10:00:00Z");
  });

  it("equivalência entre superfícies: mesma intenção = mesmo payload", () => {
    const intent = (source: string): TransitionRequest => ({
      demandId: DEMAND,
      intent: "reassign",
      targetUserId: USER,
      administrative: true,
      expected: { assignedTo: null, functionKey: "planejar" },
      source,
    });
    const a = buildTransitionPayload(intent("kanban_central"));
    const b = buildTransitionPayload(intent("office"));
    expect({ ...a, source: null }).toEqual({ ...b, source: null });
  });

  it("troca de tipo leva tipo, rótulo e etapa juntos", () => {
    const payload = buildTransitionPayload({
      demandId: DEMAND,
      intent: "change_type",
      targetTypeKey: "bug_n2",
      targetTypeLabel: "Bug N2",
      targetFunctionKey: "corrigir_bug_n2",
      targetUserId: USER,
    });
    expect(payload.target_type_key).toBe("bug_n2");
    expect(payload.target_type_label).toBe("Bug N2");
    expect(payload.target_function_key).toBe("corrigir_bug_n2");
  });

  it("voltar demanda pede resolução para trás", () => {
    const payload = buildTransitionPayload({
      demandId: DEMAND,
      intent: "move_back",
      targetUserId: USER,
      direction: "backward",
      administrative: false,
    });
    expect(payload.direction).toBe("backward");
    expect(payload.administrative).toBe(false);
  });
});

describe("parseTransitionResponse", () => {
  it("aplica a transição e devolve o estado final", () => {
    const res = parseTransitionResponse({
      status: "applied",
      code: "OK",
      message: "Transição aplicada.",
      previous: { assigned_to: null, function_key: "planejar" },
      final: { assigned_to: USER, function_key: "criar_arte", type_key: "carrossel" },
    });
    expect(res.status).toBe("applied");
    expect(res.final?.function_key).toBe("criar_arte");
  });

  it("bug_n2 + ajustar: etapa desabilitada no tipo é recusada pelo fluxo", () => {
    const res = parseTransitionResponse({
      status: "blocked",
      code: "INVALID_STAGE_FOR_FLOW",
      message: "Esta etapa não faz parte do fluxo atual desta demanda.",
    });
    expect(res.status).toBe("blocked");
    expect(res.code).toBe("INVALID_STAGE_FOR_FLOW");
  });

  it("bug_n3 + revisar: sem etapa válida para o colaborador", () => {
    const res = parseTransitionResponse({ status: "blocked", code: "NO_VALID_STAGE" });
    expect(res.message).toBe(TRANSITION_MESSAGE.NO_VALID_STAGE);
  });

  it("estado desatualizado nunca é tratado como sucesso", () => {
    const res = parseTransitionResponse({ status: "stale", code: "STALE_STATE" });
    expect(res.status).toBe("stale");
    expect(res.message).toBe(TRANSITION_MESSAGE.STALE_STATE);
  });

  it("resposta inesperada degrada para erro (nunca aplica silenciosamente)", () => {
    const res = parseTransitionResponse(null);
    expect(res.status).toBe("error");
    expect(res.code).toBe("ERROR");
  });

  it("tenant sem acesso é bloqueio explícito", () => {
    const res = parseTransitionResponse({ status: "error", code: "FORBIDDEN" });
    expect(res.message).toBe(TRANSITION_MESSAGE.FORBIDDEN);
  });
});
