import { beforeEach, describe, expect, it, vi } from "vitest";

/** Feriados injetados no motor de reorganização (mutável entre testes). */
const HOLIDAYS: string[] = [];

vi.mock("@/lib/dailyCards", () => ({
  fetchHolidaysInRange: vi.fn(async () => new Set<string>(HOLIDAYS)),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase não deve ser tocado nos testes de alocação em massa");
    },
  },
}));

import {
  applyBulkAllocation,
  buildAreaScheduleMap,
  canBulkAllocate,
  collaboratorMayReceive,
  ineligibleReason,
  isDragEnabled,
  planBulkAllocation,
  signatureOf,
  signaturesMatch,
  STALE_BULK_MESSAGE,
  type BulkAllocationDeps,
  type BulkCardRow,
} from "@/lib/bulkAllocation";
import { DEFAULT_REORDER_PRIORITY_BY_AREA } from "@/lib/reorderPriority";
import { isFeedEntrySelectable } from "@/lib/instagramFeed";

const NOW = new Date("2026-08-05T12:00:00.000Z"); // quarta-feira, 09:00 em São Paulo
const TENANT = "tenant-1";
const TARGET = "user-target";
const OTHER = "user-other";

const WORK_HOURS = {
  start: "09:00",
  end: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:30",
  tz: "America/Sao_Paulo",
};

const DURATIONS = {
  "midia:criar_arte": { estatico: 45, byType: { criativo_estatico: 90 } },
  "midia:revisar": { byType: { criativo_estatico: 30 } },
  "sistemas:desenvolver": { byType: { desenvolvimento: 120 } },
};

