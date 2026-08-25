/**
 * LIQUIDAÇÃO POR FATURA — fonte canônica única.
 *
 * Regra de negócio: se um lançamento está no cartão e compõe a fatura, ao pagar
 * a FATURA ele passa a constar como pago. Não se marca item a item.
 *
 * A associação é DERIVADA de `buildStatementGroups(...)`:
 *  - com ciclo (fechamento/vencimento) configurado, os componentes vêm do ciclo real;
 *  - com ciclo incompleto, vêm da composição mensal do próprio modelo.
 *
 * Nada aqui persiste: `paid_at` dos filhos e `statement_occurrence_id` NUNCA são
 * gravados por inferência. O índice é recalculado por competência/tela.
 */

import {
  MonthRow,
  StatementGroup,
  effectivePaid,
  isStatementRow,
} from "./financeModel";

export interface FinanceSettlementContext {
  /** `MonthRow.key` dos componentes liquidados por uma fatura paga. */
  paidComponentKeys: Set<string>;
  /** Fatura (grupo) que liquidou cada componente, para rótulo/auditoria. */
  statementByComponentKey: Map<string, StatementGroup>;
}

export const EMPTY_SETTLEMENT: FinanceSettlementContext = {
  paidComponentKeys: new Set<string>(),
  statementByComponentKey: new Map<string, StatementGroup>(),
};

/** Índice de liquidação derivado dos grupos de fatura da competência. */
export function buildStatementSettlementIndex(
  statements: StatementGroup[],
): FinanceSettlementContext {
  const paidComponentKeys = new Set<string>();
  const statementByComponentKey = new Map<string, StatementGroup>();

  for (const group of statements) {
    if (!group.paid) continue;
    for (const component of group.components) {
      if (isStatementRow(component)) continue;
      paidComponentKeys.add(component.key);
      statementByComponentKey.set(component.key, group);
    }
  }

  return { paidComponentKeys, statementByComponentKey };
}

/**
 * Booleano canônico de pago, usado por totais, composição, filtros e badges.
 * `row.paid` || vínculo explícito com fatura paga || liquidado pela fatura.
 */
export function isEffectivelyPaid(
  row: MonthRow,
  rows: MonthRow[],
  settlement?: FinanceSettlementContext | null,
): boolean {
  return effectivePaid(row, rows, settlement ?? null);
}

/** A linha foi liquidada pela fatura (e não por pagamento próprio)? */
export function settledByStatement(
  row: MonthRow,
  settlement?: FinanceSettlementContext | null,
): boolean {
  if (row.paid) return false;
  return !!settlement?.paidComponentKeys.has(row.key);
}
