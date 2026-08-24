/**
 * Mecanismo do Financeiro.
 *
 * Princípios:
 * - `finance_items` é o cadastro permanente; `finance_occurrences` são os fatos do mês.
 * - Meses futuros são PROJETADOS a partir do cadastro (nunca pré-criados no banco).
 * - A fatura do cartão (`kind = 'card'`) é saída de caixa/agrupamento e NUNCA
 *   é somada junto com as despesas que a compõem.
 * - `included_resource` não gera ocorrência nem custo próprio.
 */

import {
  Competence,
  addMonths,
  candidateChargeCompetences,
  competenceFromISO,
  competenceToISO,
  dateInMonth,
  normalizeCompetence,
  resolveStatementForCharge,
  sameCompetence,
} from "./financeCardCycle";

export type FinanceKind = "expense" | "tool" | "package" | "card" | "included_resource";
export type FinanceCostCenter = "midia" | "sistemas" | "administrativo" | "compartilhado";
export type FinanceRecurrence =
  | "one_off"
  | "monthly"
  | "annual"
  | "credits"
  | "variable"
  /** Prazo determinado: primeira parcela + quantidade total, termina sozinho. */
  | "installments";
export type FinanceCurrency = "BRL" | "USD";
/** Natureza do valor: previsível (`fixed`) ou por consumo (`variable`). */
export type FinanceAmountMode = "fixed" | "variable";

export interface FinanceItem {
  id: string;
  tenant_id?: string;
  kind: FinanceKind;
  name: string;
  purpose?: string | null;
  category?: string | null;
  cost_center: FinanceCostCenter;
  active: boolean;
  payment_method?: string | null;
  card_item_id?: string | null;
  bank_name?: string | null;
  card_last4?: string | null;
  /** Limite do cartão (somente `kind = 'card'`). NÃO é orçamento mensal. */
  card_limit_brl?: number | null;
  statement_closing_day?: number | null;
  statement_due_day?: number | null;

  currency: FinanceCurrency;
  default_amount_original?: number | null;
  default_exchange_rate?: number | null;
  default_amount_brl?: number | null;
  recurrence_type: FinanceRecurrence;
  /** Intervalo da recorrência em meses (1 = todo mês, 2 = a cada 2 meses...). */
  recurrence_interval_months?: number | null;
  /** Âncora da recorrência: define a partir de quando o intervalo é contado. */
  recurrence_start_date?: string | null;
  /** `fixed` = valor previsível; `variable` = consumo (valor só se confirma no mês). */
  amount_mode?: FinanceAmountMode | null;
  charge_day?: number | null;
  due_day?: number | null;
  subscription_date?: string | null;
  /** Âncora do cronograma parcelado (data da 1ª parcela). Só em `installments`. */
  installment_start_date?: string | null;
  /** Quantidade TOTAL de parcelas. Só em `installments`. */
  installment_count?: number | null;
  link?: string | null;
  parent_item_id?: string | null;
  notes?: string | null;
}

export interface FinanceOccurrence {
  id: string;
  tenant_id?: string;
  item_id: string;
  competence_month: string;
  charge_date?: string | null;
  due_date?: string | null;
  amount_original?: number | null;
  currency: FinanceCurrency;
  exchange_rate?: number | null;
  amount_brl?: number | null;
  is_estimated?: boolean;
  statement_occurrence_id?: string | null;
  paid_at?: string | null;
  paid_amount_brl?: number | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  observations?: string | null;
  legacy_bill_id?: string | null;
  /** Forma de pagamento DESTE mês. Quando presente, prevalece sobre o cadastro. */
  payment_method_snapshot?: string | null;
  /** Cartão usado NESTE mês. Quando presente, prevalece sobre o cadastro. */
  card_item_id_snapshot?: string | null;
  /** Competência da fatura em que esta cobrança caiu (histórico). */
  statement_competence_snapshot?: string | null;
}

