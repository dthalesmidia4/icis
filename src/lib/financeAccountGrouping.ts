/**
 * HIERARQUIA DE `Contas e despesas`: GRUPO → (ITEM LÓGICO) → LINHA.
 *
 * O grupo do primeiro nível é escolhido na tela: `Categoria` (natureza da
 * despesa) ou `Centro de custo` (área responsável) — as mesmas dimensões
 * ortogonais da `Composição do mês` (`financeGrouping`), aplicadas DENTRO dos
 * recortes por status/vencimento da tela operacional. Não existe fonte de dados
 * paralela: as linhas são exatamente os `MonthRow` já filtrados.
 *
 * O segundo nível só existe quando o MESMO cadastro tem vários fatos no mês
 * (faxina semanal, recargas): aí ele vira um subgrupo lógico com subtotal. Com
 * um único fato não há nível visual extra.
 *
 * O total de cada nível é a soma das próprias linhas, então a soma dos grupos é
 * sempre igual à soma das linhas visíveis — nunca há dupla contagem.
 */
import { MonthRow } from "./financeModel";
import { categoryLabelOf } from "./financeCategories";
import {
  CompositionGroupBy,
  costCenterKeyOf,
  costCenterLabelOf,
} from "./financeGrouping";

/** Subgrupo por cadastro. `multiple = false` → renderiza a linha direto. */
export interface AccountItemGroup {
  key: string;
  label: string;
  rows: MonthRow[];
  total: number;
  multiple: boolean;
}

export interface AccountGroup {
  key: string;
  label: string;
  items: AccountItemGroup[];
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

function groupKeyOfRow(row: MonthRow, groupBy: CompositionGroupBy): string {
  return groupBy === "cost_center"
    ? costCenterKeyOf({ row, value: rowValue(row) })
    : categoryKeyOfRow(row);
}

function groupLabelOf(key: string, groupBy: CompositionGroupBy): string {
  return groupBy === "cost_center" ? costCenterLabelOf(key) : categoryLabelOf(key);
}

export function buildAccountGroups(
  rows: MonthRow[],
  groupBy: CompositionGroupBy = "category",
): AccountGroup[] {
  const buckets = new Map<string, MonthRow[]>();
  for (const row of rows) {
    const key = groupKeyOfRow(row, groupBy);
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  const groups: AccountGroup[] = [];
  for (const [key, list] of buckets) {
    const byItem = new Map<string, MonthRow[]>();
    for (const row of list) {
      const bucket = byItem.get(row.item.id);
      if (bucket) bucket.push(row);
      else byItem.set(row.item.id, [row]);
    }

    const items: AccountItemGroup[] = [...byItem].map(([itemId, itemRows]) => ({
      key: itemId,
      label: itemRows[0].item.name,
      rows: itemRows,
      total: sum(itemRows),
      multiple: itemRows.length > 1,
    }));
    items.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    groups.push({
      key,
      label: groupLabelOf(key, groupBy),
      items,
      rows: list,
      total: sum(list),
    });
  }

  return groups.sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

/** Linhas achatadas na ordem da hierarquia — usada pela lista e por testes. */
export function flattenAccountGroups(groups: AccountGroup[]): MonthRow[] {
  return groups.flatMap((g) => g.items.flatMap((i) => i.rows));
}
