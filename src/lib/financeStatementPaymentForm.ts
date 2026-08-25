/**
 * Regras puras do formulário de pagamento de fatura.
 *
 * Objetivo: nunca fazer fallback silencioso para o valor sugerido quando o
 * usuário digitou algo inválido — só o campo VAZIO herda a sugestão.
 */
import { parseLocalizedNumber } from "./financeNumber";

export type StatementPaymentAmount =
  | { state: "ok"; amountBrl: number | null }
  | { state: "invalid"; reason: "not_a_number" | "negative" | "zero" };

export function resolveStatementPaymentAmount(
  raw: string,
  suggested: number | null,
): StatementPaymentAmount {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { state: "ok", amountBrl: suggested ?? null };

  const parsed = parseLocalizedNumber(trimmed);
  if (parsed == null || !Number.isFinite(parsed)) return { state: "invalid", reason: "not_a_number" };
  if (parsed < 0) return { state: "invalid", reason: "negative" };
  if (parsed === 0) return { state: "invalid", reason: "zero" };
  return { state: "ok", amountBrl: parsed };
}

export function statementPaymentAmountMessage(result: StatementPaymentAmount): string | null {
  if (result.state === "ok") return null;
  if (result.reason === "negative") return "O valor pago não pode ser negativo";
  if (result.reason === "zero") return "Informe um valor maior que zero";
  return "Informe um valor válido";
}
