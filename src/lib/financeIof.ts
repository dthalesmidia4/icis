/**
 * REPASSE DE IOF DA FATURA DO CARTÃO (lógica pura).
 *
 * O IOF é cobrado PELO BANCO junto com a fatura — não é uma assinatura, nem uma
 * despesa cadastrada, nem um gasto órfão. Por isso ele mora no PRÓPRIO acerto da
 * fatura (`finance_occurrences.iof_amount_brl`, cifrado como os demais valores)
 * e nunca gera cadastro permanente.
 *
 * Consequências que este módulo garante:
 *  - a conferência da fatura mostra IOF SEPARADO: ele deixa de ser "diferença
 *    inexplicada";
 *  - em `Contas e despesas` o IOF de cada fatura paga aparece como uma linha
 *    própria (`Repasse de IOF — {cartão}`), somando nos totais, sem trazer a
 *    ocorrência da fatura inteira (que duplicaria os componentes).
 */
import {
  FinanceItem,
  MonthRow,
  StatementGroup,
  cardDisplayLabel,
} from "./financeModel";
import { parseLocalizedNumber } from "./financeNumber";

export const IOF_ROW_PREFIX = "iof:";
export const IOF_CATEGORY = "Tributos e taxas";

/* ------------------------------ Entrada do IOF ----------------------------- */

export type IofInput =
  | { state: "ok"; value: number }
  | { state: "invalid"; reason: "not_a_number" | "negative" };

/** Campo vazio significa ZERO — IOF é sempre perguntado, com padrão 0. */
export function parseIofInput(raw: string | null | undefined): IofInput {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { state: "ok", value: 0 };
  const parsed = parseLocalizedNumber(trimmed);
  if (parsed == null || !Number.isFinite(parsed)) return { state: "invalid", reason: "not_a_number" };
  if (parsed < 0) return { state: "invalid", reason: "negative" };
  return { state: "ok", value: Number(parsed.toFixed(2)) };
}

export function iofInputMessage(result: IofInput): string | null {
  if (result.state === "ok") return null;
  return result.reason === "negative"
    ? "O repasse de IOF não pode ser negativo"
    : "Informe um valor válido de IOF (use 0 quando não houver)";
}

/* ---------------------------- Conferência da fatura ------------------------ */

export interface StatementConference {
  /** Soma real das compras (com os valores corrigidos em reais). */
  componentsBrl: number;
  /** Total da fatura sem IOF (valor real informado ou projeção). */
  statementBrl: number;
  iofBrl: number;
  /** O que a fatura deveria cobrar: total + IOF. */
  expectedBrl: number;
  /** O que foi efetivamente cobrado/pago. */
  paidBrl: number | null;
  /** Sobra depois de explicar IOF — só isso é diferença remanescente. */
  remainingBrl: number;
}

export function buildStatementConference(input: {
  statementBrl: number | null;
  componentsBrl: number | null;
  iofBrl: number;
  paidBrl: number | null;
}): StatementConference {
  const statementBrl = Number((input.statementBrl ?? 0).toFixed(2));
  const componentsBrl = Number((input.componentsBrl ?? 0).toFixed(2));
  const iofBrl = Number((input.iofBrl ?? 0).toFixed(2));
  const expectedBrl = Number((statementBrl + iofBrl).toFixed(2));
  const paidBrl = input.paidBrl != null ? Number(input.paidBrl.toFixed(2)) : null;
  return {
    componentsBrl,
    statementBrl,
    iofBrl,
    expectedBrl,
    paidBrl,
    remainingBrl: Number(((paidBrl ?? expectedBrl) - expectedBrl).toFixed(2)),
  };
}

/* ------------------------- Linha de IOF em Contas ------------------------- */

/** IOF já pago de uma fatura, quando existir. */
export function statementIofBrl(group: StatementGroup): number {
  const value = group.statementRow?.occurrence?.iof_amount_brl ?? null;
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Number(value.toFixed(2));
}

/**
 * Linha sintética (NUNCA persistida) do repasse de IOF de uma fatura paga.
 * Não tem cartão nem forma de cartão: é uma cobrança do banco já liquidada,
 * então nunca é confundida com componente de fatura.
 */
export function iofRowForStatement(group: StatementGroup): MonthRow | null {
  const iof = statementIofBrl(group);
  if (iof <= 0 || !group.paid) return null;
  const occurrence = group.statementRow?.occurrence ?? null;

  const item: FinanceItem = {
    ...group.card,
    id: `${IOF_ROW_PREFIX}${group.card.id}`,
    kind: "expense",
    name: `Repasse de IOF — ${cardDisplayLabel(group.card)}`,
    purpose: "Imposto cobrado pelo banco junto com a fatura do cartão",
    category: IOF_CATEGORY,
    currency: "BRL",
    recurrence_type: "one_off",
    payment_method: null,
    card_item_id: null,
    active: true,
  } as FinanceItem;

  return {
    key: `${IOF_ROW_PREFIX}${group.card.id}:${occurrence?.id ?? "projected"}`,
    item,
    occurrence: occurrence
      ? ({
          ...occurrence,
          id: `${IOF_ROW_PREFIX}${occurrence.id}`,
          currency: "BRL",
          amount_brl: iof,
          amount_original: iof,
          paid_amount_brl: iof,
          exchange_rate: null,
        } as typeof occurrence)
      : null,
    projected: false,
    amountBrl: iof,
    amountOriginal: iof,
    currency: "BRL",
    exchangeRate: null,
    chargeDate: null,
    dueDate: group.dueDate,
    paid: true,
    paidAmountBrl: iof,
    cardItemId: null,
    paymentMethod: null,
    paymentOverridden: false,
    estimated: false,
    installmentNumber: null,
    installmentCount: null,
  };
}

/** Todas as linhas de IOF do mês, na ordem dos cartões. */
export function iofRowsForStatements(groups: StatementGroup[]): MonthRow[] {
  const rows: MonthRow[] = [];
  for (const group of groups) {
    const row = iofRowForStatement(group);
    if (row) rows.push(row);
  }
  return rows;
}

/** `true` quando a linha é um repasse de IOF sintético (não editável). */
export function isIofRow(row: MonthRow): boolean {
  return row.item.id.startsWith(IOF_ROW_PREFIX);
}

export function sumRowsBrl(rows: MonthRow[]): number {
  return Number(rows.reduce((sum, r) => sum + (r.paidAmountBrl ?? r.amountBrl ?? 0), 0).toFixed(2));
}
