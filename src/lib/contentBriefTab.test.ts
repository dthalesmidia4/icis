import { describe, it, expect } from "vitest";
import {
  EMPTY_CONTENT_BRIEF,
  resolveBriefForEditing,
  shouldShowBriefingTab,
} from "./contentBriefTab";
import { resolveDeliveryField } from "@/components/demands/MainDeliveryEditor";

describe("contentBriefTab", () => {
  it("Mídia sem content_brief tem aba Briefing com briefing vazio", () => {
    expect(shouldShowBriefingTab(null, "midia")).toBe(true);
    expect(resolveBriefForEditing(null, "midia")).toEqual(EMPTY_CONTENT_BRIEF);
  });

  it("work_area ausente é tratado como Mídia", () => {
    expect(shouldShowBriefingTab(null, null)).toBe(true);
  });

  it("Sistemas sem content_brief mantém comportamento anterior (sem aba)", () => {
    expect(shouldShowBriefingTab(null, "sistemas")).toBe(false);
    expect(resolveBriefForEditing(null, "sistemas")).toBeNull();
  });

  it("Sistemas com briefing existente continua exibindo a aba", () => {
    const brief = { version: 1, delivery_kind: "carrossel" };
    expect(shouldShowBriefingTab(brief, "sistemas")).toBe(true);
    expect(resolveBriefForEditing(brief, "sistemas")).toBe(brief);
  });

  it("briefing existente nunca é substituído", () => {
    const brief = { version: 1, slides: ["a"] };
    expect(resolveBriefForEditing(brief, "midia")).toBe(brief);
  });

  it("briefing vazio mantém fallback legado na aba Conteúdo", () => {
    expect(resolveDeliveryField(resolveBriefForEditing(null, "midia"))).toBeNull();
  });
});
