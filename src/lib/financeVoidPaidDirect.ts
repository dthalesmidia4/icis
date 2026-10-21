/**
 * ANULAÇÃO AUDITADA de um lançamento direto JÁ PAGO.
 *
 * A autoridade é o servidor: `finance_void_paid_direct_occurrence` exige
 * confirmação literal `ANULAR`, motivo de 10 a 500 caracteres, acesso
 * financeiro completo e um fato direto pago, regular, sem vínculo de fatura e
 * sem cartão. Ele marca `skipped_at` com o motivo, preserva `paid_at`/valores e
 * grava a trilha em `finance_occurrence_corrections`.
 *
 * Este módulo é só o espelho dessas guardas para a UI não oferecer o que o
 * banco recusaria. Nada é apagado localmente: quem recarrega é o hook, depois
 * da RPC.
 */
import type { MonthRow } from "./financeModel";
import { isDirectObligation } from "./financeRowStatus";

/** Palavra que o usuário precisa digitar — o banco compara literalmente. */
export const VOID_CONFIRMATION_TEXT = "ANULAR";
export const VOID_REASON_MIN = 10;
export const VOID_REASON_MAX = 500;

/** Motivo obrigatório: 10 a 500 caracteres depois de aparar espaços. */
export function voidReasonValid(reason: string | null | undefined): boolean {
  const trimmed = (reason ?? "").trim();
  return trimmed.length >= VOID_REASON_MIN && trimmed.length <= VOID_REASON_MAX;
}

/**
 * A digitação é aceita em qualquer caixa, mas o payload enviado ao banco é
 * sempre o literal `ANULAR` que a RPC compara.
 */
export function voidConfirmationValid(confirmation: string | null | undefined): boolean {
  return (confirmation ?? "").trim().toUpperCase() === VOID_CONFIRMATION_TEXT;
}

/**
 * Espelho das guardas do servidor: ocorrência persistida, paga, ainda não
 * anulada/ignorada, de papel regular, sem vínculo de fatura e sem cartão
 * (interno, externo ou método "cartão").
 */
export function canVoidPaidDirectOccurrence(row: MonthRow | null | undefined): boolean {
  if (!row) return false;
  const occ = row.occurrence;
  if (!occ?.id || !occ.paid_at) return false;
  if (occ.skipped_at) return false;
  if ((occ.entry_role ?? row.entryRole ?? "regular") !== "regular") return false;
  if (occ.statement_occurrence_id) return false;
  /**
   * O servidor compara `snapshot > cadastro`: um cartão gravado só neste mês
   * também desqualifica o fato, mesmo que a linha ainda não o tenha resolvido.
   */
  if (occ.card_item_id_snapshot) return false;
  if (/cart/i.test(occ.payment_method_snapshot ?? "")) return false;
  return isDirectObligation(row);
}
