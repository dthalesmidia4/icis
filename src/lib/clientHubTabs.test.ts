import { describe, expect, it } from "vitest";
import { HUB_TABS, normalizeHubTab } from "./clientHubTabs";

describe("normalizeHubTab", () => {
  it("mantém a navegação final na ordem canônica", () => {
    expect([...HUB_TABS]).toEqual([
      "estrategia",
      "midia-paga",
      "calendario",
      "demandas",
      "feed",
      "cuidados",
      "comercial",
    ]);
  });

  it("aliases de expansão caem em Estratégia", () => {
    ["expansion", "expansao", "acquisition", "aquisicao"].forEach((t) =>
      expect(normalizeHubTab(t)).toBe("estrategia"),
    );
  });

  it("aliases em inglês apontam para as abas atuais", () => {
    expect(normalizeHubTab("paid-media")).toBe("midia-paga");
    expect(normalizeHubTab("commercial")).toBe("comercial");
    expect(normalizeHubTab("calendar")).toBe("calendario");
  });

  it("valor desconhecido ou vazio volta para Estratégia", () => {
    expect(normalizeHubTab(null)).toBe("estrategia");
    expect(normalizeHubTab("zumbi")).toBe("estrategia");
  });
});
