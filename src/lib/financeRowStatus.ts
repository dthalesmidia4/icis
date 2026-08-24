/**
 * Camada de APRESENTAÇÃO do Financeiro.
 *
 * Regra semântica central:
 * - Uma cobrança feita NO CARTÃO não é uma obrigação vencida independente.
 *   Quem vence é a FATURA do cartão. Portanto `charge_date` no passado
 *   NUNCA gera status "Atrasada" para o componente.
 * - Somente pagamentos DIRETOS (Pix, Boleto, Transferência, Dinheiro, Débito)
 *   podem ficar "Atrasada", com base em `due_date`.
 *
 * Nada aqui altera cálculo contábil: os totais continuam em `financeModel`.
 */

import { Competence, competenceFromISO } from "./financeCardCycle";
import {
  CARD_PAYMENT_METHOD,
  FinanceItem,
  MonthRow,
  StatementGroup,
  cardDisplayLabel,
  cycleGapLabel,
  formatBRL,
  isCostBearing,
  isStatementRow,
  missingCycleFields,
} from "./financeModel";

export type StatusTone = "positive" | "danger" | "warning" | "neutral";

export type RowStatusKind =
  | "paid"
  | "overdue"
  | "due_today"
  | "open"
  | "projected"
  | "card_projected"
  | "card_in_statement"
  | "card_statement_paid"
  | "card_statement_overdue"
  | "card_unlinked"
  /** Cartão vinculado, mas o CICLO da fatura ainda não foi configurado. */
  | "card_awaiting_statement";

export interface RowStatus {
  kind: RowStatusKind;
  label: string;
  tone: StatusTone;
  /** `true` quando a linha é obrigação direta de pagamento (Pix/Boleto/etc.). */
  direct: boolean;
  /** `true` quando o botão "Pagar" faz sentido nesta linha. */
  canPayDirectly: boolean;
}


const MONTH_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MONTH_FULL = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function monthFullLabel(competence: Competence): string {
  return MONTH_FULL[competence.month - 1] ?? String(competence.month);
}

