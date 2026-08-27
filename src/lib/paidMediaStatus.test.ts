import { describe, expect, it } from "vitest";
import {
  PAID_MEDIA_STATUS_OPTIONS,
  calendarDateOnly,
  effectivePaidMediaStatus,
  paidMediaMarketStatusLabel,
} from "@/lib/expansionMarkets";
import { paidMediaRowBadge, paidMediaRowClass } from "@/lib/marketRowStyles";

/** Ribeirão Preto: anúncios de 28/08 a 30/08/2026. */
const RIBEIRAO = {
  ads_start_date: "2026-08-28",
  ads_end_date: "2026-08-30",
  paid_media_status_override: null as null | "planned",
};

describe("effectivePaidMediaStatus", () => {
  it("antes da janela (27/08) a cidade está PROGRAMADA", () => {
    expect(effectivePaidMediaStatus(RIBEIRAO, "2026-08-27")).toBe("planned");
  });

  it("depois da janela (31/08) a cidade está CONCLUÍDA", () => {
    expect(effectivePaidMediaStatus(RIBEIRAO, "2026-08-31")).toBe("completed");
  });

  it("dentro da janela está RODANDO (inclusive nas bordas)", () => {
    expect(effectivePaidMediaStatus(RIBEIRAO, "2026-08-28")).toBe("running");
    expect(effectivePaidMediaStatus(RIBEIRAO, "2026-08-29")).toBe("running");
    expect(effectivePaidMediaStatus(RIBEIRAO, "2026-08-30")).toBe("running");
  });

  it("override explícito vence a janela", () => {
    expect(
      effectivePaidMediaStatus(
        { ...RIBEIRAO, paid_media_status_override: "paused" as any },
        "2026-08-29",
      ),
    ).toBe("paused");
    expect(
      effectivePaidMediaStatus(
        { ...RIBEIRAO, paid_media_status_override: "running" as any },
        "2026-08-31",
      ),
    ).toBe("running");
  });

  it("override nulo volta ao automático", () => {
    expect(effectivePaidMediaStatus({ ...RIBEIRAO, paid_media_status_override: null }, "2026-08-31"))
      .toBe("completed");
  });

  it("sem janela nenhuma é PROGRAMADA", () => {
    expect(
      effectivePaidMediaStatus(
        { ads_start_date: null, ads_end_date: null, paid_media_status_override: null },
        "2026-08-29",
      ),
    ).toBe("planned");
  });

  it("só fim: programada até o fim, concluída depois", () => {
    const onlyEnd = { ads_start_date: null, ads_end_date: "2026-08-30", paid_media_status_override: null };
    expect(effectivePaidMediaStatus(onlyEnd, "2026-08-30")).toBe("planned");
    expect(effectivePaidMediaStatus(onlyEnd, "2026-08-31")).toBe("completed");
  });

  it("só início: roda a partir do início", () => {
    const onlyStart = { ads_start_date: "2026-08-28", ads_end_date: null, paid_media_status_override: null };
    expect(effectivePaidMediaStatus(onlyStart, "2026-08-27")).toBe("planned");
    expect(effectivePaidMediaStatus(onlyStart, "2026-09-20")).toBe("running");
  });

  it("nunca lê nem altera o status COMERCIAL da praça", () => {
    const market = { ...RIBEIRAO, status: "active" } as any;
    const before = market.status;
    expect(effectivePaidMediaStatus(market, "2026-08-27")).toBe("planned");
    expect(market.status).toBe(before);
  });
});

describe("calendarDateOnly", () => {
  it("usa data local, sem toISOString", () => {
    expect(calendarDateOnly(new Date(2026, 7, 27, 23, 30))).toBe("2026-08-27");
    expect(calendarDateOnly("2026-08-27T10:00:00Z")).toBe("2026-08-27");
  });
});

describe("dropdown de status de mídia", () => {
  it("primeira opção é Automático (null no banco)", () => {
    expect(PAID_MEDIA_STATUS_OPTIONS[0]).toEqual({ value: null, label: "Automático" });
  });

  it("cobre os cinco status permitidos", () => {
    expect(PAID_MEDIA_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      null,
      "planned",
      "running",
      "paused",
      "completed",
      "cancelled",
    ]);
  });

  it("rótulos em português", () => {
    expect(paidMediaMarketStatusLabel("running")).toBe("Rodando");
    expect(paidMediaMarketStatusLabel("completed")).toBe("Concluída");
  });
});

describe("hierarquia visual da linha de mídia", () => {
  it("rodando ganha destaque; programada é neutra", () => {
    expect(paidMediaRowClass("running")).toContain("border-l-primary");
    expect(paidMediaRowClass("planned")).toBe("");
  });

  it("selo nunca usa o conceito comercial ATUAL", () => {
    const labels = (["planned", "running", "paused", "completed", "cancelled"] as const)
      .map((s) => paidMediaRowBadge(s)?.label ?? "");
    expect(labels.join("|")).not.toContain("ATUAL");
    expect(paidMediaRowBadge("running")?.label).toBe("RODANDO");
    expect(paidMediaRowBadge("completed")).toBeNull();
  });
});
