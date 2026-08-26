/**
 * CONVERSÃO USD ↔ BRL BIDIRECIONAL (lógica pura).
 *
 * Um lançamento em dólar tem TRÊS números ligados pela mesma identidade:
 *
 *     valor cobrado em reais = valor em dólar × câmbio
 *
 * O usuário pode editar qualquer um dos três; os outros são recalculados a
 * partir da identidade acima. Regras:
 *  - editar o CÂMBIO recalcula os reais (o dólar é o dado informado);
 *  - editar os REAIS recalcula o câmbio (dólar continua sendo o dado);
 *  - editar o DÓLAR recalcula os reais usando o câmbio atual.
 *
 * Nada aqui toca em estado React: o campo editado é sempre preservado
 * LITERALMENTE (o usuário nunca vê o que digitou sendo reescrito no meio da
 * digitação), então não existe loop de atualização. Divisão por zero, campo
 * vazio ou texto inválido nunca produzem número: produzem string vazia.
 */
import { parseLocalizedNumber } from "./financeNumber";

export interface UsdConversionState {
  /** Valor em dólar (texto do input). */
  original: string;
  /** Câmbio R$ por US$ (texto do input). */
  rate: string;
  /** Valor cobrado em reais (texto do input). */
  brl: string;
}

export type UsdConversionField = keyof UsdConversionState;

/** Dinheiro: 2 casas. `1234.5` -> `"1234.50"`. */
export function formatMoneyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

/** Câmbio: até 6 casas, sem zeros à direita. `5.130000` -> `"5.13"`. */
export function formatRateInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(6)));
}

const positive = (v: number | null): number | null => (v != null && v > 0 ? v : null);

/** Reais a partir de dólar × câmbio. `null` quando falta dado válido. */
export function brlFromUsd(original: number | null, rate: number | null): number | null {
  const usd = positive(original);
  const r = positive(rate);
  if (usd == null || r == null) return null;
  return Number((usd * r).toFixed(2));
}

/** Câmbio efetivo a partir do par (reais / dólar). Nunca divide por zero. */
export function rateFromBrl(brl: number | null, original: number | null): number | null {
  const usd = positive(original);
  const value = positive(brl);
  if (usd == null || value == null) return null;
  return Number((value / usd).toFixed(6));
}

/** Estado inicial coerente a partir dos números já conhecidos do fato. */
export function seedUsdConversion(input: {
  original: number | null;
  rate: number | null;
  brl: number | null;
}): UsdConversionState {
  const brl = input.brl ?? brlFromUsd(input.original, input.rate);
  const rate = input.rate ?? rateFromBrl(input.brl, input.original);
  return {
    original: formatMoneyInput(input.original),
    rate: formatRateInput(rate),
    brl: formatMoneyInput(brl),
  };
}

/**
 * Aplica uma edição do usuário e recalcula APENAS os campos derivados.
 * O campo editado volta exatamente como foi digitado.
 */
export function applyUsdEdit(
  state: UsdConversionState,
  field: UsdConversionField,
  raw: string,
): UsdConversionState {
  const next: UsdConversionState = { ...state, [field]: raw };

  const original = parseLocalizedNumber(next.original);
  const rate = parseLocalizedNumber(next.rate);
  const brl = parseLocalizedNumber(next.brl);

  if (field === "brl") {
    const derived = rateFromBrl(brl, original);
    return { ...next, rate: derived != null ? formatRateInput(derived) : next.rate };
  }

  if (field === "rate") {
    const derived = brlFromUsd(original, rate);
    return { ...next, brl: derived != null ? formatMoneyInput(derived) : next.brl };
  }

  // Editou o dólar: reais seguem o câmbio atual; sem câmbio, tenta derivá-lo.
  const derivedBrl = brlFromUsd(original, rate);
  if (derivedBrl != null) return { ...next, brl: formatMoneyInput(derivedBrl) };
  const derivedRate = rateFromBrl(brl, original);
  return { ...next, rate: derivedRate != null ? formatRateInput(derivedRate) : next.rate };
}

/** Números finais para persistir (o BRL digitado é a autoridade quando existe). */
export function resolveUsdNumbers(state: UsdConversionState): {
  amountOriginal: number | null;
  exchangeRate: number | null;
  amountBrl: number | null;
} {
  const original = parseLocalizedNumber(state.original);
  const typedBrl = parseLocalizedNumber(state.brl);
  const typedRate = parseLocalizedNumber(state.rate);

  const amountBrl = positive(typedBrl) ?? brlFromUsd(original, typedRate);
  const exchangeRate = rateFromBrl(amountBrl, original) ?? positive(typedRate);
  return { amountOriginal: original, exchangeRate, amountBrl };
}

export const USD_CONVERSION_HELP =
  "Edite o câmbio ou o valor cobrado em R$: o outro é recalculado automaticamente a partir do valor em dólar.";
