import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dailyCards", () => ({
  fetchHolidaysInRange: vi.fn(async () => new Set<string>()),
}));

import { computeReorder, type ReorderCardInput } from "@/lib/reorderSequence";

const NOW = new Date("2026-08-05T14:00:00.000Z"); // 11:00 em São Paulo

function card(overrides: Partial<ReorderCardInput> = {}): ReorderCardInput {
  return {
    id: "active",
    title: "Card em execução",
    demand_type_key: "desenvolvimento",
    current_function_key: "desenvolver",
    work_area: "sistemas",
    due_date: "2026-08-05",
    due_time: "09:00",
    delivery_date: "2026-08-05",
    delivery_time: "11:00",
    ...overrides,
  };
}

const opts = {
  startFrom: NOW,
  workHours: {
    start: "09:00",
    end: "18:00",
    lunchStart: "12:00",
    lunchEnd: "13:30",
    tz: "America/Sao_Paulo",
  },
  durations: {
    "sistemas:desenvolver": { byType: { desenvolvimento: 120 } },
  },
};

describe("computeReorder — primeiro card em andamento", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserva o início quando o término ainda está no futuro", async () => {
    const [proposal] = await computeReorder([
      card({ delivery_time: "12:00" }),
    ], opts);

    expect(proposal.keepStart).toBe(true);
    expect([proposal.startISO, proposal.startTime]).toEqual(["2026-08-05", "09:00"]);
    expect([proposal.endISO, proposal.endTime]).toEqual(["2026-08-05", "12:00"]);
    expect(proposal.changed).toBe(false);
  });

  it("preserva o início vencido quando o planejado é igual à duração configurada", async () => {
    const [proposal] = await computeReorder([card()], {
      ...opts,
      startFrom: new Date("2026-08-05T14:05:00.000Z"), // 11:05 em São Paulo
    });

    expect(proposal.stagePlannedMin).toBe(120);
    expect(proposal.keepStart).toBe(true);
    expect([proposal.startISO, proposal.startTime]).toEqual(["2026-08-05", "09:00"]);
    expect(proposal.endTime).not.toBe("11:00");
    expect(proposal.changed).toBe(true);
  });

  it("preserva o início vencido quando o planejado supera a duração configurada", async () => {
    const [proposal] = await computeReorder([
      card({ delivery_time: "11:30" }),
    ], {
      ...opts,
      startFrom: new Date("2026-08-05T14:35:00.000Z"), // 11:35 em São Paulo
    });

    expect(proposal.stagePlannedMin).toBeGreaterThan(120);
    expect(proposal.keepStart).toBe(true);
    expect([proposal.startISO, proposal.startTime]).toEqual(["2026-08-05", "09:00"]);
    expect(proposal.changed).toBe(true);
  });

  it("aceita término manual sem liberar o início histórico", async () => {
    const [proposal] = await computeReorder([card()], {
      ...opts,
      manualOverrides: {
        active: { endISO: "2026-08-05", endTime: "16:00" },
      },
    });

    expect(proposal.keepStart).toBe(true);
    expect(proposal.pinnedKind).toBe("end");
    expect([proposal.startISO, proposal.startTime]).toEqual(["2026-08-05", "09:00"]);
    expect([proposal.endISO, proposal.endTime]).toEqual(["2026-08-05", "16:00"]);
  });

  it("aloca o card seguinte depois do término recalculado, não depois do início histórico", async () => {
    const proposals = await computeReorder([
      card(),
      card({
        id: "next",
        title: "Próximo card",
        due_date: "2026-08-06",
        due_time: "09:00",
        delivery_date: "2026-08-06",
        delivery_time: "11:00",
      }),
    ], opts);

    const active = proposals.find((proposal) => proposal.id === "active");
    const next = proposals.find((proposal) => proposal.id === "next");
    expect(active).toBeDefined();
    expect(next).toBeDefined();
    if (!active || !next) return;

    const activeEnd = `${active.endISO}T${active.endTime}`;
    const nextStart = `${next.startISO}T${next.startTime}`;
    expect(nextStart > activeEnd).toBe(true);
    expect([active.startISO, active.startTime]).toEqual(["2026-08-05", "09:00"]);
  });
});