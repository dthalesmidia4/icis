/**
 * CORREÇÃO DE VALOR EM LANÇAMENTO JÁ FECHADO.
 *
 * Um COMPONENTE de cartão liquidado pela fatura paga continua sendo um fato
 * histórico: data da cobrança, vínculo da fatura, pagamento e anexos são
 * imutáveis. Mas o VALOR daquele mês pode estar errado (o banco cobrou outro
 * valor) e precisa ser corrigível sem desfazer nada.
 *
 * Fatura (`kind=card`) paga e obrigação direta paga permanecem imutáveis —
 * a exceção é estritamente monetária e só para componentes de cartão.
 */
import type { FinanceOccurrence } from "./financeModel";

export type ClosedFactMode =
  /** Fato aberto: fluxo normal de edição. */
  | "editable"
  /** Componente de cartão liquidado: só os campos monetários deste mês. */
  | "card_component_correction"
  /** Fato fechado sem exceção: somente leitura. */
  | "locked";

export function closedFactMode(input: {
  /** `isCardCharge(row)` — componente de compra no cartão. */
  cardRow: boolean;
  /** `isStatementRow(row)` — a própria fatura. */
  statementRow: boolean;
  /** `effectivePaid(row, ...)` — fato liquidado/fechado. */
  closed: boolean;
}): ClosedFactMode {
  if (!input.closed) return "editable";
  if (input.cardRow && !input.statementRow) return "card_component_correction";
  return "locked";
}

export const CLOSED_CORRECTION_NOTE =
  "Fatura já liquidada. Você pode corrigir apenas o valor deste lançamento. Data e pagamento permanecem preservados.";

export const CLOSED_CORRECTION_SAVE_LABEL = "Salvar correção deste mês";
export const CLOSED_CORRECTION_SUCCESS = "Valor deste mês corrigido";
export const EDIT_ITEM_FUTURE_LABEL = "Editar cadastro / próximos meses";

/**
 * Patch MÍNIMO e explícito de uma correção fechada: nada de datas, snapshots,
 * pagamento ou vínculo de fatura pode entrar aqui.
 */
export function buildClosedCorrectionPatch(input: {
  currency: "BRL" | "USD";
  amountOriginal: number | null;
  amountBrl: number | null;
  exchangeRate: number | null;
}): Partial<FinanceOccurrence> {
  return {
    currency: input.currency,
    amount_original: input.amountOriginal,
    exchange_rate: input.currency === "USD" ? input.exchangeRate : null,
    amount_brl: input.amountBrl,
    is_estimated: false,
  };
}
