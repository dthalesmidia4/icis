/**
 * AGRUPAMENTO DA COMPOSIÇÃO — duas DIMENSÕES ORTOGONAIS.
 *
 * `Categoria` é a NATUREZA da despesa (Folha, Encargos, Assinaturas, IA...).
 * `Centro de custo` é a ÁREA responsável (Administrativo, Mídia, Sistemas,
 * Compartilhado). Uma nunca vira a outra: quem quer cruzar as duas usa o
 * filtro de centro de custo e agrupa por categoria (ou o contrário).
 *
 * O total de um grupo é sempre a soma exata das suas próprias linhas, então a
 * soma dos grupos é igual à soma das entries em QUALQUER modo — nunca há dupla
 * contagem.
 */
import { COST_CENTER_LABELS } from "./financeModel";
import {
  CategoryEntryLike,
  CategoryGroup,
  buildCategoryGroups,
  categoryKeyOf,
} from "./financeCategories";

export type CompositionGroupBy = "category" | "cost_center";

export const COMPOSITION_GROUP_BY_LABELS: Record<CompositionGroupBy, string> = {
  category: "Categoria",
  cost_center: "Centro de custo",
};

export function normalizeGroupBy(raw: string | null | undefined): CompositionGroupBy {
  return raw === "cost_center" ? "cost_center" : "category";
}

/** Centro de custo desconhecido nunca some: cai num rótulo honesto. */
const UNKNOWN_COST_CENTER_LABEL = "Centro de custo não definido";

export function costCenterKeyOf(entry: CategoryEntryLike): string {
  const raw = (entry.row.item.cost_center ?? "").trim();
  return raw.length > 0 ? raw : "__none__";
}

export function costCenterLabelOf(key: string): string {
  const label = (COST_CENTER_LABELS as Record<string, string>)[key];
  return label ?? (key === "__none__" ? UNKNOWN_COST_CENTER_LABEL : key);
}

/** Ordem estável dos centros de custo conhecidos; desconhecidos ao final. */
const COST_CENTER_ORDER = Object.keys(COST_CENTER_LABELS);

function buildCostCenterGroups<E extends CategoryEntryLike>(entries: E[]): CategoryGroup<E>[] {
  const buckets = new Map<string, E[]>();
  for (const entry of entries) {
    const key = costCenterKeyOf(entry);
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  const groups: CategoryGroup<E>[] = [];
  for (const [key, list] of buckets) {
    groups.push({
      key,
      label: costCenterLabelOf(key),
      entries: list,
      total: Number(list.reduce((sum, e) => sum + e.value, 0).toFixed(2)),
      count: list.length,
    });
  }

  return groups.sort((a, b) => {
    const ia = COST_CENTER_ORDER.indexOf(a.key);
    const ib = COST_CENTER_ORDER.indexOf(b.key);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

export function buildCompositionGroups<E extends CategoryEntryLike>(
  entries: E[],
  groupBy: CompositionGroupBy,
): CategoryGroup<E>[] {
  return groupBy === "cost_center" ? buildCostCenterGroups(entries) : buildCategoryGroups(entries);
}

/** Chave de grupo de uma entry no modo pedido — usada em testes e filtros. */
export function groupKeyOf(entry: CategoryEntryLike, groupBy: CompositionGroupBy): string {
  return groupBy === "cost_center" ? costCenterKeyOf(entry) : categoryKeyOf(entry.row.item);
}
