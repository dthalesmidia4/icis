/**
 * EDIÇÃO INLINE — helpers puros.
 *
 * A planilha operacional do Hub edita célula por célula. Nada aqui toca o
 * banco: só interpreta o que a pessoa digitou e devolve o valor canônico ou o
 * erro em texto claro. Campo vazio SEMPRE virá `null` (nunca zero), porque
 * "a definir" é uma informação real e diferente de zero.
 */

/** Resultado plano (sem união discriminada) para simplificar o consumo na UI. */
export type InlineParse<T> = { ok: boolean; value: T | null; message?: string };

const empty = (raw: string | null | undefined) => !raw || !String(raw).trim();

/** Texto: vazio → null; nunca guarda espaços nas pontas. */
export function parseInlineText(raw: string | null | undefined): InlineParse<string | null> {
  return { ok: true, value: empty(raw) ? null : String(raw).trim() };
}

/** Número inteiro não negativo (metas, distância em km). */
export function parseInlineNumber(
  raw: string | null | undefined,
  options?: { label?: string; allowDecimal?: boolean },
): InlineParse<number | null> {
  const label = options?.label || "valor";
  if (empty(raw)) return { ok: true, value: null };
  const cleaned = String(raw).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, value: null, message: `Informe um ${label} numérico válido.` };
  }
  if (n < 0) return { ok: false, value: null, message: `O ${label} não pode ser negativo.` };
  if (!options?.allowDecimal && !Number.isInteger(n)) {
    return { ok: false, value: null, message: `O ${label} deve ser um número inteiro.` };
  }

  return { ok: true, value: n };
}

/** Moeda brasileira ("1.500,50") → number; vazio → null. */
export function parseInlineCurrency(raw: string | null | undefined): InlineParse<number | null> {
  if (empty(raw)) return { ok: true, value: null };
  const cleaned = String(raw)
    .trim()
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { ok: false, value: null, message: "Informe uma verba numérica válida." };
  if (n < 0) return { ok: false, value: null, message: "A verba não pode ser negativa." };
  return { ok: true, value: n };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Data ISO (yyyy-mm-dd); vazio → null. */
export function parseInlineDate(raw: string | null | undefined): InlineParse<string | null> {
  if (empty(raw)) return { ok: true, value: null };
  const value = String(raw).trim();
  if (!ISO_DATE.test(value)) return { ok: false, value: null, message: "Informe uma data válida." };
  return { ok: true, value };
}

/** Janela: fim nunca antes do início. */
export function validateInlineRange(
  start: string | null,
  end: string | null,
  label = "período",
): string | null {
  if (start && end && end < start) return `O fim do ${label} não pode ser antes do início.`;
  return null;
}

/** Escolha em lista fechada; vazio → null. */
export function parseInlineSelect(
  raw: string | null | undefined,
  allowed: string[],
): InlineParse<string | null> {
  if (empty(raw)) return { ok: true, value: null };
  const value = String(raw).trim();
  if (!allowed.includes(value)) return { ok: false, value: null, message: "Opção inválida." };
  return { ok: true, value };
}

/** Texto exibido quando o valor ainda não existe. */
export const TO_DEFINE = "A definir";

export function inlineNumberText(value?: number | null, suffix = ""): string {
  if (value === null || value === undefined) return TO_DEFINE;
  return `${value.toLocaleString("pt-BR")}${suffix}`;
}

export function inlineCurrencyText(value?: number | null): string {
  if (value === null || value === undefined) return TO_DEFINE;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function inlineDateText(value?: string | null): string {
  if (!value) return TO_DEFINE;
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

/** Valor bruto para o input a partir do valor gravado. */
export function toInputValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Não grava nada quando o usuário não mudou de fato o valor. */
export function isUnchanged(
  current: string | number | null | undefined,
  next: string | number | null,
): boolean {
  const a = current === undefined ? null : current;
  return a === next;
}
