/**
 * Interpretação CANÔNICA de valores digitados no Financeiro.
 *
 * O usuário digita em português (`1.728,02`), mas colagens vindas de faturas e
 * painéis estrangeiros chegam em `1,728.02` — e o parser antigo (`replace(".","")`
 * + `replace(",",".")`) corrompia silenciosamente os dois casos.
 *
 * Regra: o ÚLTIMO separador encontrado é o decimal; o outro é milhar.
 * Quando existe apenas ponto, ele só é tratado como milhar se estiver
 * inequivocamente nesse formato (grupos de 3 dígitos, ex.: `1.728`, `12.500`).
 */

/** `null` quando não há número interpretável (vazio, lixo, `NaN`). */
export function parseLocalizedNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const clean = value
    .replace(/R\$/gi, "")
    .replace(/US\$/gi, "")
    .replace(/\s|\u00a0/g, "")
    .trim();
  if (!clean) return null;
  if (!/^-?[\d.,]+$/.test(clean)) return null;

  const negative = clean.startsWith("-");
  const digitsPart = negative ? clean.slice(1) : clean;

  const lastDot = digitsPart.lastIndexOf(".");
  const lastComma = digitsPart.lastIndexOf(",");
  let normalized: string;

  if (lastDot !== -1 && lastComma !== -1) {
    // Ambos presentes: o último manda.
    normalized =
      lastComma > lastDot
        ? digitsPart.replace(/\./g, "").replace(",", ".")
        : digitsPart.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Só vírgula: sempre decimal no padrão brasileiro.
    normalized = digitsPart.replace(/,/g, ".");
  } else if (lastDot !== -1) {
    // Só ponto: milhar apenas quando o formato é inequívoco (1.728 / 12.500.000).
    const looksLikeThousands = /^\d{1,3}(\.\d{3})+$/.test(digitsPart);
    normalized = looksLikeThousands ? digitsPart.replace(/\./g, "") : digitsPart;
  } else {
    normalized = digitsPart;
  }

  // Mais de um ponto restante significa entrada ambígua/inválida.
  if ((normalized.match(/\./g) ?? []).length > 1) return null;

  const parsed = Number(negative ? `-${normalized}` : normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Inteiro positivo (dias, parcelas, intervalos) ou `null`. */
export function parsePositiveInt(value: string | null | undefined): number | null {
  const parsed = parseLocalizedNumber(value ?? null);
  if (parsed == null) return null;
  const int = Math.trunc(parsed);
  return int > 0 ? int : null;
}

/** Dia do mês válido (1-31) ou `null`. */
export function parseDayOfMonth(value: string | null | undefined): number | null {
  const int = parsePositiveInt(value);
  if (int == null || int > 31) return null;
  return int;
}
