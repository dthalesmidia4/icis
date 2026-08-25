/**
 * Data REAL do pagamento (fato), separada do vencimento (`due_date`).
 *
 * O banco guarda `paid_at` como timestamptz. Converter `YYYY-MM-DD` para
 * `T00:00:00Z` deslocaria o dia civil em São Paulo (UTC-3), então fixamos
 * meio-dia com offset explícito: o dia nunca "escorrega" para o anterior/seguinte.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida um dia civil real: além do formato, o dia precisa existir no calendário
 * (rejeita `2026-02-31`). A checagem usa `Date.UTC` só para aritmética de
 * calendário — não há conversão de fuso, então o dia nunca escorrega.
 */
export function isValidPaymentDate(dateISO: string | null | undefined): boolean {
  if (!dateISO || !DATE_RE.test(dateISO)) return false;
  const [year, month, day] = dateISO.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
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