function row(overrides: Partial<BulkCardRow> = {}): BulkCardRow {
  return {
    id: "c1",
    tenant_id: TENANT,
    title: "Card",
    client_id: "client-1",
    client_name: "Cliente",
    assigned_to: OTHER,
    current_function_key: "criar_arte",
    demand_type: "Criativo estático",
    demand_type_key: "criativo_estatico",
    work_area: "midia",
    origin: "interna",
    due_date: null,
    due_time: null,
    delivery_date: null,
    delivery_time: null,
    publish_date: null,
    publish_time: null,
    is_daily_card: false,
    is_draft: false,
    archived_at: null,
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

interface Harness {
  deps: Partial<BulkAllocationDeps>;
  reassignCalls: any[];
  scheduleCalls: any[];
  evaluateCalls: any[];
}

function harness(opts: {
  cards: BulkCardRow[];
  queue?: BulkCardRow[];
  evaluate?: (card: BulkCardRow) => any;
  stageStarts?: Record<string, string>;
  areaSchedule?: any;
  dispatchIds?: string[];
  signatures?: Record<string, any>;
  reassignResult?: (cardId: string) => any;
  scheduleResult?: (cardId: string) => "ok" | "conflict" | "error";
}): Harness {
  const reassignCalls: any[] = [];
  const scheduleCalls: any[] = [];
  const evaluateCalls: any[] = [];

  const deps: Partial<BulkAllocationDeps> = {
    loadCards: async () => opts.cards.map((c) => ({ ...c })),
    loadUserQueue: async (_t, _u, exclude) =>
      (opts.queue || []).filter((q) => !exclude.includes(q.id)).map((c) => ({ ...c })),
    loadStageStarts: async () => opts.stageStarts || {},
    loadWorkHours: async () => WORK_HOURS,
    loadAreaSchedule: async () => opts.areaSchedule,
    loadDurations: async () => DURATIONS as any,
    loadPriority: async () => ({ ...DEFAULT_REORDER_PRIORITY_BY_AREA }),
    loadActiveDispatchIds: async () => new Set(opts.dispatchIds || []),
    loadUserName: async () => "Alvo",
    loadUserNames: async () => ({ [OTHER]: "Outro" }),
    evaluate: async ({ card }) => {
      evaluateCalls.push(card);
      return (
        opts.evaluate?.(card) ?? {
          status: "ok",
          nextFunctionKey: card.current_function_key,
          direction: "same",
          softMessages: [],
        }
      );
    },
    applyReassign: async (input: any) => {
      reassignCalls.push(input);
      return opts.reassignResult?.(input.card.id) ?? { status: "ok", message: "ok" };
    },
    updateSchedule: async (cardId, payload, expected) => {
      scheduleCalls.push({ cardId, payload, expected });
      return opts.scheduleResult?.(cardId) ?? "ok";
    },
    loadSignatures: async (_t, ids) => {
      if (opts.signatures) return opts.signatures;
      const all = [...opts.cards, ...(opts.queue || [])];
      const out: Record<string, any> = {};
      for (const id of ids) {
        const found = all.find((c) => c.id === id);
        if (found) out[id] = signatureOf(found);
      }
      return out;
    },
    now: () => NOW,
    uuid: () => "bulk-test-id",
  };

  return { deps, reassignCalls, scheduleCalls, evaluateCalls };
}

const plan = (h: Harness, cardIds: string[], extra: any = {}) =>
  planBulkAllocation(
    { tenantId: TENANT, cardIds, targetUserId: TARGET, sourceScreen: "overview", ...extra },
    h.deps,
  );

beforeEach(() => {
  HOLIDAYS.length = 0;
});

// ------------------------------------------------------------------
// Descoberta de etapa
// ------------------------------------------------------------------

describe("planBulkAllocation — descoberta de etapa", () => {
  it("mantém a etapa atual quando o colaborador pode executá-la", async () => {
    const h = harness({ cards: [row()] });
    const p = await plan(h, ["c1"]);
    expect(p.assignments[0].resolvedFunctionKey).toBe("criar_arte");
    expect(p.assignments[0].direction).toBe("same");
    expect(p.rejected).toHaveLength(0);
  });

  it("adota a etapa resolvida quando o colaborador só executa outra função", async () => {
    const h = harness({
      cards: [row()],
      evaluate: () => ({ status: "ok", nextFunctionKey: "revisar", direction: "forward", softMessages: [] }),
    });
    const p = await plan(h, ["c1"]);
    expect(p.assignments[0].resolvedFunctionKey).toBe("revisar");
    expect(p.assignments[0].direction).toBe("forward");
    // duração passa a ser a da nova etapa/tipo
    expect(p.assignments[0].durationMin).toBe(30);
  });

  it("rejeita o card quando nenhuma etapa é compatível (bloqueio por função)", async () => {
    const h = harness({
      cards: [row()],
      evaluate: () => ({ status: "blocked", blockedBy: "function", message: "Sem função", nextFunctionKey: null }),
    });
    const p = await plan(h, ["c1"]);
    expect(p.assignments).toHaveLength(0);
    expect(p.rejected[0].reason).toBe("Sem função");

    const res = await applyBulkAllocation(p, h.deps);
    expect(res.status).toBe("nothing");
    expect(h.reassignCalls).toHaveLength(0);
  });

  it("não rejeita por conflito de agenda — apenas guarda o aviso", async () => {
    const h = harness({
      cards: [row()],
      evaluate: () => ({
        status: "soft",
        nextFunctionKey: "criar_arte",
        direction: "same",
        blockedBy: "schedule",
        softMessages: ["Conflito de agenda"],
      }),
    });
    const p = await plan(h, ["c1"]);
    expect(p.assignments).toHaveLength(1);
    expect(p.assignments[0].warnings).toContain("Conflito de agenda");
  });

  it("delega a decisão de etapa passando o card íntegro (área, tipo e origem)", async () => {
    const h = harness({
      cards: [row({ work_area: "sistemas", origin: "cliente", demand_type_key: "desenvolvimento" })],
    });
    await plan(h, ["c1"]);
    expect(h.evaluateCalls[0]).toMatchObject({
      work_area: "sistemas",
      origin: "cliente",
      demand_type_key: "desenvolvimento",
      current_function_key: "criar_arte",
    });
  });

  it("não reavalia etapa de card que já pertence ao destinatário", async () => {
    const h = harness({ cards: [row({ assigned_to: TARGET })] });
    const p = await plan(h, ["c1"]);
    expect(h.evaluateCalls).toHaveLength(0);
    expect(p.assignments[0].sameAssignee).toBe(true);
    expect(p.summary.reassigned).toBe(0);
  });
});

// ------------------------------------------------------------------
// Duração real
// ------------------------------------------------------------------

describe("planBulkAllocation — duração real", () => {
  it("usa durations_by_type do tipo da demanda", async () => {
    const h = harness({ cards: [row()] });
    const p = await plan(h, ["c1"]);
    expect(p.assignments[0].durationMin).toBe(90);
  });

  it("usa a duração da área correta (sistemas ≠ mídia)", async () => {
    const h = harness({
      cards: [row({ work_area: "sistemas", current_function_key: "desenvolver", demand_type_key: "desenvolvimento" })],
    });
    const p = await plan(h, ["c1"]);
    expect(p.assignments[0].durationMin).toBe(120);
  });

  it("prioriza o override por tipo sobre o valor do grupo legado", async () => {
    const h = harness({ cards: [row({ demand_type_key: "criativo_estatico" })] });
    const p = await plan(h, ["c1"]);
    expect(p.assignments[0].durationMin).toBe(90); // não 45 (grupo "estatico")
  });
});

// ------------------------------------------------------------------
// Sequenciamento
// ------------------------------------------------------------------

describe("planBulkAllocation — sequenciamento", () => {
  it("não sobrepõe cards selecionados entre si", async () => {
    const h = harness({ cards: [row({ id: "a" }), row({ id: "b" })] });
    const p = await plan(h, ["a", "b"]);
    const windows = p.assignments
      .map((a) => ({ s: `${a.dueDate}T${a.dueTime}`, e: `${a.deliveryDate}T${a.deliveryTime}` }))
      .sort((x, y) => x.s.localeCompare(y.s));
    expect(windows[1].s >= windows[0].e).toBe(true);
  });

  it("considera a fila atual do destinatário ao encaixar os novos cards", async () => {
    const queue = [
      row({
        id: "q1",
        assigned_to: TARGET,
        due_date: "2026-08-05",
        due_time: "09:00",
        delivery_date: "2026-08-05",
        delivery_time: "10:30",
      }),
    ];
    const h = harness({ cards: [row({ id: "a" })], queue });
    const p = await plan(h, ["a"]);
    const a = p.assignments[0];
    const q = p.queueReschedules.find((x) => x.cardId === "q1");
    const qStart = q ? `${q.dueDate}T${q.dueTime}` : "2026-08-05T09:00";
    expect(`${a.dueDate}T${a.dueTime}`).not.toBe(qStart);
  });

  it("prioriza data de publicação mais próxima", async () => {
    const h = harness({
      cards: [row({ id: "late", publish_date: "2026-09-30" }), row({ id: "soon", publish_date: "2026-08-07" })],
    });
    const p = await plan(h, ["late", "soon"]);
    const soon = p.assignments.find((x) => x.cardId === "soon")!;
    const late = p.assignments.find((x) => x.cardId === "late")!;
    expect(`${soon.dueDate}T${soon.dueTime}` < `${late.dueDate}T${late.dueTime}`).toBe(true);
  });

  it("respeita a agenda de área do colaborador", async () => {
    const areaSchedule = buildAreaScheduleMap([
      { work_area: "midia", weekday: 3, start_time: "14:00", end_time: "18:00" },
      { work_area: "midia", weekday: 4, start_time: "14:00", end_time: "18:00" },
    ]);
    const h = harness({ cards: [row()], areaSchedule });
    const p = await plan(h, ["c1"]);
    expect(p.assignments[0].dueTime! >= "14:00").toBe(true);
  });

  it("não agenda em feriado ou fim de semana", async () => {
    HOLIDAYS.push("2026-08-06", "2026-08-07");
    const h = harness({
      cards: [row({ id: "a" }), row({ id: "b" }), row({ id: "c" }), row({ id: "d" }), row({ id: "e" })],
    });
    const p = await plan(h, ["a", "b", "c", "d", "e"]);
    for (const a of p.assignments) {
      expect(["2026-08-06", "2026-08-07"]).not.toContain(a.dueDate);
      const weekday = new Date(`${a.dueDate}T12:00:00Z`).getUTCDay();
      expect(weekday === 0 || weekday === 6).toBe(false);
    }
  });

  it("preserva o horário de cards fixos (card diário)", async () => {
    const h = harness({
      cards: [
        row({
          id: "daily",
          is_daily_card: true,
          due_date: "2026-08-10",
          due_time: "08:00",
          delivery_date: "2026-08-10",
          delivery_time: "08:30",
        }),
      ],
    });
    const p = await plan(h, ["daily"]);
    const a = p.assignments[0];
    expect(a.dueDate).toBe("2026-08-10");
    expect(a.dueTime).toBe("08:00");
    expect(a.scheduleChanged).toBe(false);
  });

  it("não consome tempo operacional com dispatch de publicação ativo", async () => {
    const h = harness({ cards: [row({ id: "pub" })], dispatchIds: ["pub"] });
    const p = await plan(h, ["pub"]);
    const a = p.assignments[0];
    expect(a.fixed || a.untimed).toBe(true);
    expect(a.scheduleChanged).toBe(false);
  });

  it("lista os cards antigos do destinatário que precisaram ser reagendados", async () => {
    const queue = [
      row({
        id: "q1",
        assigned_to: TARGET,
        due_date: "2026-08-05",
        due_time: "16:00",
        delivery_date: "2026-08-05",
        delivery_time: "17:30",
        publish_date: "2026-09-30",
      }),
    ];
    const h = harness({ cards: [row({ id: "a", publish_date: "2026-08-06" })], queue });
    const p = await plan(h, ["a"]);
    expect(p.summary.rescheduledExisting).toBe(p.queueReschedules.length);
    for (const q of p.queueReschedules) {
      expect(q.fromDueTime).toBe("16:00");
      expect(q.dueDate).toBeTruthy();
    }
  });
});

// ------------------------------------------------------------------
// Elegibilidade
// ------------------------------------------------------------------

describe("elegibilidade", () => {
  it("rejeita rascunho, arquivado e inexistente", async () => {
    expect(ineligibleReason(undefined)).toBe("Card não encontrado");
    expect(ineligibleReason(row({ is_draft: true }))).toContain("Rascunho");
    expect(ineligibleReason(row({ archived_at: "2026-01-01" }))).toBe("Card arquivado");
    expect(ineligibleReason(row())).toBeNull();

    const h = harness({ cards: [row({ id: "draft", is_draft: true })] });
    const p = await plan(h, ["draft"]);
    expect(p.assignments).toHaveLength(0);
    expect(p.rejected).toHaveLength(1);
  });

  it("filtro grosseiro de colaborador respeita as áreas selecionadas", () => {
    const areas = { u1: new Set(["midia"]), u2: new Set(["sistemas"]) };
    expect(collaboratorMayReceive(areas, "u1", new Set(["midia"]))).toBe(true);
    expect(collaboratorMayReceive(areas, "u1", new Set(["sistemas"]))).toBe(false);
    expect(collaboratorMayReceive(areas, "desconhecido", new Set(["midia"]))).toBe(true);
  });
});

// ------------------------------------------------------------------
// Aplicação
// ------------------------------------------------------------------

describe("applyBulkAllocation", () => {
  it("aborta sem nenhum write quando a fila mudou (preflight)", async () => {
    const h = harness({ cards: [row()] });
    const p = await plan(h, ["c1"]);
    const stale = harness({
      cards: [row()],
      signatures: { c1: { ...signatureOf(row()), updated_at: "2026-08-04T00:00:00.000Z" } },
    });
    const res = await applyBulkAllocation(p, stale.deps);
    expect(res.status).toBe("stale");
    expect(res.message).toBe(STALE_BULK_MESSAGE);
    expect(stale.reassignCalls).toHaveLength(0);
    expect(stale.scheduleCalls).toHaveLength(0);
  });

  it("transfere via applyReassign com etapa resolvida, agenda e metadados de rastreio", async () => {
    const h = harness({ cards: [row()] });
    const p = await plan(h, ["c1"]);
    const res = await applyBulkAllocation(p, h.deps);
    expect(res.status).toBe("applied");
    expect(h.reassignCalls).toHaveLength(1);
    const call = h.reassignCalls[0];
    expect(call.newAssignedTo).toBe(TARGET);
    expect(call.nextFunctionKey).toBe("criar_arte");
    expect(call.reschedule).toMatchObject({ due_date: expect.any(String), delivery_date: expect.any(String) });
    expect(call.historySource).toBe("bulk_allocation");
    expect(call.metadata.bulk_allocation_id).toBe("bulk-test-id");
    expect(call.metadata.source_screen).toBe("overview");
  });

  it("não altera status, released_at nem anexos", async () => {
    const queue = [
      row({
        id: "q1",
        assigned_to: TARGET,
        due_date: "2026-08-05",
        due_time: "16:00",
        delivery_date: "2026-08-05",
        delivery_time: "17:30",
        publish_date: "2026-09-30",
      }),
    ];
    const h = harness({ cards: [row({ id: "a", publish_date: "2026-08-06" })], queue });
    const p = await plan(h, ["a"]);
    await applyBulkAllocation(p, h.deps);
    const forbidden = ["status_id", "released_at", "released_by", "attachments", "reference_attachments", "is_draft"];
    for (const call of h.scheduleCalls) {
      for (const key of forbidden) expect(Object.keys(call.payload)).not.toContain(key);
    }
    for (const call of h.reassignCalls) {
      expect(Object.keys(call.reschedule || {}).sort()).toEqual([
        "delivery_date",
        "delivery_time",
        "due_date",
        "due_time",
      ]);
    }
  });

  it("apenas reagenda (sem transferência) cards que já eram do destinatário", async () => {
    const h = harness({ cards: [row({ assigned_to: TARGET })] });
    const p = await plan(h, ["c1"]);
    await applyBulkAllocation(p, h.deps);
    expect(h.reassignCalls).toHaveLength(0);
  });

  it("retorna parcial e para na primeira falha de transferência", async () => {
    const h = harness({
      cards: [row({ id: "a" }), row({ id: "b" })],
      reassignResult: (id) => (id === "a" ? { status: "ok" } : { status: "conflict", message: "Agenda ocupada" }),
    });
    const p = await plan(h, ["a", "b"]);
    const res = await applyBulkAllocation(p, h.deps);
    expect(res.status).toBe("partial");
    expect(res.appliedIds).toEqual(["a"]);
    expect(res.failed[0]).toMatchObject({ cardId: "b", reason: "Agenda ocupada" });
  });

  it("usa lock otimista de updated_at nos reagendamentos da fila existente", async () => {
    const queue = [
      row({
        id: "q1",
        assigned_to: TARGET,
        due_date: "2026-08-05",
        due_time: "16:00",
        delivery_date: "2026-08-05",
        delivery_time: "17:30",
        publish_date: "2026-09-30",
        updated_at: "2026-08-02T09:00:00.000Z",
      }),
    ];
    const h = harness({ cards: [row({ id: "a", publish_date: "2026-08-06" })], queue });
    const p = await plan(h, ["a"]);
    await applyBulkAllocation(p, h.deps);
    for (const call of h.scheduleCalls) {
      if (call.cardId === "q1") expect(call.expected).toBe("2026-08-02T09:00:00.000Z");
    }
  });
});

// ------------------------------------------------------------------
// Guardas de UI
// ------------------------------------------------------------------

describe("guardas de UI", () => {
  it("só gestor operacional e super admin podem alocar em massa", () => {
    expect(canBulkAllocate({ isSuperAdmin: true })).toBe(true);
    expect(canBulkAllocate({ isAgencyManager: true })).toBe(true);
    expect(canBulkAllocate({})).toBe(false);
  });

  it("desabilita drag-and-drop no modo seleção e no registro de entregas", () => {
    expect(isDragEnabled({ selectionMode: false, historyMode: false })).toBe(true);
    expect(isDragEnabled({ selectionMode: true, historyMode: false })).toBe(false);
    expect(isDragEnabled({ selectionMode: false, historyMode: true })).toBe(false);
  });

  it("no Feed Simulado apenas demandas reais são selecionáveis", () => {
    expect(isFeedEntrySelectable({ isDemand: true, demandId: "d1" })).toBe(true);
    expect(isFeedEntrySelectable({ isDemand: false, demandId: null })).toBe(false);
    expect(isFeedEntrySelectable({ isDemand: true, demandId: null })).toBe(false);
  });

  it("assinatura detecta mudança de responsável, etapa e agenda", () => {
    const base = signatureOf(row());
    expect(signaturesMatch(base, signatureOf(row()))).toBe(true);
    expect(signaturesMatch(base, signatureOf(row({ assigned_to: "x" })))).toBe(false);
    expect(signaturesMatch(base, signatureOf(row({ current_function_key: "revisar" })))).toBe(false);
    expect(signaturesMatch(base, signatureOf(row({ due_time: "10:00" })))).toBe(false);
  });
});
