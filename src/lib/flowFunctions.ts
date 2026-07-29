/**
 * Helpers para identificar funções operacionais no fluxo do card.
 */

export const EVALUATION_FUNCTION_KEY = "avaliar";

// Apenas cards que estão efetivamente PARADOS esperando o cliente.
// `enviar_cliente` é uma tarefa operacional do colaborador (ele precisa enviar),
// portanto continua na fila normal de produção.
const CLIENT_WAITING_FUNCTION_KEYS = new Set([
  "aguardando_cliente",
]);

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

export function isClientWaitingFunction(key?: string | null): boolean {
  if (!key) return false;
  return CLIENT_WAITING_FUNCTION_KEYS.has(key.toLowerCase().trim());
}
