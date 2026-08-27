import { describe, expect, it } from "vitest";
import {
  PAID_MEDIA_STATUS_OPTIONS,
  calendarDateOnly,
  effectivePaidMediaStatus,
  paidMediaMarketStatusLabel,
} from "@/lib/expansionMarkets";
import { paidMediaRowBadge, paidMediaRowClass } from "@/lib/marketRowStyles";

/** Janela planejada de Ribeirão Preto — NUNCA define status. */
const RIBEIRAO = {
  ads_start_date: "2026-08-28",
  ads_end_date: "2026-08-30",
  paid_media_status_override: null as null | "programmed",
};

describe("effectivePaidMediaStatus", () => {
  it("sem marcação humana é sempre Pendente de programação, mesmo dentro da janela", () => {
    expect(effectivePaidMediaStatus(RIBEIRAO)).toBe("pending");
    expect(effectivePaidMediaStatus({ ...RIBEIRAO, ads_start_date: "2020-01-01" } as any)).toBe(
      "pending",
    );
  });

  it("respeita o estado salvo pelo usuário", () => {
    expect(
      effectivePaidMediaStatus({ ...RIBEIRAO, paid_media_status_override: "programmed" }),
    ).toBe("programmed");
    expect(
      effectivePaidMediaStatus({ ...RIBEIRAO, paid_media_status_override: "running" as any }),
    ).toBe("running");
    expect(
      effectivePaidMediaStatus({ ...RIBEIRAO, paid_media_status_override: "paused" as any }),
    ).toBe("paused");
  });

  it("valor inválido no banco degrada para pendente", () => {
    expect(
      effectivePaidMediaStatus({ paid_media_status_override: "planned" as any }),
    ).toBe("pending");
  });

  it("cidade sem janela nenhuma também é pendente", () => {
    expect(effectivePaidMediaStatus({ paid_media_status_override: null })).toBe("pending");
  });
});

describe("calendarDateOnly", () => {
  it("usa data local, sem toISOString", () => {
    expect(calendarDateOnly(new Date(2026, 7, 27, 23, 30))).toBe("2026-08-27");
    expect(calendarDateOnly("2026-08-27T10:00:00Z")).toBe("2026-08-27");
  });
});

describe("dropdown de status de mídia", () => {
  it("não existe mais a opção Automático", () => {
    expect(PAID_MEDIA_STATUS_OPTIONS.some((o) => o.value === null)).toBe(false);
    expect(PAID_MEDIA_STATUS_OPTIONS.map((o) => o.label).join("|")).not.toContain("Automático");
  });

  it("cobre exatamente os seis estados explícitos", () => {
    expect(PAID_MEDIA_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "pending",
      "programmed",
      "running",
      "paused",
      "completed",
      "cancelled",
    ]);
  });

  it("rótulos em português", () => {
    expect(paidMediaMarketStatusLabel("pending")).toBe("Pendente de programação");
    expect(paidMediaMarketStatusLabel("programmed")).toBe("Programada");
    expect(paidMediaMarketStatusLabel("running")).toBe("Rodando");
    expect(paidMediaMarketStatusLabel("completed")).toBe("Concluída");
  });
});

describe("hierarquia visual da linha de mídia", () => {
  it("rodando ganha destaque; pendente e programada são neutras", () => {
    expect(paidMediaRowClass("running")).toContain("border-l-primary");
    expect(paidMediaRowClass("pending")).toBe("");
    expect(paidMediaRowClass("programmed")).toBe("");
  });

  it("selo nunca usa o conceito comercial ATUAL", () => {
    const labels = (
      ["pending", "programmed", "running", "paused", "completed", "cancelled"] as const
    ).map((s) => paidMediaRowBadge(s)?.label ?? "");
    expect(labels.join("|")).not.toContain("ATUAL");
    expect(paidMediaRowBadge("running")?.label).toBe("RODANDO");
    expect(paidMediaRowBadge("completed")).toBeNull();
  });
});