/** Uma linha do mês: ocorrência real persistida ou projeção do cadastro. */
export interface MonthRow {
  key: string;
  item: FinanceItem;
  occurrence: FinanceOccurrence | null;
  /** `true` quando a linha ainda não existe no banco (projeção). */
  projected: boolean;
  amountBrl: number | null;
  amountOriginal: number | null;
  currency: FinanceCurrency;
  exchangeRate: number | null;
  chargeDate: string | null;
  dueDate: string | null;
  paid: boolean;
  paidAmountBrl: number | null;
  /** Cartão em que a despesa é cobrada, quando houver (snapshot > cadastro). */
  cardItemId: string | null;
  /** Forma de pagamento efetiva do mês (snapshot > cadastro). */
  paymentMethod: string | null;
  /** `true` quando a forma de pagamento do mês difere do cadastro permanente. */
  paymentOverridden: boolean;
  /** `true` quando o valor é apenas referência (créditos/variável sem fato). */
  estimated: boolean;
  /** Apresentação: número desta parcela (nunca persistido). */
  installmentNumber: number | null;
  /** Apresentação: total de parcelas do cronograma (nunca persistido). */
  installmentCount: number | null;
}


export const COST_CENTER_LABELS: Record<FinanceCostCenter, string> = {
  midia: "Mídia",
  sistemas: "Sistemas",
  administrativo: "Administrativo",
  compartilhado: "Compartilhado",
};

export const KIND_LABELS: Record<FinanceKind, string> = {
  expense: "Conta/Despesa",
  tool: "Ferramenta",
  package: "Pacote",
  card: "Cartão",
  included_resource: "Recurso incluído",
};

export const RECURRENCE_LABELS: Record<FinanceRecurrence, string> = {
  one_off: "Avulso",
  monthly: "Mensal",
  annual: "Anual",
  credits: "Créditos",
  variable: "Variável",
  installments: "Parcelado",
};

export const PAYMENT_METHODS = [
  "Pix",
  "Boleto",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "Dinheiro",
] as const;

export const CARD_PAYMENT_METHOD = "Cartão de Crédito";

/* -------------------------------------------------------------------------- */
/*                            IDENTIDADE DO CARTÃO                            */
/* -------------------------------------------------------------------------- */

/** Rótulo humano do cartão: `Itaú ••••7587`. Nunca expõe UUID. */
export function cardDisplayLabel(card: FinanceItem | null | undefined): string {
  if (!card) return "Cartão";
  const last4 = (card.card_last4 ?? "").trim();
  const name = (card.name ?? "").trim() || "Cartão";
  if (!last4 || name.includes(last4)) return name;
  return `${name} ••••${last4}`;
}

export type CardCycleGap = "closing" | "due";

/** Quais dados do CICLO da fatura faltam no cadastro do cartão. */
export function missingCycleFields(card: FinanceItem | null | undefined): CardCycleGap[] {
  if (!card) return ["closing", "due"];
  const gaps: CardCycleGap[] = [];
  if (card.statement_closing_day == null) gaps.push("closing");
  if (card.statement_due_day == null) gaps.push("due");
  return gaps;
}

/** Frase explícita do que falta no ciclo — ou `null` quando está completo. */
export function cycleGapLabel(card: FinanceItem | null | undefined): string | null {
  const gaps = missingCycleFields(card);
  if (gaps.length === 0) return null;
  if (gaps.length === 2) return "Faltam fechamento e vencimento";
  return gaps[0] === "closing" ? "Falta informar o fechamento" : "Falta informar o vencimento";
}

/** Itens que nunca geram custo/ocorrência por si só. */
export function isCostBearing(item: FinanceItem): boolean {
  return item.kind !== "included_resource";
}


/** Converte valor para BRL usando o câmbio disponível. */
export function toBrl(params: {
  currency: FinanceCurrency;
  amountOriginal: number | null | undefined;
  amountBrl: number | null | undefined;
  exchangeRate: number | null | undefined;
  fallbackRate: number | null | undefined;
}): number | null {
  const { currency, amountOriginal, amountBrl, exchangeRate, fallbackRate } = params;
  if (amountBrl != null) return amountBrl;
  if (currency === "USD" && amountOriginal != null) {
    const rate = exchangeRate ?? fallbackRate;
    if (rate != null) return Number((amountOriginal * rate).toFixed(2));
  }
  return amountOriginal ?? null;
}

