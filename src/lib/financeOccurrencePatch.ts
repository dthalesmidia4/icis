/**
 * PATCH DO FATO DO MÊS (lógica pura do `FinanceOccurrenceModal`).
 *
 * Duas naturezas, duas datas — nunca as duas ao mesmo tempo:
 *  - compra no cartão → o fato é a COBRANÇA (`charge_date`); o vencimento
 *    pertence à fatura, então `due_date` é NULL;
 *  - obrigação direta → o fato é o VENCIMENTO (`due_date`).
 *
 * Compra no cartão também não carrega pagamento próprio: `paid_at` /
 * `paid_amount_brl` NUNCA saem daqui, porque a liquidação é derivada do
 * pagamento da fatura.
 */
import type { FinanceOccurrence, MonthRow } from "./financeModel";

export interface OccurrencePatchInput {
  row: MonthRow;
  /** `isCardCharge(row)` — decidido pelo chamador. */
  cardRow: boolean;
  /** Data do fato digitada (`YYYY-MM-DD`). */
  factDate: string;
  amountOriginal: number | null;
  amountBrl: number | null;
  exchangeRate: number | null;
  paid: boolean;
  observations: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  originPatch: Partial<FinanceOccurrence>;
  /** Injetável para teste determinístico. */
  nowISO?: string;
}

export function buildOccurrencePatch(input: OccurrencePatchInput): Partial<FinanceOccurrence> {
  const { row, cardRow, factDate } = input;

  const datePatch: Partial<FinanceOccurrence> = cardRow
    ? { charge_date: factDate || null, due_date: null }
    : { due_date: factDate || null, charge_date: row.chargeDate };

  const paymentPatch: Partial<FinanceOccurrence> = cardRow
    ? {}
    : {
        paid_at: input.paid
          ? row.occurrence?.paid_at ?? input.nowISO ?? new Date().toISOString()
          : null,
        paid_amount_brl: input.paid ? input.amountBrl : null,
      };

  return {
    currency: row.currency,
    amount_original: input.amountOriginal,
    exchange_rate: row.currency === "USD" ? input.exchangeRate : null,
    amount_brl: input.amountBrl,
    is_estimated: false,
    observations: input.observations.trim() || null,
    attachment_url: input.attachmentUrl,
    attachment_name: input.attachmentName,
    ...datePatch,
    ...paymentPatch,
    ...input.originPatch,
  };
}
