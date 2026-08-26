import { describe, expect, it } from "vitest";
import {
  anchorKeyFor,
  isPlanningCard,
  isReviewCard,
  resolveOfficeZone,
  zoneIsVisible,
  zonePosture,
} from "./officeZone";

describe("officeZone — resolver de zona", () => {
  it("off_shift sai da sala", () => {
    expect(resolveOfficeZone({ state: "off_shift", current: { functionKey: "planejar" } })).toBe(
      "off_shift",
    );
    expect(zoneIsVisible("off_shift")).toBe(false);
  });

  it("available / micro_break / official_break vão ao café", () => {
    for (const state of ["available", "micro_break", "official_break"] as const) {
      expect(resolveOfficeZone({ state, current: { functionKey: "criar_arte" } })).toBe("coffee");
    }
  });

  it("planejar (ou coluna Planejamento) vai ao quadro de Planejamento", () => {
    expect(resolveOfficeZone({ state: "working_now", current: { functionKey: "planejar" } })).toBe(
      "planning",
    );
    expect(
      resolveOfficeZone({
        state: "working_now",
        current: { functionKey: null, statusName: "Planejamento" },
      }),
    ).toBe("planning");
  });

  it("funções de revisão/teste vão à mesa de Revisão", () => {
    for (const key of [
      "revisar",
      "revisar_roteiro",
      "revisar_captacao",
      "revisar_publicacao",
      "testar",
    ]) {
      expect(resolveOfficeZone({ state: "working_now", current: { functionKey: key } })).toBe(
        "review",
      );
    }
  });

  it("qualquer outra função trabalha na mesa", () => {
    expect(resolveOfficeZone({ state: "working_now", current: { functionKey: "criar_arte" } })).toBe(
      "desk",
    );
    expect(resolveOfficeZone({ state: "working_now", current: null })).toBe("desk");
  });

  it("card aguardando cliente NÃO move a pessoa para o lounge", () => {
    expect(
      resolveOfficeZone({ state: "working_now", current: { functionKey: "aguardando_cliente" } }),
    ).toBe("desk");
  });

  it("não existe zona de reunião automática", () => {
    const zones = new Set(
      ["off_shift", "available", "working_now"].map((s) =>
        resolveOfficeZone({ state: s as any, current: { functionKey: "revisar" } }),
      ),
    );
    expect(zones.has("meeting" as any)).toBe(false);
  });

  it("classificadores puros", () => {
    expect(isPlanningCard({ functionKey: "criar_arte", statusName: "Planejamento" })).toBe(false);
    expect(isPlanningCard({ statusName: "planejamento" })).toBe(true);
    expect(isReviewCard({ functionKey: "publicar" })).toBe(false);
  });

  it("postura e anchors estáveis por índice", () => {
    expect(zonePosture("desk")).toBe("seated");
    expect(zonePosture("coffee")).toBe("standing");
    expect(anchorKeyFor("desk", "u1", 0)).toBe("desk:u1");
    expect(anchorKeyFor("coffee", "u1", 0)).toBe("coffee:0");
    expect(anchorKeyFor("coffee", "u2", 4)).toBe("coffee:1");
    expect(anchorKeyFor("off_shift", "u1", 0)).toBeNull();
  });
});