/* -------------------------------------------------------------------------- */
/*                    PARCELAMENTO / PRAZO DETERMINADO                        */
/* -------------------------------------------------------------------------- */

/** O cadastro é um parcelamento com cronograma válido? */
export function isInstallmentItem(item: FinanceItem): boolean {
  return (
    item.recurrence_type === "installments" &&
    !!item.installment_start_date &&
    item.installment_count != null &&
    item.installment_count > 0
  );
}

/** Diferença inteira de meses entre a 1ª parcela e a competência informada. */
export function installmentMonthOffset(item: FinanceItem, competence: Competence): number | null {
  if (!item.installment_start_date) return null;
  const start = competenceFromISO(item.installment_start_date);
  const current = normalizeCompetence(competence);
  return (current.year - start.year) * 12 + (current.month - start.month);
}

/** Número da parcela desta competência (1-based) ou `null` fora do cronograma. */
export function installmentNumberForCompetence(
  item: FinanceItem,
  competence: Competence,
): number | null {
  if (!isInstallmentItem(item)) return null;
  const offset = installmentMonthOffset(item, competence);
  if (offset == null || offset < 0) return null;
  if (offset >= (item.installment_count as number)) return null;
  return offset + 1;
}

/** Data prevista da parcela desta competência (respeitando meses curtos). */
export function installmentDateForCompetence(
  item: FinanceItem,
  competence: Competence,
): string | null {
  if (installmentNumberForCompetence(item, competence) == null) return null;
  const day = Number((item.installment_start_date as string).slice(8, 10));
  return dateInMonth(competence, day);
}

/** Última data prevista = 1ª parcela + (total - 1) meses. */
export function installmentEndDate(item: FinanceItem): string | null {
  if (!isInstallmentItem(item)) return null;
  const start = competenceFromISO(item.installment_start_date as string);
  const day = Number((item.installment_start_date as string).slice(8, 10));
  return dateInMonth(addMonths(start, (item.installment_count as number) - 1), day);
}

/** `Parcela 6 de 12`. */
export function installmentLabel(
  number: number | null | undefined,
  count: number | null | undefined,
): string | null {
  if (number == null || count == null) return null;
  return `Parcela ${number} de ${count}`;
}

/** Rótulo de parcela de uma linha do mês, quando aplicável. */
export function installmentRowLabel(row: MonthRow): string | null {
  return installmentLabel(row.installmentNumber, row.installmentCount);
}

/** A parcela é cobrada no cartão (componente de fatura)? */
function billedOnCard(item: FinanceItem): boolean {
  return !!item.card_item_id || item.payment_method === CARD_PAYMENT_METHOD;
}

/* -------------------------------------------------------------------------- */
/*              SNAPSHOTS DE PAGAMENTO (histórico por ocorrência)             */
/* -------------------------------------------------------------------------- */

/**
 * Forma de pagamento que valeu no mês. O snapshot da ocorrência PREVALECE
 * sobre o cadastro — assim mudar o cartão hoje não reescreve o passado.
 */
export function effectivePaymentMethod(
  item: FinanceItem,
  occ: FinanceOccurrence | null | undefined,
): string | null {
  if (occ?.payment_method_snapshot != null) return occ.payment_method_snapshot;
  if (occ?.card_item_id_snapshot) return CARD_PAYMENT_METHOD;
  return item.payment_method ?? null;
}

/** Cartão que valeu no mês (snapshot > cadastro). */
export function effectiveCardItemId(
  item: FinanceItem,
  occ: FinanceOccurrence | null | undefined,
): string | null {
  if (occ?.card_item_id_snapshot) return occ.card_item_id_snapshot;
  if (occ?.payment_method_snapshot != null) {
    // Snapshot explícito sem cartão = pagamento direto naquele mês.
    return occ.payment_method_snapshot === CARD_PAYMENT_METHOD ? item.card_item_id ?? null : null;
  }
  return item.card_item_id ?? null;
}

/* -------------------------------------------------------------------------- */
/*                       RECORRÊNCIA COM INTERVALO PRÓPRIO                     */
/* -------------------------------------------------------------------------- */

