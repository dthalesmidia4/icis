import { describe, expect, it } from "vitest";
import { isReviewFunction, requiresIndependentReviewer } from "@/lib/flowFunctions";

describe("requiresIndependentReviewer", () => {
  it("testar não exige revisor diferente de quem executou", () => {
    expect(requiresIndependentReviewer("testar")).toBe(false);
    expect(requiresIndependentReviewer("Testar")).toBe(false);
    expect(requiresIndependentReviewer("  testar  ")).toBe(false);
  });

  it("revisões continuam exigindo revisor independente", () => {
    for (const key of [
      "revisar",
      "revisar_arte",
      "revisar_roteiro",
      "revisar_conteudo",
      "revisar_publicacao",
      "revisao",
      "revisão",
    ]) {
      expect(requiresIndependentReviewer(key)).toBe(true);
    }
  });

  it("etapas de produção e chaves vazias não exigem revisor", () => {
    expect(requiresIndependentReviewer("desenvolver")).toBe(false);
    expect(requiresIndependentReviewer("criar_arte")).toBe(false);
    expect(requiresIndependentReviewer("avaliar")).toBe(false);
    expect(requiresIndependentReviewer(null)).toBe(false);
    expect(requiresIndependentReviewer(undefined)).toBe(false);
    expect(requiresIndependentReviewer("")).toBe(false);
  });

  it("isReviewFunction continua marcando testar como revisão (agrupamentos intactos)", () => {
    expect(isReviewFunction("testar")).toBe(true);
    expect(isReviewFunction("revisar")).toBe(true);
    expect(isReviewFunction("desenvolver")).toBe(false);
  });
});
