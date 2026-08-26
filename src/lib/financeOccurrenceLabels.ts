/**
 * NOMES DINÂMICOS DOS LANÇAMENTOS (lógica pura de apresentação).
 *
 * Um mesmo cadastro pode ter VÁRIOS fatos no mês (faxina semanal, recargas de
 * crédito). O nome do cadastro isolado deixa de explicar a linha, então a
 * apresentação passa por AQUI — ponto único, para tela, fatura e composição
 * nunca divergirem.
 *
 * Regras canônicas:
 *  - um único lançamento do cadastro no mês  → nome do cadastro, sem sufixo;
 *  - vários lançamentos do MESMO cronograma  → `FAXINA 1/4` ... `FAXINA 4/4`;
 *  - cadastro com suplementares no mês       → regular vira `Lovable · Renovação`
 *    e cada suplementar vira `Lovable · Recarga 1/2` (ou `· Extra`);
 *  - com um único suplementar não há numeração: `Lovable · Recarga`.
 *
 * A numeração é de APRESENTAÇÃO: nunca é persistida e sempre recalculada a
 * partir das linhas visíveis do mês (ignorados já saíram antes).
 */
import type { FinanceEntryRole, MonthRow } from "./financeModel";

export interface OccurrenceLabel {
  /** Nome do cadastro, sem enfeite. */
  itemName: string;
  /** Complemento que identifica o fato dentro do mês (`Recarga 1/2`, `2/4`). */
  suffix: string | null;
  /** Rótulo completo pronto para a linha. */
  label: string;
  role: FinanceEntryRole;
}

const ROLE_WORD: Record<Exclude<FinanceEntryRole, "regular">, string> = {
  recharge: "Recarga",
  extra: "Extra",
};

/** Data do fato usada para ordenar as linhas do mesmo cadastro. */
function factDate(row: MonthRow): string {
  return row.scheduledDate ?? row.dueDate ?? row.chargeDate ?? "9999-99-99";
}

function sortRows(rows: MonthRow[]): MonthRow[] {
  return [...rows].sort((a, b) => {
    const da = factDate(a);
    const db = factDate(b);
    if (da !== db) return da.localeCompare(db);
    return a.key.localeCompare(b.key);
  });
}

/**
 * Rótulos de todas as linhas informadas, indexados por `row.key`.
 * Determinístico: mesma entrada, mesma saída.
 */
export function buildOccurrenceLabels(rows: MonthRow[]): Map<string, OccurrenceLabel> {
  const byItem = new Map<string, MonthRow[]>();
  for (const row of rows) {
    const list = byItem.get(row.item.id) ?? [];
    list.push(row);
    byItem.set(row.item.id, list);
  }

  const out = new Map<string, OccurrenceLabel>();
  for (const [, group] of byItem) {
    const itemName = group[0].item.name;
    const regulars = sortRows(group.filter((r) => !r.supplemental));
    const supplementalRoles: Exclude<FinanceEntryRole, "regular">[] = ["recharge", "extra"];
    const hasSupplemental = group.some((r) => r.supplemental);

    // ---- lançamentos do cronograma
    regulars.forEach((row, index) => {
      let suffix: string | null = null;
      if (hasSupplemental) suffix = "Renovação";
      else if (regulars.length > 1) suffix = `${index + 1}/${regulars.length}`;
      out.set(row.key, {
        itemName,
        suffix,
        label: suffix
          ? hasSupplemental
            ? `${itemName} · ${suffix}`
            : `${itemName} ${suffix}`
          : itemName,
        role: "regular",
      });
    });

    // ---- fatos suplementares, numerados por natureza
    for (const role of supplementalRoles) {
      const ofRole = sortRows(group.filter((r) => r.entryRole === role));
      ofRole.forEach((row, index) => {
        const word = ROLE_WORD[role];
        const suffix = ofRole.length > 1 ? `${word} ${index + 1}/${ofRole.length}` : word;
        out.set(row.key, { itemName, suffix, label: `${itemName} · ${suffix}`, role });
      });
    }
  }
  return out;
}

/** Rótulo de uma linha (cai no nome do cadastro quando não há mapa). */
export function occurrenceDisplayName(
  row: MonthRow,
  labels?: Map<string, OccurrenceLabel> | null,
): string {
  return labels?.get(row.key)?.label ?? row.item.name;
}

/** Complemento curto da linha (usado dentro de um grupo já rotulado). */
export function occurrenceDisplaySuffix(
  row: MonthRow,
  labels?: Map<string, OccurrenceLabel> | null,
): string {
  const found = labels?.get(row.key);
  return found?.suffix ?? found?.itemName ?? row.item.name;
}

/* -------------------------------------------------------------------------- */
/*                     FATURA: AGRUPAR POR ITEM LÓGICO                        */
/* -------------------------------------------------------------------------- */

export interface StatementItemGroup {
  itemId: string;
  itemName: string;
  rows: MonthRow[];
  /** Soma dos valores conhecidos das cobranças do item nesta fatura. */
  totalBrl: number;
  /** `true` quando o item tem mais de uma cobrança na mesma fatura. */
  multiple: boolean;
}

/**
 * Agrupa os componentes de uma fatura pelo ITEM LÓGICO, preservando a ordem de
 * cobrança. O total da fatura não muda: cada cobrança continua contada uma vez.
 */
export function groupStatementComponents(components: MonthRow[]): StatementItemGroup[] {
  const groups = new Map<string, StatementItemGroup>();
  for (const row of components) {
    const existing = groups.get(row.item.id);
    if (existing) {
      existing.rows.push(row);
      existing.totalBrl = Number((existing.totalBrl + (row.amountBrl ?? 0)).toFixed(2));
      existing.multiple = existing.rows.length > 1;
      continue;
    }
    groups.set(row.item.id, {
      itemId: row.item.id,
      itemName: row.item.name,
      rows: [row],
      totalBrl: Number((row.amountBrl ?? 0).toFixed(2)),
      multiple: false,
    });
  }
  return [...groups.values()].map((group) => ({ ...group, rows: sortRows(group.rows) }));
}
