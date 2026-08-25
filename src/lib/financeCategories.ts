/**
 * CATEGORIAS DE DESPESA (agrupamento de apresentação).
 *
 * A categoria vive em `finance_items.category` — é do CADASTRO permanente, não
 * do fato mensal. Agrupar por categoria é só apresentação: o total de um grupo
 * é a soma exata das linhas que ele contém, então a soma dos grupos continua
 * igual ao total da lista (nunca há dupla contagem).
 */
import type { FinanceItem, MonthRow } from "./financeModel";

/** Chave do grupo "sem categoria" — sempre o último da ordenação. */
export const NO_CATEGORY_KEY = "__none__";
export const NO_CATEGORY_LABEL = "Sem categoria";

/** Texto livre -> categoria canônica (`null` = sem categoria). */
export function normalizeCategory(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Chave de agrupamento/filtro de um cadastro. */
export function categoryKeyOf(item: FinanceItem): string {
  return normalizeCategory(item.category) ?? NO_CATEGORY_KEY;
}

export function categoryLabelOf(key: string): string {
  return key === NO_CATEGORY_KEY ? NO_CATEGORY_LABEL : key;
}

export interface CategoryEntryLike {
  row: MonthRow;
  value: number;
}

export interface CategoryGroup<E extends CategoryEntryLike> {
  key: string;
  label: string;
  entries: E[];
  /** Soma dos valores das linhas do grupo, no mesmo recorte da lista. */
  total: number;
  count: number;
}

/**
 * Agrupa mantendo a ordem original dentro de cada grupo.
 * Categorias em ordem alfabética; `Sem categoria` por último. Grupos vazios
 * simplesmente não existem.
 */
export function buildCategoryGroups<E extends CategoryEntryLike>(entries: E[]): CategoryGroup<E>[] {
  const buckets = new Map<string, E[]>();
  for (const entry of entries) {
    const key = categoryKeyOf(entry.row.item);
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  const groups: CategoryGroup<E>[] = [];
  for (const [key, list] of buckets) {
    groups.push({
      key,
      label: categoryLabelOf(key),
      entries: list,
      total: Number(list.reduce((sum, e) => sum + e.value, 0).toFixed(2)),
      count: list.length,
    });
  }

  return groups.sort((a, b) => {
    if (a.key === NO_CATEGORY_KEY) return 1;
    if (b.key === NO_CATEGORY_KEY) return -1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

export interface CategoryOption {
  value: string;
  label: string;
}

/** Opções do filtro `Categoria` — derivadas das linhas reais do recorte. */
export function categoryFilterOptions(entries: CategoryEntryLike[]): CategoryOption[] {
  const seen = new Set<string>();
  for (const entry of entries) seen.add(categoryKeyOf(entry.row.item));
  const named = [...seen]
    .filter((key) => key !== NO_CATEGORY_KEY)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((key) => ({ value: key, label: key }));
  if (seen.has(NO_CATEGORY_KEY)) named.push({ value: NO_CATEGORY_KEY, label: NO_CATEGORY_LABEL });
  return named;
}

export function filterEntriesByCategory<E extends CategoryEntryLike>(
  entries: E[],
  category: string,
): E[] {
  if (!category || category === "all") return entries;
  return entries.filter((entry) => categoryKeyOf(entry.row.item) === category);
}

/** Categorias já usadas pelo tenant — sugestões para escolher/criar no cadastro. */
export function tenantCategoryOptions(items: FinanceItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const category = normalizeCategory(item.category);
    if (category) seen.add(category);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