/** Intervalo em meses da recorrência (1 quando não informado). */
export function recurrenceIntervalMonths(item: FinanceItem): number {
  const raw = item.recurrence_interval_months;
  return raw != null && raw > 0 ? Math.trunc(raw) : 1;
}

/** Âncora usada para contar o intervalo (início da recorrência). */
export function recurrenceAnchorDate(item: FinanceItem): string | null {
  return item.recurrence_start_date ?? item.subscription_date ?? null;
}

/**
 * Para intervalos > 1 mês: a competência cai em um ciclo válido?
 * Sem âncora cadastrada, o item volta a aparecer todo mês (nunca desaparece
 * silenciosamente por falta de dado).
 */
export function matchesRecurrenceInterval(item: FinanceItem, competence: Competence): boolean {
  const interval = recurrenceIntervalMonths(item);
  if (interval <= 1) return true;
  const anchor = recurrenceAnchorDate(item);
  if (!anchor) return true;
  const start = competenceFromISO(anchor);
  const current = normalizeCompetence(competence);
  const offset = (current.year - start.year) * 12 + (current.month - start.month);
  if (offset < 0) return false;
  return offset % interval === 0;
}

/** O cadastro deve aparecer no mês informado mesmo sem ocorrência persistida? */
export function isProjectableInMonth(item: FinanceItem, competence: Competence): boolean {
  if (!item.active || !isCostBearing(item)) return false;
  switch (item.recurrence_type) {
    case "monthly":
    case "credits":
    case "variable":
      return matchesRecurrenceInterval(item, competence);
    case "annual": {
      if (!item.subscription_date) return false;
      const month = Number(item.subscription_date.slice(5, 7));
      return month === competence.month;
    }
    case "installments":
      // O cronograma encerra a projeção sozinho, mesmo com `active = true`.
      return installmentNumberForCompetence(item, competence) != null;
    case "one_off":
    default:
      return false;
  }
}

function projectedDates(item: FinanceItem, competence: Competence) {
  if (item.recurrence_type === "installments") {
    const date = installmentDateForCompetence(item, competence);
    // No cartão a parcela é COBRANÇA; quem vence é a fatura.
    if (billedOnCard(item)) return { chargeDate: date, dueDate: null };
    return { chargeDate: null, dueDate: date };
  }
  const chargeDate = item.charge_day != null ? dateInMonth(competence, item.charge_day) : null;
  const dueDate = item.due_day != null ? dateInMonth(competence, item.due_day) : null;
  return { chargeDate, dueDate };
}

function rowFromOccurrence(
  item: FinanceItem,
  occ: FinanceOccurrence,
  fallbackRate: number | null,
): MonthRow {
  const amountBrl = toBrl({
    currency: occ.currency ?? item.currency,
    amountOriginal: occ.amount_original,
    amountBrl: occ.amount_brl,
    exchangeRate: occ.exchange_rate,
    fallbackRate,
  });
  return {
    key: `occ:${occ.id}`,
    item,
    occurrence: occ,
    projected: false,
    amountBrl,
    amountOriginal: occ.amount_original ?? null,
    currency: (occ.currency ?? item.currency) as FinanceCurrency,
    exchangeRate: occ.exchange_rate ?? null,
    chargeDate: occ.charge_date ?? null,
    dueDate: occ.due_date ?? null,
    paid: !!occ.paid_at,
    paidAmountBrl: occ.paid_amount_brl ?? null,
    cardItemId: effectiveCardItemId(item, occ),
    paymentMethod: effectivePaymentMethod(item, occ),
    paymentOverridden:
      occ.payment_method_snapshot != null &&
      occ.payment_method_snapshot !== (item.payment_method ?? null),
    estimated: !!occ.is_estimated,
    installmentNumber: installmentNumberForCompetence(
      item,
      competenceFromISO(occ.competence_month),
    ),
    installmentCount: isInstallmentItem(item) ? item.installment_count ?? null : null,
  };
}

