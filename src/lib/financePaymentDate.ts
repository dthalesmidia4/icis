/**
 * Data REAL do pagamento (fato), separada do vencimento (`due_date`).
 *
 * O banco guarda `paid_at` como timestamptz. Converter `YYYY-MM-DD` para
 * `T00:00:00Z` deslocaria o dia civil em São Paulo (UTC-3), então fixamos
 * meio-dia com offset explícito: o dia nunca "escorrega" para o anterior/seguinte.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidPaymentDate(dateISO: string | null | undefined): boolean {
  return !!dateISO && DATE_RE.test(dateISO);
}

/** `2026-08-20` -> `2026-08-20T12:00:00-03:00` (dia civil estável em SP). */
export function paymentDateToTimestamp(dateISO: string): string {
  if (!isValidPaymentDate(dateISO)) {
    throw new Error(`Data de pagamento inválida: ${dateISO}`);
  }
  return `${dateISO}T12:00:00-03:00`;
}

/** Dia civil (SP) de um `paid_at` persistido — para exibir "Pago em". */
export function paymentTimestampToDate(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}
