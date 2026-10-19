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

/* ------------------------------ Máscara pt-BR ------------------------------ */

function groupThousands(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, "");
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Máscara de APRESENTAÇÃO/entrada em pt-BR para campos monetários.
 *
 * `2821,19` → `2.821,19` · `2821.19` → `2.821,19` · `70.87` → `70,87`.
 * Máximo 2 casas decimais; `1.728` continua milhar (formato inequívoco).
 * A máscara nunca altera o valor: o parser canônico segue sendo
 * `parseLocalizedNumber`.
 */
export function maskBrlInput(raw: string | null | undefined): string {
  if (raw == null) return "";
  const cleaned = String(raw).replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  const lastSep = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let intDigits = cleaned;
  let frac: string | null = null;

  if (lastSep !== -1) {
    const after = cleaned.slice(lastSep + 1).replace(/[.,]/g, "");
    const isComma = cleaned[lastSep] === ",";
    const hasOtherSep = /[.,]/.test(cleaned.slice(0, lastSep));
    // Ponto com exatamente 3 dígitos e sem outro separador = milhar (1.728).
    const dotThousands = !isComma && after.length === 3 && !hasOtherSep;
    const decimal = isComma || after.length <= 2;
    if (decimal && !dotThousands) {
      intDigits = cleaned.slice(0, lastSep);
      frac = after.slice(0, 2);
    }
  }

  const int = groupThousands(intDigits.replace(/[.,]/g, "") || "0");
  return frac == null ? int : `${int},${frac}`;
}

/**
 * Máscara de DIGITAÇÃO monetária.
 *
 * Sem separador digitado, os números entram por centavos — `1` → `0,01`,
 * `123` → `1,23`, `282119` → `2.821,19` — então a máscara nunca reinterpreta um
 * ponto de milhar que ela mesma inseriu.
 * Com separador explícito (digitado ou colado), o valor informado é preservado:
 * `2821,19` / `2821.19` / `2.821,19` → `2.821,19`; `70.87` → `70,87`.
 */
export function maskBrlTyping(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  if (/[.,]/.test(cleaned)) return maskBrlInput(cleaned);

  const digits = cleaned.replace(/^0+(?=\d)/, "").padStart(3, "0");
  return `${groupThousands(digits.slice(0, -2))},${digits.slice(-2)}`;
}

function centsFromDigits(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, "").padStart(3, "0");
  return `${groupThousands(clean.slice(0, -2))},${clean.slice(-2)}`;
}

/**
 * PASSO DE DIGITAÇÃO monetária estável (teclado de centavos).
 *
 * Recebe o valor ANTERIOR já formatado e o valor BRUTO novo do input e decide
 * a edição pela diferença de dígitos — nunca reinterpreta o separador que a
 * própria formatação inseriu (bug: `0,01` + tecla `2` virava `0,012` e era
 * truncado de volta para `0,01`).
 *
 * Semântica consistente:
 * - Um dígito a mais no fim → append de centavo (`0,01` + `2` → `0,12`).
 * - Um dígito a menos no fim → backspace apaga o último centavo.
 * - Colagem/edição com separador explícito novo → preserva o valor informado
 *   (`2821,19` / `2.821,19` / `2821.19` → `2.821,19`).
 * - Substituição total ou edição no meio → os dígitos viram o novo valor em
 *   centavos (comportamento de teclado de centavos, sem alterar dígitos).
 *
 * O parser canônico segue sendo `parseLocalizedNumber`; isto é só apresentação.
 */
export function brlTypingStep(prev: string | null | undefined, next: string | null | undefined): string {
  const nextRaw = String(next ?? "").replace(/[^\d.,]/g, "");
  if (!nextRaw) return "";
  const prevDigits = String(prev ?? "").replace(/\D/g, "");
  const nextDigits = nextRaw.replace(/\D/g, "");

  // Append de UM dígito (tecla a tecla): centavos.
  if (nextDigits.length === prevDigits.length + 1 && nextDigits.startsWith(prevDigits)) {
    return centsFromDigits(nextDigits);
  }
  // Backspace de UM dígito no fim: apaga o último centavo.
  if (nextDigits.length + 1 === prevDigits.length && prevDigits.startsWith(nextDigits)) {
    return nextDigits ? centsFromDigits(nextDigits) : "";
  }
  // Colagem/edição com separador explícito e dígitos novos: preserva o valor.
  if (/[.,]/.test(nextRaw) && nextDigits !== prevDigits) {
    return maskBrlInput(nextRaw);
  }
  // Substituição total ou edição no meio: dígitos viram o valor em centavos.
  return centsFromDigits(nextDigits);
}

/** Número → texto mascarado com 2 casas (`2821.19` → `2.821,19`). */
export function maskBrlFromNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return maskBrlInput(value.toFixed(2).replace(".", ","));
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
