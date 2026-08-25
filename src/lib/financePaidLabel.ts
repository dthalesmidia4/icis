/**
 * Rótulos de data curta e de PAGAMENTO REALIZADO.
 *
 * Vive em módulo próprio (sem dependências de domínio) para que apresentação
 * (`financeRowStatus`) e status seguro (`financeSafeStatement`) usem a MESMA
 * formatação sem criar import circular.
 *
 * `charge_date` NUNCA entra aqui: cobrança no cartão não é pagamento.
 */
import { paymentTimestampToDate } from "./financePaymentDate";

const MONTH_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** `2026-08-01` -> `01 ago`. */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  const month = MONTH_SHORT[Number(m) - 1];
  if (!d || !month) return iso;
  return `${d} ${month}`;
}

/**
 * Dia civil de um `paid_at`. Aceita `YYYY-MM-DD` (dia já civil) ou timestamptz
 * (convertido no fuso de São Paulo, sem escorregar o dia).
 */
export function paidAtDayMonth(paidAt: string | null | undefined): string | null {
  if (!paidAt) return null;
  const iso =
    paidAt.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(paidAt)
      ? paidAt
      : paymentTimestampToDate(paidAt);
  if (!iso) return null;
  return formatDayMonth(iso);
}

/** `Pago` + data quando ela existe; sem data, devolve o rótulo base intacto. */
export function paidLabelWithDate(base: string, paidAt: string | null | undefined): string {
  const day = paidAtDayMonth(paidAt);
  return day ? `${base} em ${day}` : base;
}
