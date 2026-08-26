/**
 * SEMÂNTICA DAS DATAS DE CARTÃO — vocabulário único da UI.
 *
 * Distinção que NUNCA pode ficar ambígua:
 * - a data de um ITEM é o dia em que AQUELE LANÇAMENTO é cobrado no cartão;
 * - fechamento e vencimento pertencem à FATURA, não ao lançamento.
 *
 * Todo rótulo de data/dia de cobrança em contexto de cartão sai daqui, para que
 * lista, badge, formulário de cadastro e modal mensal falem a mesma língua.
 */
import { formatDayMonth } from "./financePaidLabel";

/* ------------------------------ FATURA (cartão) ---------------------------- */

export const CARD_CLOSING_FACT_LABEL = "Fechamento da fatura";
export const CARD_DUE_FACT_LABEL = "Vencimento da fatura";

/** `Fechamento da fatura: dia 14` — nunca compete com a data do lançamento. */
export function cardClosingDayLabel(day: number | null | undefined): string {
  return day == null
    ? "Fechamento da fatura não informado"
    : `${CARD_CLOSING_FACT_LABEL}: dia ${day}`;
}

export function cardDueDayLabel(day: number | null | undefined): string {
  return day == null
    ? "Vencimento da fatura não informado"
    : `${CARD_DUE_FACT_LABEL}: dia ${day}`;
}

/* ---------------------------- LANÇAMENTO (item) ---------------------------- */

export const CARD_CHARGE_DATE_MISSING = "Data de cobrança não informada";

/**
 * Rótulo da data de cobrança de UM lançamento no cartão.
 * - fato real: `Cobrado no cartão em 05 ago`;
 * - projeção:  `Cobrança prevista no cartão em 05 ago`.
 */
export function cardChargeDateLabel(params: {
  chargeDate?: string | null;
  projected: boolean;
}): string {
  if (!params.chargeDate) return CARD_CHARGE_DATE_MISSING;
  const day = formatDayMonth(params.chargeDate);
  return params.projected
    ? `Cobrança prevista no cartão em ${day}`
    : `Cobrado no cartão em ${day}`;
}

/* ------------------------------- FORMULÁRIOS ------------------------------- */

/** Cadastro permanente (`finance_items.charge_day`) quando o pagamento é cartão. */
export const CARD_CHARGE_DAY_FIELD_LABEL = "Dia em que este item é cobrado no cartão";
export const CARD_CHARGE_DAY_HELP =
  "É o dia da cobrança deste serviço/assinatura. Não é o fechamento da fatura.";

/** Cadastro permanente fora do cartão: o dia é só referência da cobrança. */
export const DIRECT_CHARGE_DAY_FIELD_LABEL = "Dia da cobrança";

/** Fato do mês (`finance_occurrences.charge_date`). */
export const CARD_CHARGE_DATE_FACT_LABEL = "Data em que este item foi cobrado no cartão";
export const CARD_CHARGE_DATE_PROJECTED_LABEL = "Data prevista de cobrança no cartão";
export const CARD_CHARGE_DATE_HELP =
  "Fechamento e vencimento pertencem à fatura do cartão, não a este lançamento.";

export function cardChargeDateFieldLabel(projected: boolean): string {
  return projected ? CARD_CHARGE_DATE_PROJECTED_LABEL : CARD_CHARGE_DATE_FACT_LABEL;
}
