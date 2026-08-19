import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_OPTIONS,
  EMPTY_CONTENT_FILTERS,
  buildClassificationCounts,
  buildTypeCounts,
  classificationLabel,
  countActiveContentFilters,
  matchesContentFilters,
  type FilterableContentItem,
} from "./contentFilters";

const item = (over: Partial<FilterableContentItem> = {}): FilterableContentItem => ({
  title: "DF-001 · Reel sobre transporte",
  typeLabel: "Vídeo captado",
  classifications: [],
  isDemand: true,
  ...over,
});

describe("contentFilters", () => {
  it("sem filtros aceita tudo", () => {
    expect(matchesContentFilters(item(), EMPTY_CONTENT_FILTERS)).toBe(true);
  });

  it("busca casa título e tipo, sem case-sensitivity", () => {
    expect(matchesContentFilters(item(), { ...EMPTY_CONTENT_FILTERS, search: "transporte" })).toBe(true);
    expect(matchesContentFilters(item(), { ...EMPTY_CONTENT_FILTERS, search: "VÍDEO" })).toBe(true);
    expect(matchesContentFilters(item(), { ...EMPTY_CONTENT_FILTERS, search: "carrossel" })).toBe(false);
  });

  it("filtra por tipo exato e agrupa sem tipo", () => {
    expect(matchesContentFilters(item(), { ...EMPTY_CONTENT_FILTERS, type: "Vídeo captado" })).toBe(true);
    expect(matchesContentFilters(item(), { ...EMPTY_CONTENT_FILTERS, type: "Carrossel" })).toBe(false);
    expect(
      matchesContentFilters(item({ typeLabel: "" }), { ...EMPTY_CONTENT_FILTERS, type: "Sem tipo" })
    ).toBe(true);
  });

  it("classificação só aceita demandas reais com a marcação", () => {
    const marked = item({ classifications: ["anuncio"] });
    expect(matchesContentFilters(marked, { ...EMPTY_CONTENT_FILTERS, classification: "anuncio" })).toBe(true);
    expect(matchesContentFilters(marked, { ...EMPTY_CONTENT_FILTERS, classification: "grafica" })).toBe(false);
    expect(
      matchesContentFilters({ ...marked, isDemand: false }, { ...EMPTY_CONTENT_FILTERS, classification: "anuncio" })
    ).toBe(false);
  });

  it("combina múltiplos filtros em AND", () => {
    const marked = item({ classifications: ["grafica"] });
    expect(
      matchesContentFilters(marked, { search: "transporte", type: "Vídeo captado", classification: "grafica" })
    ).toBe(true);
    expect(
      matchesContentFilters(marked, { search: "inexistente", type: "Vídeo captado", classification: "grafica" })
    ).toBe(false);
  });

  it("conta tipos por volume e classificações", () => {
    const items = [
      item(),
      item({ typeLabel: "Carrossel", classifications: ["anuncio"] }),
      item({ typeLabel: "Carrossel", classifications: ["anuncio", "grafica"] }),
    ];
    expect(buildTypeCounts(items)[0]).toEqual(["Carrossel", 2]);
    expect(buildClassificationCounts(items)).toEqual({ anuncio: 2, grafica: 1 });
  });

  it("conta filtros ativos e limpa por completo", () => {
    expect(countActiveContentFilters(EMPTY_CONTENT_FILTERS)).toBe(0);
    expect(countActiveContentFilters({ search: " x ", type: "Carrossel", classification: "anuncio" })).toBe(3);
    expect(countActiveContentFilters({ ...EMPTY_CONTENT_FILTERS, search: "   " })).toBe(0);
  });

  it("expõe as mesmas opções de classificação para as duas abas", () => {
    expect(CLASSIFICATION_OPTIONS.map((o) => o.key)).toEqual(["anuncio", "grafica"]);
    expect(classificationLabel("anuncio")).toBe("Anúncio");
    expect(classificationLabel("grafica")).toBe("Gráfica");
  });
});