function rowFromProjection(
  item: FinanceItem,
  competence: Competence,
  fallbackRate: number | null,
): MonthRow {
  const { chargeDate, dueDate } = projectedDates(item, competence);
  const amountBrl = toBrl({
    currency: item.currency,
    amountOriginal: item.default_amount_original,
    amountBrl: item.default_amount_brl,
    exchangeRate: item.default_exchange_rate,
    fallbackRate,
  });
  const estimated =
    item.recurrence_type === "credits" ||
    item.recurrence_type === "variable" ||
    item.amount_mode === "variable" ||
    amountBrl == null;
  return {
    key: `proj:${item.id}:${competenceToISO(competence)}`,
    item,
    occurrence: null,
    projected: true,
    amountBrl,
    amountOriginal: item.default_amount_original ?? null,
    currency: item.currency,
    exchangeRate: item.default_exchange_rate ?? fallbackRate ?? null,
    chargeDate,
    dueDate,
    paid: false,
    paidAmountBrl: null,
    cardItemId: item.card_item_id ?? null,
    paymentMethod: item.payment_method ?? null,
    paymentOverridden: false,
    estimated,
    installmentNumber: installmentNumberForCompetence(item, competence),
    installmentCount: isInstallmentItem(item) ? item.installment_count ?? null : null,
  };
}

/**
 * Constrói as linhas do mês combinando ocorrências reais e projeções.
 * Nunca cria nada no banco.
 */
export function buildMonthRows(params: {
  items: FinanceItem[];
  occurrences: FinanceOccurrence[];
  competence: Competence;
  fallbackRate?: number | null;
}): MonthRow[] {
  const { items, occurrences, competence } = params;
  const fallbackRate = params.fallbackRate ?? null;
  const competenceISO = competenceToISO(competence);
  const byItem = new Map<string, FinanceOccurrence>();
  for (const occ of occurrences) {
    if (occ.competence_month !== competenceISO) continue;
    byItem.set(occ.item_id, occ);
  }

  const rows: MonthRow[] = [];
  for (const item of items) {
    if (!isCostBearing(item)) continue;
    const occ = byItem.get(item.id);
    if (occ) {
      rows.push(rowFromOccurrence(item, occ, fallbackRate));
    } else if (isProjectableInMonth(item, competence)) {
      rows.push(rowFromProjection(item, competence, fallbackRate));
    }
  }
  return rows.sort((a, b) => {
    const da = a.dueDate ?? a.chargeDate ?? "9999-99-99";
    const db = b.dueDate ?? b.chargeDate ?? "9999-99-99";
    if (da !== db) return da.localeCompare(db);
    return a.item.name.localeCompare(b.item.name, "pt-BR");
  });
}

/* -------------------------------------------------------------------------- */
/*                                   TOTAIS                                   */
/* -------------------------------------------------------------------------- */

export interface MonthTotals {
  /** Despesas previstas do mês (SEM faturas de cartão). */
  expected: number;
  paid: number;
  open: number;
  toolsAndAi: number;
  /** Total das faturas de cartão do mês (saída de caixa, não é despesa nova). */
  statements: number;
}

export function isStatementRow(row: MonthRow): boolean {
  return row.item.kind === "card";
}

/** Uma despesa no cartão herda o status de pagamento da fatura vinculada. */
function rowIsPaid(row: MonthRow, statementPaidById: Map<string, boolean>): boolean {
  if (row.paid) return true;
  const statementId = row.occurrence?.statement_occurrence_id ?? null;
  if (statementId && statementPaidById.get(statementId)) return true;
  return false;
}

export function computeTotals(rows: MonthRow[]): MonthTotals {
  const statementPaidById = new Map<string, boolean>();
  for (const row of rows) {
    if (isStatementRow(row) && row.occurrence) {
      statementPaidById.set(row.occurrence.id, row.paid);
    }
  }

  let expected = 0;
  let paid = 0;
  let open = 0;
  let toolsAndAi = 0;
  let statements = 0;

  for (const row of rows) {
    const value = row.amountBrl ?? 0;
    if (isStatementRow(row)) {
      statements += value;
      continue; // fatura nunca entra nas despesas
    }
    expected += value;
    if (row.item.kind === "tool" || row.item.kind === "package") toolsAndAi += value;
    if (rowIsPaid(row, statementPaidById)) paid += row.paidAmountBrl ?? value;
    else open += value;
  }

  const round = (n: number) => Number(n.toFixed(2));
  return {
    expected: round(expected),
    paid: round(paid),
    open: round(open),
    toolsAndAi: round(toolsAndAi),
    statements: round(statements),
  };
}

