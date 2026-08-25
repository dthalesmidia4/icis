/**
 * RECONCILIAÇÃO CAMBIAL DA FATURA (lógica pura).
 *
 * Regra contábil canônica:
 *  - antes do pagamento, uma compra em dólar é ESTIMATIVA — usa câmbio de
 *    referência apenas para projetar reais;
 *  - ao pagar a fatura, cada compra passa a ter FATO: o valor exato em reais
 *    cobrado naquela transação. O câmbio efetivo é derivado desse par,
 *    individualmente. Duas compras da mesma fatura podem ter câmbios
 *    diferentes — não existe "câmbio da fatura".
 *
 * Este módulo só monta e valida o payload; o câmbio autoritativo é recalculado
 * no PostgreSQL pela RPC `pay_finance_statement_reconciled`.
 */
import { MonthRow, StatementGroup, computeUsdRate } from "./financeModel";
import { parseLocalizedNumber } from "./financeNumber";

/** Uma compra em dólar que precisa de valor exato em reais antes de liquidar. */
export interface UsdComponent {
  row: MonthRow;
  itemId: string;
  /** `null` quando a compra ainda é projeção (será materializada). */
  occurrenceId: string | null;
  name: string;
  chargeDate: string | null;
  amountOriginal: number | null;
  /** Estimativa atual em reais, quando existir — informação secundária. */
  estimatedBrl: number | null;
  projected: boolean;
}

/** Componentes USD da fatura, na ordem de cobrança. */
export function usdComponentsOf(group: StatementGroup | null): UsdComponent[] {
  if (!group) return [];
  return group.components
    .filter((row) => row.currency === "USD")
    .map((row) => ({
      row,
      itemId: row.item.id,
      occurrenceId: row.occurrence?.id ?? null,
      name: row.item.name,
      chargeDate: row.chargeDate ?? null,
      amountOriginal: row.amountOriginal ?? null,
      estimatedBrl: row.amountBrl ?? null,
      projected: row.projected,
    }))
    .sort((a, b) => (a.chargeDate ?? "").localeCompare(b.chargeDate ?? ""));
}

/**
 * Compra em dólar sem valor original válido: não há como provar câmbio algum.
 * Bloqueia o pagamento em vez de inventar taxa.
 */
export function blockingUsdComponents(components: UsdComponent[]): UsdComponent[] {
  return components.filter((c) => c.amountOriginal == null || !(c.amountOriginal > 0));
}

export interface ReconciliationEntry {
  itemId: string;
  occurrenceId: string | null;
  amountOriginal: number;
  amountBrl: number;
  /** Prévia local; o banco recalcula e persiste o valor autoritativo. */
  exchangeRate: number | null;
  chargeDate: string | null;
}

export type ReconciliationState =
  | { state: "blocked"; reason: string }
  | { state: "incomplete"; missing: string[] }
  | { state: "ok"; entries: ReconciliationEntry[]; totalBrl: number; estimatedBrl: number; drift: number };

/**
 * Valida os valores digitados e monta as entradas da RPC.
 * `inputs` é indexado pela chave da linha (`row.key`).
 */
export function buildReconciliation(
  components: UsdComponent[],
  inputs: Record<string, string>,
): ReconciliationState {
  const blocking = blockingUsdComponents(components);
  if (blocking.length > 0) {
    return {
      state: "blocked",
      reason: `Corrija o valor em dólar antes de pagar: ${blocking.map((c) => c.name).join(", ")}`,
    };
  }

  const entries: ReconciliationEntry[] = [];
  const missing: string[] = [];
  let totalBrl = 0;
  let estimatedBrl = 0;

  for (const comp of components) {
    const parsed = parseLocalizedNumber(inputs[comp.row.key] ?? "");
    if (parsed == null || !(parsed > 0)) {
      missing.push(comp.name);
      continue;
    }
    totalBrl += parsed;
    estimatedBrl += comp.estimatedBrl ?? 0;
    entries.push({
      itemId: comp.itemId,
      occurrenceId: comp.occurrenceId,
      amountOriginal: comp.amountOriginal as number,
      amountBrl: Number(parsed.toFixed(2)),
      exchangeRate: computeUsdRate(parsed, comp.amountOriginal),
      chargeDate: comp.chargeDate,
    });
  }

  if (missing.length > 0) return { state: "incomplete", missing };

  return {
    state: "ok",
    entries,
    totalBrl: Number(totalBrl.toFixed(2)),
    estimatedBrl: Number(estimatedBrl.toFixed(2)),
    /** Ajuste cambial identificado — informativo, nunca bloqueia. */
    drift: Number((totalBrl - estimatedBrl).toFixed(2)),
  };
}

/** Payload JSONB da RPC. O câmbio enviado é só prévia; o banco recalcula. */
export function reconciliationPayload(entries: ReconciliationEntry[]) {
  return entries.map((e) => ({
    item_id: e.itemId,
    occurrence_id: e.occurrenceId,
    amount_original: e.amountOriginal,
    amount_brl: e.amountBrl,
    exchange_rate: e.exchangeRate,
    charge_date: e.chargeDate,
  }));
}
