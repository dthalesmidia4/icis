/**
 * COMUNICAÇÃO DA CONFERÊNCIA DA FATURA (lógica pura, sem efeito contábil).
 *
 * A fórmula da diferença NÃO muda e continua vivendo em `buildStatementConference`:
 *   `total da fatura - compras conhecidas - IOF`.
 *
 * Este módulo só INTERPRETA o sinal dessa diferença para que qualquer pessoa
 * entenda o que está sendo comparado:
 *  - `balanced`             -> composição conciliada;
 *  - `missing_charge`       -> falta lançamento para explicar o total da fatura;
 *  - `credit_or_adjustment` -> os lançamentos identificados somam MAIS que o
 *    total cobrado, o que é compatível com crédito/estorno/desconto aplicado
 *    NA PRÓPRIA fatura. Nunca é dívida e nunca é pagamento a mais.
 *
 * Também separa PAGAMENTO de COMPOSIÇÃO: a diferença da composição nunca pode
 * ser lida como diferença de pagamento.
 *
 * O que este módulo NUNCA faz: criar ocorrência de estorno, gravar crédito ou
 * alterar o total da fatura. É apenas leitura/comunicação.
 */
import { formatBRL } from "./financeModel";

export type StatementCompositionState = "balanced" | "missing_charge" | "credit_or_adjustment";

export interface StatementCompositionReading {
  state: StatementCompositionState;
  /** Diferença crua, com sinal (auditoria). */
  differenceBrl: number;
  /** Valor SEMPRE positivo — é o que a UI exibe. */
  absoluteBrl: number;
  /** Rótulo da linha de conferência (nunca só "Diferença"). */
  label: string;
  title: string;
  description: string;
  tone: "neutral" | "warning" | "positive";
}

/** Rótulo canônico da linha — explícito, nunca o genérico `Diferença`. */
export const COMPOSITION_DIFFERENCE_LABELS: Record<StatementCompositionState, string> = {
  balanced: "Ajuste da composição da fatura",
  missing_charge: "Valor ainda não classificado na composição",
  credit_or_adjustment: "Créditos/estornos a classificar",
};

const EPSILON = 0.005;

/**
 * Interpreta a diferença da composição. Fonte única de texto para TODAS as
 * telas de conferência (fechamento, pagamento, painel e insights).
 */
export function interpretStatementCompositionDifference(
  differenceBrl: number | null | undefined,
): StatementCompositionReading {
  const raw = Number.isFinite(differenceBrl ?? NaN) ? Number((differenceBrl as number).toFixed(2)) : 0;
  const absoluteBrl = Number(Math.abs(raw).toFixed(2));

  if (absoluteBrl < EPSILON) {
    return {
      state: "balanced",
      differenceBrl: 0,
      absoluteBrl: 0,
      label: COMPOSITION_DIFFERENCE_LABELS.balanced,
      title: "Composição conciliada",
      description: "Tudo explicado pelos lançamentos e ajustes registrados nesta fatura.",
      tone: "positive",
    };
  }

  if (raw > 0) {
    return {
      state: "missing_charge",
      differenceBrl: raw,
      absoluteBrl,
      label: COMPOSITION_DIFFERENCE_LABELS.missing_charge,
      title: `Faltam ${formatBRL(absoluteBrl)} para explicar a composição da fatura.`,
      description: "Pode haver uma cobrança, tarifa ou outro lançamento ainda não registrado.",
      tone: "warning",
    };
  }

  return {
    state: "credit_or_adjustment",
    differenceBrl: raw,
    absoluteBrl,
    label: COMPOSITION_DIFFERENCE_LABELS.credit_or_adjustment,
    title: `Há ${formatBRL(absoluteBrl)} em créditos, estornos ou abatimentos ainda não classificados.`,
    description:
      "Os lançamentos identificados somam mais que o total cobrado pelo banco. Isso normalmente indica crédito, estorno, desconto ou abatimento aplicado na própria fatura. Não significa que você esteja devendo esse valor nem que tenha pago a mais.",
    tone: "warning",
  };
}

/* ------------------------- Pagamento (fato separado) ----------------------- */

export interface StatementPaymentReading {
  state: "not_paid" | "reconciled" | "mismatch";
  statementBrl: number | null;
  paidBrl: number | null;
  /** `valor pago - total da fatura`, quando ambos existirem. */
  differenceBrl: number | null;
  situationLabel: string;
  message: string;
}

/**
 * Leitura do PAGAMENTO da fatura — independente da composição.
 * A diferença da composição NUNCA entra aqui.
 */
export function interpretStatementPayment(input: {
  paid: boolean;
  statementBrl: number | null;
  paidBrl: number | null;
}): StatementPaymentReading {
  const statementBrl = input.statementBrl != null ? Number(input.statementBrl.toFixed(2)) : null;
  const paidBrl = input.paidBrl != null ? Number(input.paidBrl.toFixed(2)) : null;

  if (!input.paid || paidBrl == null) {
    return {
      state: "not_paid",
      statementBrl,
      paidBrl,
      differenceBrl: null,
      situationLabel: "Em aberto",
      message: "Fatura ainda não quitada.",
    };
  }

  const differenceBrl = statementBrl != null ? Number((paidBrl - statementBrl).toFixed(2)) : null;
  if (differenceBrl != null && Math.abs(differenceBrl) < EPSILON) {
    return {
      state: "reconciled",
      statementBrl,
      paidBrl,
      differenceBrl: 0,
      situationLabel: "Quitada",
      message: `Pagamento conciliado · diferença ${formatBRL(0)}`,
    };
  }

  return {
    state: "mismatch",
    statementBrl,
    paidBrl,
    differenceBrl,
    situationLabel: "Quitada",
    message:
      differenceBrl != null
        ? `Valor pago diferente do total da fatura · ${formatBRL(Math.abs(differenceBrl))}`
        : "Total da fatura ainda não informado.",
  };
}
