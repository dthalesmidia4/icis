/**
 * Regras puras do formulário de pagamento de fatura.
 *
 * Dois objetivos:
 * 1. Nunca fazer fallback silencioso para o valor sugerido quando o usuário
 *    digitou algo inválido — só o campo VAZIO herda a sugestão.
 * 2. NÃO ACEITAR PAGAMENTO PARCIAL. O modelo não tem conceito de saldo: gravar
 *    `paid_at` com valor menor marcaria a fatura INTEIRA como paga. Quando a
 *    fatura já tem valor real informado, o valor pago precisa bater com ele
 *    (tolerância de centavos).
 */
import { parseLocalizedNumber } from "./financeNumber";

export type StatementPaymentAmount =
  | { state: "ok"; amountBrl: number | null }
  | { state: "invalid"; reason: "not_a_number" | "negative" | "zero" | "partial" };

/** Tolerância de arredondamento (centavos). */
const CENT_TOLERANCE = 0.011;

export const PARTIAL_PAYMENT_MESSAGE =
  "Pagamento parcial ainda não é suportado: informe o valor total da fatura.";

export function resolveStatementPaymentAmount(
  raw: string,
  suggested: number | null,
  options?: {
    /**
     * `true` quando a fatura já tem VALOR REAL informado: aí o total é fato e
     * qualquer valor diferente seria pagamento parcial (ou valor errado).
     */
    exactRequired?: boolean;
  },
): StatementPaymentAmount {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { state: "ok", amountBrl: suggested ?? null };

  const parsed = parseLocalizedNumber(trimmed);
  if (parsed == null || !Number.isFinite(parsed)) return { state: "invalid", reason: "not_a_number" };
  if (parsed < 0) return { state: "invalid", reason: "negative" };
  if (parsed === 0) return { state: "invalid", reason: "zero" };
  if (options?.exactRequired && suggested != null && Math.abs(parsed - suggested) > CENT_TOLERANCE) {
    return { state: "invalid", reason: "partial" };
  }
  return { state: "ok", amountBrl: parsed };
}

export function statementPaymentAmountMessage(result: StatementPaymentAmount): string | null {
  if (result.state === "ok") return null;
  if (result.reason === "negative") return "O valor pago não pode ser negativo";
  if (result.reason === "zero") return "Informe um valor maior que zero";
  if (result.reason === "partial") return PARTIAL_PAYMENT_MESSAGE;
  return "Informe um valor válido";
}
