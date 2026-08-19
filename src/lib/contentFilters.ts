/**
 * Filtros de conteúdo compartilhados entre a aba Calendário e a aba
 * Feed Simulado do Hub do Cliente.
 *
 * Fonte de verdade única: mesma semântica de busca, tipo de conteúdo e
 * classificação operacional (Anúncio / Gráfica) nas duas abas.
 */

export type ContentClassification = "anuncio" | "grafica";

export const CLASSIFICATION_OPTIONS: Array<{ key: ContentClassification; label: string }> = [
  { key: "anuncio", label: "Anúncios" },
  { key: "grafica", label: "Gráfica" },
];

export const classificationLabel = (key: string): string =>
  key === "anuncio" ? "Anúncio" : key === "grafica" ? "Gráfica" : key;

/** Item mínimo filtrável — Calendário e Feed adaptam suas entradas para isto. */
export interface FilterableContentItem {
  title: string;
  /** Rótulo do tipo de conteúdo ("Carrossel", "Vídeo captado", ...). */
  typeLabel: string | null;
  classifications: string[];
  isDemand: boolean;
}

export interface ContentFilterState {
  search: string;
  /** "all" ou o rótulo exato do tipo. */
  type: string;
  classification: ContentClassification | null;
}

export const EMPTY_CONTENT_FILTERS: ContentFilterState = {
  search: "",
  type: "all",
  classification: null,
};

export const NO_TYPE_LABEL = "Sem tipo";

export const normalizedTypeLabel = (typeLabel: string | null | undefined): string => {
  const value = String(typeLabel || "").trim();
  return value || NO_TYPE_LABEL;
};

/** Combinação AND de todos os filtros — nenhum filtro reseta o outro. */
export function matchesContentFilters(
  item: FilterableContentItem,
  state: ContentFilterState
): boolean {
  const term = state.search.trim().toLowerCase();
  if (term) {
    const haystack = `${item.title} ${item.typeLabel || ""}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (state.type !== "all" && normalizedTypeLabel(item.typeLabel) !== state.type) return false;
  if (state.classification) {
    if (!item.isDemand) return false;
    if (!item.classifications.includes(state.classification)) return false;
  }
  return true;
}

/** Contagem por tipo, ordenada por volume (padrão visual do Calendário). */
export function buildTypeCounts(items: FilterableContentItem[]): Array<[string, number]> {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const key = normalizedTypeLabel(item.typeLabel);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function buildClassificationCounts(
  items: FilterableContentItem[]
): Record<ContentClassification, number> {
  return {
    anuncio: items.filter((i) => i.isDemand && i.classifications.includes("anuncio")).length,
    grafica: items.filter((i) => i.isDemand && i.classifications.includes("grafica")).length,
  };
}

/** Quantos filtros compartilhados estão ativos (indicador visual). */
export function countActiveContentFilters(state: ContentFilterState): number {
  let count = 0;
  if (state.search.trim()) count += 1;
  if (state.type !== "all") count += 1;
  if (state.classification) count += 1;
  return count;
}
