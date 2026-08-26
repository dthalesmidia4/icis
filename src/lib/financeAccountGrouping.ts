/**
 * HIERARQUIA DE `Contas e despesas`: CENTRO DE CUSTO → CATEGORIA → LINHA.
 *
 * Mesma hierarquia usada em `Composição do mês` (`financeGrouping`), aplicada
 * DENTRO dos recortes por status/vencimento da tela operacional. Não existe
 * fonte de dados paralela: as linhas são exatamente os `MonthRow` já filtrados.
 *
 * O total de cada nível é a soma das próprias linhas, então a soma dos grupos
 * é sempre igual à soma das linhas visíveis — nunca há dupla contagem.
 */
import { MonthRow } from "./financeModel";
import { categoryLabelOf } from "./financeCategories";
import { costCenterKeyOf, costCenterLabelOf } from "./financeGrouping";

export interface AccountCategoryGroup {
  key: string;
  label: string;
  rows: MonthRow[];
  total: number;
}

export interface AccountCostCenterGroup {
  key: string;
  label: string;
  categories: AccountCategoryGroup[];
  rows: MonthRow[];
  total: number;
}

const rowValue = (row: MonthRow): number => row.amountBrl ?? 0;

const sum = (rows: MonthRow[]): number =>
  Number(rows.reduce((acc, r) => acc + rowValue(r), 0).toFixed(2));

function categoryKeyOfRow(row: MonthRow): string {
  const raw = (row.item.category ?? "").trim();
  return raw.length > 0 ? raw : "__none__";
}

export function buildAccountGroups(rows: MonthRow[]): AccountCostCenterGroup[] {
  const centers = new Map<string, MonthRow[]>();
  for (const row of rows) {
    const key = costCenterKeyOf({ row, value: rowValue(row) });
    const list = centers.get(key);
    if (list) list.push(row);
    else centers.set(key, [row]);
  }

  const groups: AccountCostCenterGroup[] = [];
  for (const [key, list] of centers) {
    const byCategory = new Map<string, MonthRow[]>();
    for (const row of list) {
      const catKey = categoryKeyOfRow(row);
      const bucket = byCategory.get(catKey);
      if (bucket) bucket.push(row);
      else byCategory.set(catKey, [row]);
    }

    const categories: AccountCategoryGroup[] = [...byCategory].map(([catKey, catRows]) => ({
      key: catKey,
      label: categoryLabelOf(catKey),
      rows: catRows,
      total: sum(catRows),
    }));
    categories.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    groups.push({
      key,
      label: costCenterLabelOf(key),
      categories,
      rows: list,
      total: sum(list),
    });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/** Linhas achatadas na ordem da hierarquia — usada pela lista e por testes. */
export function flattenAccountGroups(groups: AccountCostCenterGroup[]): MonthRow[] {
  return groups.flatMap((g) => g.categories.flatMap((c) => c.rows));
}
