import { describe, it, expect } from "vitest";
import { matchesDemandSearch, searchTerms, normalizeSearchText } from "./demandTextSearch";

const card = {
  title: "Vídeo captado na feira do Agro",
  clientName: "Paulo Bianchini",
  description: "Registro do dia no estande",
  objective: "Aproximação com produtores",
  instructions: "Gravar depoimento",
  observations: "Levar microfone",
  post_caption: "Legenda com CTA",
  demand_type: "Vídeo captado",
  status: "Em produção",
  attachments: [{ name: "roteiro-final.pdf", type: "application/pdf" }],
  reference_attachments: [{ name: "referencia-feira.jpg" }],
};

describe("matchesDemandSearch", () => {
  it("termo vazio não esconde nada", () => {
    expect(matchesDemandSearch(card, "")).toBe(true);
    expect(matchesDemandSearch(card, "   ")).toBe(true);
  });

  it("casa por título ignorando acentos e caixa", () => {
    expect(matchesDemandSearch(card, "video")).toBe(true);
    expect(matchesDemandSearch(card, "AGRO")).toBe(true);
    expect(matchesDemandSearch(card, "vídeo captado")).toBe(true);
  });

  it("múltiplos termos combinam em AND entre campos diferentes", () => {
    expect(matchesDemandSearch(card, "agro bianchini")).toBe(true);
    expect(matchesDemandSearch(card, "agro inexistente")).toBe(false);
  });

  it("cobre objetivo, instruções, observações, legenda, tipo e status", () => {
    expect(matchesDemandSearch(card, "produtores")).toBe(true);
    expect(matchesDemandSearch(card, "depoimento")).toBe(true);
    expect(matchesDemandSearch(card, "microfone")).toBe(true);
    expect(matchesDemandSearch(card, "cta")).toBe(true);
    expect(matchesDemandSearch(card, "produção")).toBe(true);
  });

  it("cobre anexos finais e referências", () => {
    expect(matchesDemandSearch(card, "roteiro-final")).toBe(true);
    expect(matchesDemandSearch(card, "referencia-feira")).toBe(true);
  });

  it("aceita aliases legados objetivo/instrucoes", () => {
    expect(matchesDemandSearch({ objetivo: "Vender mais" }, "vender")).toBe(true);
    expect(matchesDemandSearch({ instrucoes: "Usar logo" }, "logo")).toBe(true);
  });

  it("não casa quando nenhum campo contém o termo", () => {
    expect(matchesDemandSearch(card, "carnaval")).toBe(false);
  });

  it("helpers de normalização", () => {
    expect(normalizeSearchText("Março")).toBe("marco");
    expect(searchTerms("  a   b ")).toEqual(["a", "b"]);
    expect(searchTerms("")).toEqual([]);
  });
});
