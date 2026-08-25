import { describe, expect, it } from "vitest";
import { resolveStageName } from "@/lib/stageLabel";

describe("resolveStageName", () => {
  it("H: usa o nome de flow_functions quando existe", () => {
    expect(resolveStageName("criar_arte", { criar_arte: "Criar arte (Mídia)" })).toBe("Criar arte (Mídia)");
  });

  it("H: cai no fallback conhecido e depois na chave humanizada", () => {
    expect(resolveStageName("criar_arte", {})).toBe("Criar arte");
    expect(resolveStageName("etapa_nova_x", {})).toBe("Etapa nova x");
  });

  it("I: nunca usa o status do pipeline quando há current_function_key", () => {
    expect(resolveStageName("revisar", {}, "Em produção")).toBe("Revisar");
  });

  it("usa o status apenas quando não há etapa operacional", () => {
    expect(resolveStageName(null, {}, "Em produção")).toBe("Em produção");
    expect(resolveStageName("", {})).toBeNull();
  });
});
