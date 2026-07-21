/**
 * Helpers para identificar funções operacionais no fluxo do card.
 */

export const EVALUATION_FUNCTION_KEY = "avaliar";

const REVIEW_FUNCTION_KEYS = new Set([
  "revisar",
  "revisao",
  "revisão",
  "revisar_arte",
  "revisar_roteiro",
  "revisar_conteudo",
]);

export function isReviewFunction(key?: string | null): boolean {
  if (!key) return false;
  const k = key.toLowerCase().trim();
  if (REVIEW_FUNCTION_KEYS.has(k)) return true;
  return k.startsWith("revis");
}

export function isEvaluationFunction(key?: string | null): boolean {
  if (!key) return false;
  return key.toLowerCase().trim() === EVALUATION_FUNCTION_KEY;
}
