/**
 * `Composição do mês` — camada de AUDITORIA dos KPIs do resumo.
 *
 * Não existe cálculo novo aqui: a base é exatamente o conjunto de `MonthRow`
 * que alimenta `computeTotals` (sem statement/fatura, sem `included_resource`)
 * e a regra de pago é a canônica `effectivePaid`.
 *
 * Por isso a soma de cada recorte reconcilia com `totals.expected/paid/open`.
 */

import {
  FinanceItem,
  FinanceKind,
  MonthRow,
  effectivePaid,
  isStatementRow,
} from "./financeModel";
import { FinanceSettlementContext } from "./financeSettlement";
import {
  RowStatus,
  RowStatusContext,
  isCardCharge,
  paidLabelWithDate,
  resolvePaidAtForRow,
  resolveRowStatus,
} from "./financeRowStatus";


export type CompositionStatus = "all" | "paid" | "open";

export const COMPOSITION_STATUSES: CompositionStatus[] = ["all", "paid", "open"];

export const COMPOSITION_TAB_LABELS: Record<CompositionStatus, string> = {
  all: "Todos",
  paid: "Pagos",
  open: "Em aberto",
};

export const COMPOSITION_HINTS: Record<CompositionStatus, string> = {
  all: "Todas as despesas que formam a previsão do mês.",
  paid: "Despesas já liquidadas, inclusive compras quitadas pela fatura do cartão.",
  open: "Despesas que ainda não foram liquidadas.",
};

/** Query param -> recorte válido. Qualquer coisa inesperada cai em `all`. */
export function normalizeCompositionStatus(value: string | null | undefined): CompositionStatus {
  return COMPOSITION_STATUSES.includes(value as CompositionStatus)
    ? (value as CompositionStatus)
    : "all";
}

/** Tipos que podem participar da composição (statement e recurso incluído não). */
export const COMPOSITION_KINDS: { value: FinanceKind; label: string }[] = [
  { value: "expense", label: "Conta/Despesa" },
  { value: "tool", label: "Ferramenta" },
  { value: "package", label: "Pacote" },
];

export interface CompositionEntry {
  row: MonthRow;
  /** Pago efetivo — mesma regra do total. */
  paid: boolean;
  /** Valor que a linha contribui para o recorte exibido. */
  value: number;
}

/** Despesas que formam os KPIs: tudo menos a fatura. */
export function compositionBaseRows(rows: MonthRow[]): MonthRow[] {
  return rows.filter((row) => !isStatementRow(row));
}

/**
 * Monta o recorte pedido reutilizando a semântica canônica de pago.
 * `paid` usa `paidAmountBrl ?? amountBrl`, igual a `computeTotals`.
 */
export function buildMonthComposition(params: {
  rows: MonthRow[];
  status: CompositionStatus;
  /** Liquidação por fatura — mesma fonte canônica de `computeTotals`. */
  settlement?: FinanceSettlementContext | null;
}): CompositionEntry[] {
  const { rows, status } = params;
  const settlement = params.settlement ?? null;
  const base = compositionBaseRows(rows);
  const entries: CompositionEntry[] = [];

  for (const row of base) {
    const paid = effectivePaid(row, rows, settlement);
    if (status === "paid" && !paid) continue;
    if (status === "open" && paid) continue;
    const amount = row.amountBrl ?? 0;
    const value = status === "paid" ? row.paidAmountBrl ?? amount : amount;
    entries.push({ row, paid, value });
  }

  return entries;
}

export function compositionTotal(entries: CompositionEntry[]): number {
  return Number(entries.reduce((sum, e) => sum + e.value, 0).toFixed(2));
}

/**
 * Situação legível na auditoria.
 *
 * INVARIANTE: `entry.paid` (o recorte em que a linha caiu) é a autoridade.
 * No recorte de pagos, deixa explícito que a quitação veio pela fatura; no
 * recorte `Em aberto`, qualquer semântica de pago vinda do status global é
 * neutralizada — uma linha em aberto nunca exibe badge de pago.
 */
export function compositionStatusLabel(
  row: MonthRow,
  ctx: RowStatusContext,
  entry: { paid: boolean },
): RowStatus {
  const status = resolveRowStatus(row, ctx);
  if (entry.paid) {
    if (isCardCharge(row) && !row.paid) {
      return {
        ...status,
        kind: "paid",
        label: paidLabelWithDate("Pago pela fatura", resolvePaidAtForRow(row, ctx)),
        tone: "positive",
      };
    }
    return status;
  }
  if (status.tone === "positive" || /pag/i.test(status.label)) {
    return { ...status, kind: "open", label: "Em aberto", tone: "neutral" };
  }
  return status;
}




/** Rótulo contextual da data conforme a natureza da despesa. */
export function compositionDateLabel(row: MonthRow): { label: string; date: string | null } {
  if (isCardCharge(row)) {
    return { label: "Cobrança", date: row.chargeDate ?? null };
  }
  return { label: "Vencimento", date: row.dueDate ?? row.chargeDate ?? null };
}

/** Origem de pagamento como chave de filtro: `direct`, `none` ou id do cartão. */
export function compositionOriginKey(row: MonthRow): string {
  if (row.cardItemId) return row.cardItemId;
  if (row.paymentMethod) return "direct";
  return "none";
}

export interface CompositionOriginOption {
  value: string;
  label: string;
}

/** Origens derivadas dos dados reais do mês — nunca lista fixa. */
export function compositionOriginOptions(
  rows: MonthRow[],
  cardsById: Map<string, FinanceItem>,
  cardLabel: (card: FinanceItem) => string,
): CompositionOriginOption[] {
  const options: CompositionOriginOption[] = [];
  const seen = new Set<string>();
  for (const row of compositionBaseRows(rows)) {
    const key = compositionOriginKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === "direct") options.push({ value: "direct", label: "Pagamentos diretos" });
    else if (key === "none") options.push({ value: "none", label: "Sem forma definida" });
    else {
      const card = cardsById.get(key);
      options.push({ value: key, label: card ? cardLabel(card) : "Cartão" });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
