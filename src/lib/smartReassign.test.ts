import { describe, it, expect, vi } from "vitest";

// O contrato é testado com deps injetadas; o client real nunca é usado.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { smartAdministrativeReassign } from "./smartReassign";

const CARD: any = {
  id: "d1",
  tenant_id: "t1",
  demand_type_key: "video_captado",
  work_area: "midia",
  origin: "interno",
  current_function_key: "planejar",
  assigned_to: "henrique",
  due_date: "2026-08-21",
  due_time: "10:00",
  delivery_date: "2026-08-21",
  delivery_time: "10:20",
};

const params = {
  tenantId: "t1",
  card: CARD,
  targetUserId: "leticia",
  targetUserName: "Letícia",
  stageLabelOf: (k: string) =>
    ({ planejar: "Planejar", criar_roteiro: "Criar roteiro", criar_arte: "Criar arte" } as any)[k] || k,
};

const evaluation = (over: any = {}) => ({
  allowed: true,
  blockedBy: null,
  nextFunctionKey: "planejar",
  hard: [],
  soft: [],
  softMessages: [],
  suggestion: null,
  direction: "same" as const,
  message: null,
  remapMessage: null,
  ...over,
});

const SLOT = { date: "2026-08-21", startTime: "10:25", endTime: "10:45" } as any;

describe("smartAdministrativeReassign", () => {
  it("destino possui a etapa atual → mantém a etapa", async () => {
    const apply = vi.fn().mockResolvedValue({ status: "applied" });
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi.fn().mockResolvedValue(evaluation()) as any,
      apply,
    });
    expect(res.status).toBe("applied");
    expect(res.stageChanged).toBe(false);
    expect(res.nextFunctionKey).toBe("planejar");
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ nextFunctionKey: "planejar" }));
  });

  it("destino não possui a etapa atual → remapeia e informa no toast", async () => {
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi.fn().mockResolvedValue(evaluation({ nextFunctionKey: "criar_roteiro", direction: "forward" })) as any,
      apply: vi.fn().mockResolvedValue({ status: "applied" }),
    });
    expect(res.status).toBe("applied");
    expect(res.stageChanged).toBe(true);
    expect(res.nextFunctionKey).toBe("criar_roteiro");
    expect(res.message).toContain("etapa ajustada para Criar roteiro");
  });

  it("nenhuma etapa segura → bloqueia com motivo", async () => {
    const apply = vi.fn();
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi.fn().mockResolvedValue(
        evaluation({ allowed: false, blockedBy: "function", nextFunctionKey: null, message: "Letícia não tem etapa compatível." }),
      ) as any,
      apply,
    });
    expect(res.status).toBe("blocked");
    expect(apply).not.toHaveBeenCalled();
  });

  it("horário ocupado com slot livre → reagenda automaticamente (não bloqueia)", async () => {
    const apply = vi.fn().mockResolvedValue({ status: "applied" });
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi.fn().mockResolvedValue(
        evaluation({ allowed: false, blockedBy: "schedule", nextFunctionKey: "criar_arte", suggestion: SLOT }),
      ) as any,
      apply,
    });
    expect(res.status).toBe("applied");
    expect(res.rescheduled).toBe(true);
    expect(res.finalSchedule).toEqual({
      due_date: "2026-08-21",
      due_time: "10:25",
      delivery_date: "2026-08-21",
      delivery_time: "10:45",
    });
    expect(res.message).toContain("reagendada para 21/08 às 10:25");
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("agenda sem nenhum slot livre → bloqueia", async () => {
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi.fn().mockResolvedValue(
        evaluation({ allowed: false, blockedBy: "schedule", suggestion: null }),
      ) as any,
      apply: vi.fn(),
    });
    expect(res.status).toBe("blocked");
  });

  it("captação com conflito fixo não é empurrada automaticamente", async () => {
    const captar = { ...params, card: { ...CARD, current_function_key: "captar" } };
    const res = await smartAdministrativeReassign(captar as any, {
      evaluate: vi.fn().mockResolvedValue(
        evaluation({ allowed: false, blockedBy: "schedule", nextFunctionKey: "captar", suggestion: SLOT }),
      ) as any,
      apply: vi.fn(),
    });
    expect(res.status).toBe("blocked");
    expect(res.message).toContain("captações têm compromisso fixo");
  });

  it("corrida no commit → reavalia uma vez e conclui com o novo slot", async () => {
    const apply = vi
      .fn()
      .mockResolvedValueOnce({ status: "conflict" })
      .mockResolvedValueOnce({ status: "applied" });
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce(evaluation({ allowed: false, blockedBy: "schedule", suggestion: SLOT }))
        .mockResolvedValueOnce(
          evaluation({ allowed: false, blockedBy: "schedule", suggestion: { ...SLOT, startTime: "11:00", endTime: "11:20" } }),
        ) as any,
      apply,
    });
    expect(res.status).toBe("applied");
    expect(res.retried).toBe(true);
    expect(res.finalSchedule?.due_time).toBe("11:00");
  });

  it("card mudou de etapa durante a transferência → stale, nunca grava plano antigo", async () => {
    const apply = vi.fn().mockResolvedValue({ status: "stale" });
    const res = await smartAdministrativeReassign(params, {
      evaluate: vi.fn().mockResolvedValue(evaluation()) as any,
      apply,
    });
    expect(res.status).toBe("stale");
  });
});
