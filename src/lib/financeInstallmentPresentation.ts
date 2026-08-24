/**
 * Apresentação de parcelamentos (`recurrence_type = 'installments'`).
 * Só copy/derivação — a regra canônica vive em `financeModel.ts`.
 */
import {
  FinanceItem,
  MonthRow,
  formatDateBR,
  installmentEndDate,
  installmentRowLabel,
} from "./financeModel";

export function isInstallmentItem_(item: FinanceItem): boolean {
  return item.recurrence_type === "installments";
}

/** A linha do mês pertence a um parcelamento? */
export function isInstallmentRow(row: MonthRow): boolean {
  return isInstallmentItem_(row.item);
}

/**
 * `Parcela 6 de 12 · Parcelamento iniciado em 11/03/2026 · término previsto em 11/02/2027`
 * Retorna `null` quando não é parcelamento.
 */
export function installmentHeaderLine(row: MonthRow): string | null {
  if (!isInstallmentRow(row)) return null;
  const parts: string[] = [];
  const label = installmentRowLabel(row);
  if (label) parts.push(label);
  if (row.item.installment_start_date) {
    parts.push(`Parcelamento iniciado em ${formatDateBR(row.item.installment_start_date)}`);
  }
  const end = installmentEndDate(row.item);
  if (end) parts.push(`término previsto em ${formatDateBR(end)}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Aviso de parcela ainda não confirmada (só quando projetada). */
export function installmentProjectedNote(row: MonthRow): string | null {
  if (!isInstallmentRow(row) || !row.projected) return null;
  return "Parcela prevista para este mês — pagamento ainda não confirmado";
}

/** Label do campo de valor no lançamento mensal. */
export function occurrenceAmountLabel(row: MonthRow): string {
  return isInstallmentRow(row)
    ? `Valor desta parcela (${row.currency})`
    : `Valor real (${row.currency})`;
}

/** Texto de ajuda do switch `Pago`. */
export function occurrencePaidHelp(row: MonthRow): string {
  if (row.item.card_item_id) {
    return "Esta despesa também é liquidada ao pagar a fatura do cartão.";
  }
  if (isInstallmentRow(row)) {
    return "Marque quando esta parcela for realmente paga.";
  }
  return "Marque quando a saída de caixa acontecer.";
}

/** `12 parcelas mensais · última prevista em 11/02/2027` (preview do formulário). */
export function installmentSchedulePreview(
  startDate: string | null,
  count: number | null,
): string | null {
  if (!startDate || count == null || count <= 0) return null;
  const end = installmentEndDate({
    recurrence_type: "installments",
    installment_start_date: startDate,
    installment_count: count,
  } as FinanceItem);
  const plural = count === 1 ? "parcela mensal" : "parcelas mensais";
  return end
    ? `${count} ${plural} · última prevista em ${formatDateBR(end)}`
    : `${count} ${plural}`;
}
