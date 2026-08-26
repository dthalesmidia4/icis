/**
 * LÓGICA PURA DO MODAL DE LANÇAMENTO MENSAL (`FinanceOccurrenceModal`).
 *
 * Separa a decisão (status, data do pagamento, validação) da renderização, para
 * que o fato salvo e o que a tela afirma nunca divirjam.
 *
 * Semântica preservada:
 *  - `due_date` = vencimento (obrigação direta);
 *  - `charge_date` = data real da cobrança no cartão;
 *  - `paid_at` = data REAL do pagamento — nunca derivada de vencimento/cobrança.
 */
import { KIND_LABELS, MonthRow } from "./financeModel";
import { isInstallmentRow } from "./financeInstallmentPresentation";
import { formatDayMonth } from "./financePaidLabel";
import { isValidPaymentDate, paymentTimestampToDate } from "./financePaymentDate";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** `2026-08-01` -> `Agosto 2026`. */
export function competenceLongLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  const label = MONTH_LABELS[m - 1];
  if (!label || !y) return null;
  return `${label} ${y}`;
}

/**
 * Linha contextual curta do header: `Ferramenta · Agosto 2026`
 * (+ `Parcela 3 de 12` quando parcelado).
 */
export function occurrenceContextLine(
  row: MonthRow,
  competenceMonth?: string | null,
): string {
  const parts: string[] = [KIND_LABELS[row.item.kind]];
  const competence = competenceLongLabel(row.occurrence?.competence_month ?? competenceMonth ?? null);
  if (competence) parts.push(competence);
  if (isInstallmentRow(row) && row.installmentNumber && row.installmentCount) {
    parts.push(`Parcela ${row.installmentNumber} de ${row.installmentCount}`);
  }
  return parts.join(" · ");
}

/** Dia civil (SP) de um `paid_at` persistido, ou `null`. */
export function persistedPaymentDate(row: MonthRow | null): string | null {
  const paidAt = row?.occurrence?.paid_at;
  if (!paidAt) return null;
  if (paidAt.length <= 10 && isValidPaymentDate(paidAt)) return paidAt;
  return paymentTimestampToDate(paidAt);
}

/**
 * Valor inicial do campo `Data do pagamento`:
 *  - já pago: o dia civil do fato (preserva o histórico);
 *  - em aberto: hoje (editável para registrar pagamento retroativo).
 */
export function initialPaymentDate(row: MonthRow | null, today: string): string {
  return persistedPaymentDate(row) ?? today;
}

export type PaymentMessageTone = "neutral" | "success" | "warning";

export interface PaymentStatusMessage {
  /** Leitura curta do estado (badge/linha do header). */
  label: string;
  tone: PaymentMessageTone;
  /** Consequência do estado LOCAL ainda não salvo, quando houver. */
  pendingNote: string | null;
}

export interface PaymentStatusInput {
  /** Compra no cartão: status vem da fatura, sem switch próprio. */
  cardRow: boolean;
  /** Rótulo canônico da fatura (`Pago pela fatura em 20 ago`, etc.). */
  cardStatusLabel?: string | null;
  /** `paid_at` persistido (dia civil) — `null` quando em aberto. */
  persistedPaymentDate: string | null;
  /** Estado local do switch. */
  paid: boolean;
  /** Data escolhida no formulário (`YYYY-MM-DD`). */
  paymentDate: string;
}

/**
 * Mensagem de situação do pagamento, sempre coerente com o ESTADO LOCAL:
 * o usuário lê a consequência do save antes de salvar.
 */
export function paymentStatusMessage(input: PaymentStatusInput): PaymentStatusMessage {
  if (input.cardRow) {
    return {
      label: input.cardStatusLabel?.trim() || "Na fatura do cartão",
      tone: input.cardStatusLabel?.startsWith("Pago") ? "success" : "neutral",
      pendingNote: null,
    };
  }

  const persisted = input.persistedPaymentDate;

  if (persisted && input.paid) {
    return { label: `Pago em ${formatDayMonth(persisted)}`, tone: "success", pendingNote: null };
  }
  if (persisted && !input.paid) {
    return {
      label: `Pago em ${formatDayMonth(persisted)}`,
      tone: "warning",
      pendingNote: "Será marcado como em aberto ao salvar",
    };
  }
  if (!persisted && input.paid) {
    return {
      label: "Em aberto",
      tone: "warning",
      pendingNote: isValidPaymentDate(input.paymentDate)
        ? `Será marcado como pago em ${formatDayMonth(input.paymentDate)}`
        : "Informe a data do pagamento para salvar como pago",
    };
  }
  return { label: "Em aberto", tone: "neutral", pendingNote: null };
}

/**
 * Obrigação direta marcada como paga EXIGE data válida. Compra no cartão nunca
 * tem pagamento próprio, então não há o que validar aqui.
 */
export function paymentDateRequired(cardRow: boolean, paid: boolean): boolean {
  return !cardRow && paid;
}

export function canSubmitOccurrence(input: {
  cardRow: boolean;
  paid: boolean;
  paymentDate: string;
}): boolean {
  if (!paymentDateRequired(input.cardRow, input.paid)) return true;
  return isValidPaymentDate(input.paymentDate);
}
