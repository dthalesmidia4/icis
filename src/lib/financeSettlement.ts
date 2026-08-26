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
  Competence,
  chargeBelongsToStatement,
  chargeDateCompetence,
  chargeDayFrom,
} from "./financeCardCycle";
import {
  FinanceItem,
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

/**
 * Une índices de liquidação de origens diferentes (fatura de cartão e LOTE de
 * pagamento). Ambos respondem à mesma pergunta — "esta linha já foi quitada por
 * uma saída de caixa?" — e nenhum grava pagamento item a item.
 */
export function mergeSettlementIndexes(
  ...indexes: (Partial<FinanceSettlementContext> | null | undefined)[]
): FinanceSettlementContext {
  const paidComponentKeys = new Set<string>();
  const statementByComponentKey = new Map<string, StatementGroup>();
  for (const index of indexes) {
    if (!index) continue;
    index.paidComponentKeys?.forEach((key) => paidComponentKeys.add(key));
    index.statementByComponentKey?.forEach((group, key) =>
      statementByComponentKey.set(key, group),
    );
  }
  return { paidComponentKeys, statementByComponentKey };
}

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

/**
 * Liquidação no escopo `tools`: não há acesso à fatura completa, então a
 * pertença usa o status SEGURO da fatura real da competência. Mesma regra de
 * negócio, sem expor valores.
 *
 * CICLO-AWARE: quando o cartão tem fechamento e vencimento cadastrados, só é
 * liquidada a cobrança que REALMENTE pertence à fatura daquela competência. Uma
 * compra feita depois do fechamento cai na fatura seguinte e NUNCA pode ser
 * quitada pela fatura paga do mês exibido.
 *
 * Sem ciclo completo (ou sem dia de cobrança) não existe informação melhor que
 * a composição mensal do modelo: aí o fallback mensal é mantido — exceto quando
 * o ciclo é completo e falta o dia da cobrança, caso em que a pertença não pode
 * ser provada e a linha permanece honesta (não paga).
 */
export function buildSafeSettlementIndex(params: {
  rows: MonthRow[];
  isPaidCard: (cardId: string) => boolean;
  /** Competência exibida na tela — base do ciclo. */
  competence?: Competence | null;
  /** Cartões (rótulo + ciclo) por id. Sem eles não há como aplicar o ciclo. */
  cardsById?: Map<string, FinanceItem> | null;
}): FinanceSettlementContext {
  const paidComponentKeys = new Set<string>();
  for (const row of params.rows) {
    if (isStatementRow(row)) continue;
    const cardId = row.cardItemId;
    if (!cardId) continue;
    if (!params.isPaidCard(cardId)) continue;

    const card = params.cardsById?.get(cardId) ?? null;
    const cycleComplete =
      !!card && card.statement_closing_day != null && card.statement_due_day != null;

    if (cycleComplete && params.competence) {
      const chargeDay = chargeDayFrom(row.chargeDate, row.item.charge_day);
      // Sem dia de cobrança não há prova de pertença: não marcamos como paga.
      if (chargeDay == null) continue;
      const belongs = chargeBelongsToStatement({
        chargeDay,
        // A competência da cobrança é a da PRÓPRIA charge_date (pode ser o mês
        // anterior à competência contábil exibida).
        chargeCompetence: chargeDateCompetence(row.chargeDate, params.competence),
        statement: params.competence,
        card: { closingDay: card!.statement_closing_day, dueDay: card!.statement_due_day },
      });
      if (!belongs) continue;
    }

    paidComponentKeys.add(row.key);
  }
  return { paidComponentKeys, statementByComponentKey: new Map() };
}