/** Status efetivo de pagamento considerando a fatura do cartão. */
export function effectivePaid(row: MonthRow, rows: MonthRow[]): boolean {
  if (row.paid) return true;
  const statementId = row.occurrence?.statement_occurrence_id ?? null;
  if (!statementId) return false;
  return rows.some((r) => isStatementRow(r) && r.occurrence?.id === statementId && r.paid);
}

/* -------------------------------------------------------------------------- */
/*                            FATURAS / COMPOSIÇÃO                            */
/* -------------------------------------------------------------------------- */

export interface StatementGroup {
  card: FinanceItem;
  /** Linha da fatura no mês (ocorrência real ou projeção). */
  statementRow: MonthRow | null;
  components: MonthRow[];
  /** Soma dos componentes conhecidos. */
  projectedTotal: number;
  /** Valor real informado na fatura, quando houver. */
  actualTotal: number | null;
  /** actualTotal - projectedTotal (quando ambos existem). */
  difference: number | null;
  configIncomplete: boolean;
  incompleteReason: string | null;
  dueDate: string | null;
  closingDate: string | null;
  paid: boolean;
}

/**
 * Monta os grupos de fatura do mês.
 * Quando o cartão tem fechamento/vencimento cadastrados, as cobranças são
 * alocadas pelo ciclo real; caso contrário caem na própria competência e o
 * cartão é sinalizado como configuração incompleta.
 */