/** `2026-08-01` -> `01 ago`. */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  const month = MONTH_SHORT[Number(m) - 1];
  if (!d || !month) return iso;
  return `${d} ${month}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetweenISO(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

/** A linha é cobrada no cartão de crédito (componente de fatura)? */
export function isCardCharge(row: MonthRow): boolean {
  if (isStatementRow(row)) return false;
  if (row.cardItemId) return true;
  return row.item.payment_method === CARD_PAYMENT_METHOD;
}

/** A linha é obrigação direta (pode vencer sozinha)? */
export function isDirectObligation(row: MonthRow): boolean {
  return !isStatementRow(row) && !isCardCharge(row);
}

function cardConfigIncomplete(card: FinanceItem | undefined | null): boolean {
  if (!card) return true;
  return card.statement_closing_day == null || card.statement_due_day == null;
}

export interface RowStatusContext {
  rows: MonthRow[];
  today: string;
  /** Cartões (`kind = 'card'`) por id. */
  cardsById: Map<string, FinanceItem>;
  /** Linhas de fatura conhecidas (para herdar o status do statement). */
  statementRows?: MonthRow[];
}

/**
 * Resolve o status de apresentação de uma linha do mês.
 * Único lugar autorizado a decidir "Atrasada" na UI.
 */
export function resolveRowStatus(row: MonthRow, ctx: RowStatusContext): RowStatus {
  const { today } = ctx;
  const statementRows = ctx.statementRows ?? ctx.rows.filter(isStatementRow);

  /* ------------------------------ FATURA ------------------------------ */
  if (isStatementRow(row)) {
    if (row.paid) {
      return { kind: "paid", label: "Fatura paga", tone: "positive", direct: true, canPayDirectly: false };
    }
    if (row.dueDate && row.dueDate < today) {
      return { kind: "card_statement_overdue", label: "Fatura atrasada", tone: "danger", direct: true, canPayDirectly: true };
    }
    return { kind: "open", label: "Fatura a pagar", tone: "neutral", direct: true, canPayDirectly: true };
  }

  /* -------------------------- CARTÃO (componente) --------------------- */
  if (isCardCharge(row)) {
    if (row.paid) {
      return { kind: "paid", label: "Pago", tone: "positive", direct: false, canPayDirectly: false };
    }

    const statementId = row.occurrence?.statement_occurrence_id ?? null;
    if (statementId) {
      const statement = statementRows.find((r) => r.occurrence?.id === statementId) ?? null;
      if (statement?.paid) {
        return { kind: "card_statement_paid", label: "Fatura paga", tone: "positive", direct: false, canPayDirectly: false };
      }
      if (statement?.dueDate && statement.dueDate < today) {
        return { kind: "card_statement_overdue", label: "Fatura atrasada", tone: "danger", direct: false, canPayDirectly: false };
      }
      const label = statement?.dueDate
        ? `Na fatura de ${monthFullLabel(competenceFromISO(statement.dueDate))}`
        : "Fatura a pagar";
      return { kind: "card_in_statement", label, tone: "neutral", direct: false, canPayDirectly: false };
    }

    const card = row.cardItemId ? ctx.cardsById.get(row.cardItemId) : null;
    if (cardConfigIncomplete(card)) {
      // O cartão JÁ está vinculado — o que falta é o ciclo da fatura.
      return {
        kind: "card_awaiting_statement",
        label: "Aguardando dados da fatura",
        tone: "warning",
        direct: false,
        canPayDirectly: false,
      };
    }

    if (row.projected) {
      return { kind: "card_projected", label: "Prevista na fatura", tone: "neutral", direct: false, canPayDirectly: false };
    }
    return {
      kind: "card_unlinked",
      label: "Aguardando vínculo à fatura",
      tone: "warning",
      direct: false,
      canPayDirectly: false,
    };
  }

  /* -------------------------- OBRIGAÇÃO DIRETA ------------------------ */
  if (row.paid) {
    return { kind: "paid", label: "Pago", tone: "positive", direct: true, canPayDirectly: true };
  }
  const ref = row.dueDate ?? row.chargeDate ?? null;
  if (ref && ref < today) {
    return { kind: "overdue", label: "Atrasada", tone: "danger", direct: true, canPayDirectly: true };
  }
  if (ref && ref === today) {
    return { kind: "due_today", label: "Vence hoje", tone: "warning", direct: true, canPayDirectly: true };
  }
  return {
    kind: row.projected ? "projected" : "open",
    label: row.projected ? "Previsto" : "Em aberto",
    tone: "neutral",
    direct: true,
    canPayDirectly: true,
  };
}

/** Texto da coluna "Quando", contextual por forma de pagamento. */
export function whenLabel(row: MonthRow, today: string): string {
  if (isStatementRow(row)) {
    if (!row.dueDate) return "Vencimento não definido";
    if (row.dueDate === today) return "Vence hoje";
    return `Vence em ${formatDayMonth(row.dueDate)}`;
  }
  if (isCardCharge(row)) {
    if (!row.chargeDate) return "Cobrança sem data definida";
    if (row.chargeDate === today) return "Cobrança hoje";
    if (row.projected) return `Cobrança prevista em ${formatDayMonth(row.chargeDate)}`;
    return `Cobrança em ${formatDayMonth(row.chargeDate)}`;
  }
  const ref = row.dueDate ?? row.chargeDate ?? null;
  if (!ref) return "Sem data definida";
  if (ref === today) return "Vence hoje";
  if (ref === addDaysISO(today, 1)) return "Vence amanhã";
  return `Vence em ${formatDayMonth(ref)}`;
}

/** Linhas realmente atrasadas (apenas obrigações diretas). */
export function overdueDirectRows(rows: MonthRow[], ctx: RowStatusContext): MonthRow[] {
  return rows.filter((row) => resolveRowStatus(row, ctx).kind === "overdue");
}

/* -------------------------------------------------------------------------- */
/*                                 DOMÍNIOS                                   */
/* -------------------------------------------------------------------------- */

/**
 * `Contas a pagar` = FILA DE PAGAMENTOS DIRETOS, não filtro contábil por kind.
 *
 * Entra toda obrigação que o usuário paga diretamente (Pix, boleto,
 * transferência, débito, dinheiro) e que representa saída real de caixa —
 * inclusive uma ferramenta/assinatura paga fora do cartão.
 * Não entra: fatura, cobrança no cartão e item sem custo próprio.
 */
export function isDirectPayableRow(row: MonthRow): boolean {
  if (!isDirectObligation(row)) return false;
  if (!isCostBearing(row.item)) return false;
  return true;
}

/** Alias histórico: mesma regra da fila de pagamentos diretos. */
export const isAccountsDomainRow = isDirectPayableRow;

/** `Assinaturas e ferramentas`: ferramentas, pacotes e recursos incluídos. */
export function isSubscriptionsDomainItem(item: FinanceItem): boolean {
  return item.kind === "tool" || item.kind === "package" || item.kind === "included_resource";
}

/**
 * Aviso secundário e discreto de um componente de cartão: o vínculo existe,
 * o que falta é o CICLO da fatura. Nunca é status principal.
 */
export function cardCycleWarning(row: MonthRow, ctx: RowStatusContext): string | null {
  if (!isCardCharge(row)) return null;
  const card = row.cardItemId ? ctx.cardsById.get(row.cardItemId) : null;
  if (!card) return null;
  const gap = cycleGapLabel(card);
  if (!gap) return null;
  return `Dados da fatura incompletos · ${gap}`;
}

/** Forma de pagamento legível de uma linha (cartão pelo apelido, nunca UUID). */
export function paymentLabel(row: MonthRow, ctx: RowStatusContext): string {
  const card = row.cardItemId ? ctx.cardsById.get(row.cardItemId) : null;
  if (card) return cardDisplayLabel(card);
  return row.item.payment_method ?? "Forma de pagamento não definida";
}

/* -------------------------------------------------------------------------- */
/*                          O QUE PRECISA DE ATENÇÃO                          */
/* -------------------------------------------------------------------------- */

export type AttentionAction =
  | { type: "filter_overdue" }
  | { type: "open_cards" }
  | { type: "open_subscriptions" }
  | { type: "open_statement"; cardId: string }
  | { type: "open_statement_difference"; cardId: string };

/** Domínio de origem do alerta — o usuário precisa saber para onde vai. */
export type AttentionDomain = "accounts" | "cards" | "subscriptions";

export const ATTENTION_DOMAIN_LABELS: Record<AttentionDomain, string> = {
  accounts: "Contas a pagar",
  cards: "Cartões e faturas",
  subscriptions: "Assinaturas e ferramentas",
};

export interface AttentionInsight {
  id: string;
  tone: StatusTone;
  title: string;
  detail?: string;
  domain?: AttentionDomain;
  actionLabel?: string;
  action?: AttentionAction;
}


export interface AttentionParams {
  rows: MonthRow[];
  statements: StatementGroup[];
  today: string;
  cardsById: Map<string, FinanceItem>;
}

/**
 * Interpreta o mês para o usuário. Só devolve o que existe de verdade.
 * Nunca conta cobrança de cartão como conta direta atrasada.
 */
export function buildAttentionInsights(params: AttentionParams): AttentionInsight[] {
  const { rows, statements, today, cardsById } = params;
  const ctx: RowStatusContext = { rows, today, cardsById };
  const operational = rows.filter((r) => !isStatementRow(r));
  const insights: AttentionInsight[] = [];

  // 1. Contas DIRETAS atrasadas — separadas por domínio de origem
  const overdue = overdueDirectRows(operational, ctx);
  const overdueAccounts = overdue.filter(isAccountsDomainRow);
  const overdueSubscriptions = overdue.filter((r) => isSubscriptionsDomainItem(r.item));

  if (overdueAccounts.length > 0) {
    const total = overdueAccounts.reduce((sum, r) => sum + (r.amountBrl ?? 0), 0);
    insights.push({
      id: "overdue",
      tone: "danger",
      domain: "accounts",
      title:
        overdueAccounts.length === 1
          ? "1 conta está atrasada"
          : `${overdueAccounts.length} contas estão atrasadas`,
      detail: formatBRL(Number(total.toFixed(2))),
      actionLabel: "Ver contas atrasadas",
      action: { type: "filter_overdue" },
    });
  }

  if (overdueSubscriptions.length > 0) {
    const total = overdueSubscriptions.reduce((sum, r) => sum + (r.amountBrl ?? 0), 0);
    insights.push({
      id: "overdue-subscriptions",
      tone: "danger",
      domain: "subscriptions",
      title:
        overdueSubscriptions.length === 1
          ? "1 assinatura paga direto está vencida"
          : `${overdueSubscriptions.length} assinaturas pagas direto estão vencidas`,
      detail: formatBRL(Number(total.toFixed(2))),
      actionLabel: "Ver assinaturas",
      action: { type: "open_subscriptions" },
    });
  }

  // 2. Fatura de cartão atrasada ou próxima do vencimento
  for (const group of statements) {
    if (group.paid || !group.dueDate) continue;
    const diff = daysBetweenISO(today, group.dueDate);
    const amount = group.actualTotal ?? group.projectedTotal;
    const name = cardDisplayLabel(group.card);
    if (diff < 0) {
      insights.push({
        id: `statement-overdue-${group.card.id}`,
        tone: "danger",
        domain: "cards",
        title: `A fatura ${name} está atrasada`,
        detail: formatBRL(amount),
        actionLabel: "Ver fatura",
        action: { type: "open_statement", cardId: group.card.id },
      });
    } else if (diff <= 7) {
      insights.push({
        id: `statement-soon-${group.card.id}`,
        tone: "warning",
        domain: "cards",
        title:
          diff === 0
            ? `A fatura ${name} vence hoje`
            : diff === 1
              ? `A fatura ${name} vence amanhã`
              : `A fatura ${name} vence em ${diff} dias`,
        detail: formatBRL(amount),
        actionLabel: "Ver fatura",
        action: { type: "open_statement", cardId: group.card.id },
      });
    }
  }

  // 3. Próximo vencimento direto de conta
  const nextDirect = operational
    .filter(isAccountsDomainRow)
    .filter((row) => {
      const status = resolveRowStatus(row, ctx);
      return status.kind !== "paid" && !!(row.dueDate ?? row.chargeDate);
    })
    .filter((row) => (row.dueDate ?? row.chargeDate)! >= today)
    .sort((a, b) => (a.dueDate ?? a.chargeDate)!.localeCompare((b.dueDate ?? b.chargeDate)!))[0];
  if (nextDirect) {
    const ref = (nextDirect.dueDate ?? nextDirect.chargeDate)!;
    insights.push({
      id: "next-direct",
      tone: "neutral",
      domain: "accounts",
      title: `Próximo vencimento: ${nextDirect.item.name}`,
      detail: `${formatDayMonth(ref)} · ${formatBRL(nextDirect.amountBrl)}`,
      actionLabel: "Ver contas",
      action: { type: "filter_overdue" },
    });
  }

  // 4. Cartões sem fechamento/vencimento — problema do CARTÃO, não do lançamento
  const incomplete = statements.filter((g) => g.configIncomplete);
  if (incomplete.length > 0) {
    insights.push({
      id: "cards-config",
      tone: "warning",
      domain: "cards",
      title:
        incomplete.length === 1
          ? `Faltam dados da fatura em ${cardDisplayLabel(incomplete[0].card)}`
          : `${incomplete.length} cartões estão sem dados da fatura`,
      detail: incomplete
        .map((g) => `${cardDisplayLabel(g.card)}: ${cycleGapLabel(g.card) ?? ""}`)
        .join(" · "),
      actionLabel: "Completar cartões",
      action: { type: "open_cards" },
    });
  }

  // 5. Diferença de fatura a classificar
  for (const group of statements) {
    if (group.configIncomplete || group.difference == null) continue;
    if (Math.abs(group.difference) < 0.01) continue;
    insights.push({
      id: `difference-${group.card.id}`,
      tone: "warning",
      domain: "cards",
      title: `Há ${formatBRL(group.difference)} de diferença na fatura ${cardDisplayLabel(group.card)}`,
      detail: "Classifique a diferença para fechar a composição.",
      actionLabel: "Ver composição",
      action: { type: "open_statement_difference", cardId: group.card.id },
    });
  }

  // 6. Duplicidade de ferramenta já incluída em pacote
  return insights;
}


/** Mensagem quando não há nada crítico no mês. */
export const ALL_CLEAR_MESSAGE = "Tudo certo por enquanto. Não há contas atrasadas.";
