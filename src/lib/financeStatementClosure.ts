/**
 * FECHAMENTO DA FATURA DO CARTÃO (lógica pura).
 *
 * `Total da fatura` e `IOF incluído na fatura` são o MESMO dado: o fechamento
 * que o banco emitiu. Por isso não existem mais dois caminhos (`Ver detalhes`
 * para o valor e `Ajustar IOF` para o imposto): as duas informações são sempre
 * capturadas e ajustadas juntas, tanto ao pagar quanto ao consultar depois.
 *
 * Este módulo concentra as regras puras:
 *  - parsing/validação do formulário de fechamento;
 *  - rótulos únicos (`Informar fechamento` / `Ver/ajustar fechamento`);
 *  - montagem do patch que a RPC `finance_update_statement_closure` recebe.
 *
 * O que este módulo NUNCA faz: mexer em `paid_at`/`paid_amount_brl`. Fechamento
 * é o dado da fatura; liquidação é outro fato (rota de pagamento).
 */
import { StatementGroup } from "./financeModel";
import { parseIofInput } from "./financeIof";
import { parseLocalizedNumber } from "./financeNumber";

/* ------------------------------- Rótulos ---------------------------------- */

export const CLOSURE_TOTAL_LABEL = "Total da fatura (R$)";
export const CLOSURE_IOF_LABEL = "IOF incluído na fatura (R$)";
export const CLOSURE_SECTION_LABEL = "Fechamento da fatura";

/** Botão único do cartão: informar ou revisar o fechamento já conhecido. */
export function statementClosureButtonLabel(group: StatementGroup): string {
  return group.actualTotal != null || group.paid
    ? "Ver/ajustar fechamento"
    : "Informar fechamento";
}

/* --------------------------- Estado do formulário -------------------------- */

export interface StatementClosureSeed {
  /** Total real já conhecido (nunca a projeção): `""` quando não houver. */
  total: string;
  /** IOF já classificado, sempre preenchido (padrão `0`). */
  iof: string;
}

/** Predefinido a partir do FATO: total real da fatura + IOF já classificado. */
export function seedStatementClosure(group: StatementGroup | null): StatementClosureSeed {
  if (!group) return { total: "", iof: "0" };
  const total = group.actualTotal != null ? String(Number(group.actualTotal.toFixed(2))) : "";
  const iofRaw = group.statementRow?.occurrence?.iof_amount_brl ?? null;
  const iof = iofRaw != null && Number.isFinite(iofRaw) && iofRaw > 0 ? String(Number(iofRaw.toFixed(2))) : "0";
  return { total, iof };
}

export type StatementClosureResult =
  | { state: "ok"; totalBrl: number | null; iofBrl: number }
  | {
      state: "invalid";
      reason: "total_not_a_number" | "total_not_positive" | "iof_invalid" | "iof_over_total";
    };

/**
 * Valida total + IOF juntos.
 *
 * - total vazio = "não sei o total ainda": mantém o total atual (só o IOF muda);
 * - IOF vazio = 0 (remove a classificação);
 * - IOF nunca pode passar do total conhecido.
 */
export function resolveStatementClosure(input: {
  total: string;
  iof: string;
  /** Total já conhecido da fatura, usado quando o campo de total fica vazio. */
  knownTotalBrl: number | null;
}): StatementClosureResult {
  const iofResult = parseIofInput(input.iof);
  if (iofResult.state !== "ok") return { state: "invalid", reason: "iof_invalid" };

  const trimmed = (input.total ?? "").trim();
  let totalBrl: number | null = null;
  if (trimmed !== "") {
    const parsed = parseLocalizedNumber(trimmed);
    if (parsed == null || !Number.isFinite(parsed)) {
      return { state: "invalid", reason: "total_not_a_number" };
    }
    if (parsed <= 0) return { state: "invalid", reason: "total_not_positive" };
    totalBrl = Number(parsed.toFixed(2));
  }

  const effectiveTotal = totalBrl ?? input.knownTotalBrl ?? null;
  if (effectiveTotal != null && iofResult.value > effectiveTotal) {
    return { state: "invalid", reason: "iof_over_total" };
  }

  return { state: "ok", totalBrl, iofBrl: iofResult.value };
}

export function statementClosureMessage(result: StatementClosureResult): string | null {
  if (result.state === "ok") return null;
  switch (result.reason) {
    case "total_not_a_number":
      return "Informe um total válido para a fatura";
    case "total_not_positive":
      return "O total da fatura precisa ser maior que zero";
    case "iof_over_total":
      return "O IOF não pode ser maior que o total da fatura";
    default:
      return "Informe um valor válido de IOF (use 0 quando não houver)";
  }
}

/** Nada mudou: evita gravar (e auditar) um fechamento idêntico. */
export function statementClosureUnchanged(
  result: StatementClosureResult,
  current: { totalBrl: number | null; iofBrl: number },
): boolean {
  if (result.state !== "ok") return false;
  const sameTotal =
    result.totalBrl == null || (current.totalBrl != null && Math.abs(result.totalBrl - current.totalBrl) < 0.005);
  return sameTotal && Math.abs(result.iofBrl - current.iofBrl) < 0.005;
}

export interface StatementClosurePayload {
  occurrenceId: string;
  /** `null` = preserva o total atual da fatura. */
  amountBrl: number | null;
  iofBrl: number;
}

export function statementClosurePayload(
  group: StatementGroup,
  result: StatementClosureResult,
): StatementClosurePayload | null {
  const occurrenceId = group.statementRow?.occurrence?.id ?? null;
  if (!occurrenceId || result.state !== "ok") return null;
  return { occurrenceId, amountBrl: result.totalBrl, iofBrl: result.iofBrl };
}