export function buildStatementGroups(params: {
  items: FinanceItem[];
  occurrences: FinanceOccurrence[];
  competence: Competence;
  fallbackRate?: number | null;
}): StatementGroup[] {
  const { items, occurrences, competence } = params;
  const fallbackRate = params.fallbackRate ?? null;
  const cards = items.filter((i) => i.kind === "card");
  const currentRows = buildMonthRows({ items, occurrences, competence, fallbackRate });

  return cards.map((card) => {
    const cycle = { closingDay: card.statement_closing_day, dueDay: card.statement_due_day };
    const configIncomplete = card.statement_closing_day == null || card.statement_due_day == null;

    // Snapshots podem mover uma cobrança para outro cartão no mês: por isso o
    // recorte do mês anterior parte de TODOS os itens e filtra por `cardItemId`.
    const cardItems = items.filter((i) => isCostBearing(i));
    const components: MonthRow[] = [];

    if (configIncomplete) {
      for (const row of currentRows) {
        if (row.cardItemId === card.id) components.push(row);
      }
    } else {
      for (const chargeCompetence of candidateChargeCompetences(competence)) {
        const monthRows = sameCompetence(chargeCompetence, competence)
          ? currentRows
          : buildMonthRows({ items: cardItems, occurrences, competence: chargeCompetence, fallbackRate });
        for (const row of monthRows) {
          if (row.cardItemId !== card.id) continue;
          const chargeDay =
            row.chargeDate != null ? Number(row.chargeDate.slice(8, 10)) : row.item.charge_day ?? null;
          const resolved = resolveStatementForCharge({ chargeDay, competence: chargeCompetence, card: cycle });
          if (resolved.incomplete || !resolved.statementCompetence) continue;
          if (!sameCompetence(resolved.statementCompetence, competence)) continue;
          if (components.some((c) => c.key === row.key)) continue;
          components.push(row);
        }
      }
    }

    const statementRow = currentRows.find((r) => r.item.id === card.id) ?? null;
    const projectedTotal = Number(
      components.reduce((sum, row) => sum + (row.amountBrl ?? 0), 0).toFixed(2),
    );
    const actualTotal = statementRow?.occurrence?.amount_brl ?? null;
    const difference = actualTotal != null ? Number((actualTotal - projectedTotal).toFixed(2)) : null;

    const projection = resolveStatementForCharge({
      chargeDay: card.statement_closing_day ?? 1,
      competence,
      card: cycle,
    });

    return {
      card,
      statementRow,
      components: components.sort((a, b) =>
        (a.chargeDate ?? "").localeCompare(b.chargeDate ?? "") || a.item.name.localeCompare(b.item.name, "pt-BR"),
      ),
      projectedTotal,
      actualTotal,
      difference,
      configIncomplete,
      incompleteReason: configIncomplete ? projection.reason : null,
      dueDate:
        statementRow?.dueDate ??
        (card.statement_due_day != null ? dateInMonth(competence, card.statement_due_day) : null),
      closingDate:
        card.statement_closing_day != null ? dateInMonth(competence, card.statement_closing_day) : null,
      paid: !!statementRow?.paid,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                                  FILTROS                                   */
/* -------------------------------------------------------------------------- */

export type QuickFilter =
  | "all"
  | "today"
  | "tomorrow"
  | "overdue"
  | "next7"
  | "paid"
  | "recurring";

export const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "overdue", label: "Atrasadas" },
  { value: "next7", label: "Próximos 7 dias" },
  { value: "paid", label: "Pagas" },
  { value: "recurring", label: "Recorrentes" },
];

export const QUICK_FILTER_VALUES = QUICK_FILTERS.map((f) => f.value);

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function applyQuickFilter(rows: MonthRow[], filter: QuickFilter, todayISO: string): MonthRow[] {
  if (filter === "all") return rows;
  const tomorrow = addDaysISO(todayISO, 1);
  const in7 = addDaysISO(todayISO, 7);

  return rows.filter((row) => {
    const paid = effectivePaid(row, rows);
    const ref = row.dueDate ?? row.chargeDate;
    switch (filter) {
      case "today":
        return ref === todayISO;
      case "tomorrow":
        return ref === tomorrow;
      case "overdue":
        return !paid && !!ref && ref < todayISO;
      case "next7":
        return !!ref && ref >= todayISO && ref <= in7;
      case "paid":
        return paid;
      case "recurring":
        return row.item.recurrence_type !== "one_off";
      default:
        return true;
    }
  });
}

export function filterByCostCenter(rows: MonthRow[], costCenter: string): MonthRow[] {
  if (!costCenter || costCenter === "all") return rows;
  return rows.filter((row) => row.item.cost_center === costCenter);
}

export function filterByKind(rows: MonthRow[], kind: string): MonthRow[] {
  if (!kind || kind === "all") return rows;
  return rows.filter((row) => row.item.kind === kind);
}

/* -------------------------------------------------------------------------- */
/*                       DUPLICIDADE COM PACOTES ATIVOS                       */
/* -------------------------------------------------------------------------- */

const IGNORED_NAME_TOKENS = new Set(["pro", "plus", "premium", "subscription", "assinatura", "api"]);

/** Normaliza o nome para comparar ferramenta paga x recurso incluído. */
export function normalizeToolName(name: string): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !IGNORED_NAME_TOKENS.has(token))
    .join(" ")
    .trim();
}

/**
 * Detecta ferramentas pagas diretamente que também estão incluídas em algum
 * pacote ativo. Só informa — nunca cancela nada.
 */
export function detectPackageOverlaps(items: FinanceItem[]): Map<string, string[]> {
  const packages = new Map<string, FinanceItem>();
  for (const item of items) {
    if (item.kind === "package") packages.set(item.id, item);
  }

  const includedByName = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.kind !== "included_resource" || !item.parent_item_id) continue;
    const pkg = packages.get(item.parent_item_id);
    if (!pkg || !pkg.active) continue;
    const key = normalizeToolName(item.name);
    if (!key) continue;
    if (!includedByName.has(key)) includedByName.set(key, new Set());
    includedByName.get(key)!.add(pkg.name);
  }

  const result = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== "tool" || !item.active) continue;
    const key = normalizeToolName(item.name);
    const hit = includedByName.get(key);
    if (hit && hit.size > 0) result.set(item.id, Array.from(hit));
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*                                FORMATAÇÃO                                  */
/* -------------------------------------------------------------------------- */

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatCurrencyValue(
  value: number | null | undefined,
  currency: FinanceCurrency,
): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency });
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
