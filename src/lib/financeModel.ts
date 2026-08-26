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
  chargeDateCompetence,
  chargeDayFrom,
  competenceFromISO,
  competenceToISO,
  dateInMonth,
  normalizeCompetence,
  resolveStatementForCharge,
  sameCompetence,
} from "./financeCardCycle";
import {
  type FinanceRecurrenceRule,
  scheduleIdentity,
  scheduledDatesInMonth,
} from "./financeRecurrenceSchedule";


export type FinanceKind = "expense" | "tool" | "package" | "card" | "included_resource";
export type FinanceCostCenter = "midia" | "sistemas" | "administrativo" | "compartilhado";
export type FinanceRecurrence =
  | "one_off"
  | "monthly"
  | "annual"
  | "credits"
  | "variable"
  /** Prazo determinado: primeira parcela + quantidade total, termina sozinho. */
  | "installments"
  /** Recorrência sub-mensal: gera mais de um lançamento no mesmo mês. */
  | "daily"
  | "weekly";

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
  /**
   * Intervalo GENÉRICO da recorrência ("a cada N dias/semanas/meses").
   * Canônico para `daily`/`weekly`; em mensal espelha `recurrence_interval_months`.
   */
  recurrence_interval?: number | null;
  /** Dia padrão da semana em ISO (1 = segunda ... 7 = domingo). Só `weekly`. */
  recurrence_weekday?: number | null;
  /** Âncora genérica do cronograma (a partir de quando o intervalo é contado). */
  recurrence_anchor_date?: string | null;
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
  /**
   * IDENTIDADE do lançamento recorrente: a data ORIGINALMENTE agendada pelo
   * cronograma. Mover a data efetiva (`due_date`/`charge_date`) não muda a
   * identidade nem cria uma segunda ocorrência. `null` em faturas e legado.
   */
  scheduled_date?: string | null;
  /** Ocorrência ignorada (exceção): sai do mês sem apagar a trilha. */
  skipped_at?: string | null;
  skip_reason?: string | null;
  skipped_by?: string | null;
  restored_at?: string | null;

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
  /**
   * Repasse de IOF cobrado pelo banco junto com a FATURA (só faz sentido na
   * ocorrência da fatura). Cifrado no banco como os demais valores.
   */
  iof_amount_brl?: number | null;
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
  /**
   * Data ORIGINALMENTE agendada pelo cronograma (identidade da ocorrência).
   * `null` em linhas mensais/anuais/parceladas, faturas e legado.
   */
  scheduledDate: string | null;
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
  daily: "Diária",
  weekly: "Semanal",

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

/**
 * Intervalo em meses da recorrência mensal (1 quando não informado).
 * `recurrence_interval_months` continua a fonte histórica; o intervalo genérico
 * é aceito como equivalente para cadastros criados pelo novo formulário.
 */
export function recurrenceIntervalMonths(item: FinanceItem): number {
  const raw = item.recurrence_interval_months ?? item.recurrence_interval;
  return raw != null && raw > 0 ? Math.trunc(raw) : 1;
}

/** Âncora usada para contar o intervalo (início da recorrência). */
export function recurrenceAnchorDate(item: FinanceItem): string | null {
  return (
    item.recurrence_start_date ?? item.recurrence_anchor_date ?? item.subscription_date ?? null
  );
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
export function isProjectableInMonth(
  item: FinanceItem,
  competence: Competence,
  rules?: FinanceRecurrenceRule[],
): boolean {
  if (!item.active || !isCostBearing(item)) return false;
  switch (item.recurrence_type) {
    case "monthly":
    case "credits":
    case "variable":
      return matchesRecurrenceInterval(item, competence);
    case "daily":
    case "weekly":
      // O cronograma sub-mensal decide sozinho quantas linhas o mês tem.
      return scheduledDatesInMonth({ item, rules, competence }).length > 0;
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

/**
 * O item tem valor PREVISÍVEL (fixo)? Consumo/créditos/variável não são fixos:
 * neles o valor só existe quando o fato do mês é registrado.
 */
export function hasFixedAmount(item: FinanceItem): boolean {
  if (item.amount_mode === "variable") return false;
  return item.recurrence_type !== "credits" && item.recurrence_type !== "variable";
}

function rowFromOccurrence(
  item: FinanceItem,
  occ: FinanceOccurrence,
  fallbackRate: number | null,
): MonthRow {
  const currency = (occ.currency ?? item.currency) as FinanceCurrency;
  /** Valor REAL do fato do mês. `null` quando a ocorrência não tem valor. */
  const actualBrl = toBrl({
    currency,
    amountOriginal: occ.amount_original,
    amountBrl: occ.amount_brl,
    exchangeRate: occ.exchange_rate,
    fallbackRate,
  });

  /**
   * Ocorrência de item FIXO sem valor não pode virar R$ 0: isso apagaria uma
   * conta existente dos totais. Nesse caso caímos no valor de referência do
   * cadastro e marcamos a linha como estimada — nunca como valor confirmado.
   * Consumo/créditos/variável NÃO herdam o default: lá o default é só palpite.
   */
  const useDefaultFallback = actualBrl == null && hasFixedAmount(item);
  const defaultBrl = useDefaultFallback
    ? toBrl({
        currency: item.currency,
        amountOriginal: item.default_amount_original,
        amountBrl: item.default_amount_brl,
        exchangeRate: item.default_exchange_rate,
        fallbackRate,
      })
    : null;
  const fellBack = useDefaultFallback && defaultBrl != null;
  const amountBrl = fellBack ? defaultBrl : actualBrl;

  return {
    key: `occ:${occ.id}`,
    item,
    occurrence: occ,
    projected: false,
    amountBrl,
    amountOriginal: occ.amount_original ?? (fellBack ? item.default_amount_original ?? null : null),
    currency: fellBack ? item.currency : currency,
    exchangeRate: occ.exchange_rate ?? (fellBack ? item.default_exchange_rate ?? null : null),
    chargeDate: occ.charge_date ?? null,
    dueDate: occ.due_date ?? null,
    paid: !!occ.paid_at,
    paidAmountBrl: occ.paid_amount_brl ?? null,
    cardItemId: effectiveCardItemId(item, occ),
    paymentMethod: effectivePaymentMethod(item, occ),
    paymentOverridden:
      occ.payment_method_snapshot != null &&
      occ.payment_method_snapshot !== (item.payment_method ?? null),
    estimated: !!occ.is_estimated || fellBack,
    installmentNumber: installmentNumberForCompetence(
      item,
      competenceFromISO(occ.competence_month),
    ),
    installmentCount: isInstallmentItem(item) ? item.installment_count ?? null : null,
    scheduledDate: occ.scheduled_date ?? null,
  };
}


function rowFromProjection(
  item: FinanceItem,
  competence: Competence,
  fallbackRate: number | null,
  /**
   * Data agendada pelo cronograma sub-mensal. Quando presente, ela é a data do
   * fato previsto (vencimento, ou cobrança quando o item cai no cartão) e faz
   * parte da chave da linha — é o que permite várias linhas no mesmo mês.
   */
  scheduledDate?: string | null,
): MonthRow {
  const base = projectedDates(item, competence);
  const onCard = billedOnCard(item);
  const chargeDate = scheduledDate ? (onCard ? scheduledDate : base.chargeDate) : base.chargeDate;
  const dueDate = scheduledDate ? (onCard ? null : scheduledDate) : base.dueDate;
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
    key: scheduledDate
      ? `proj:${item.id}:${scheduledDate}`
      : `proj:${item.id}:${competenceToISO(competence)}`,
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
    scheduledDate: scheduledDate ?? null,
  };
}

/** Ocorrência IGNORADA: exceção do mês, nunca uma linha do mês. */
export function isSkippedOccurrence(occ: FinanceOccurrence | null | undefined): boolean {
  return !!occ?.skipped_at;
}

/**
 * Constrói as linhas do mês combinando ocorrências reais e projeções.
 * Nunca cria nada no banco.
 *
 * Recorrência sub-mensal (diária/semanal) gera UMA LINHA POR DATA AGENDADA;
 * mensal/anual/parcelado/avulso seguem com no máximo uma linha por competência.
 * Ocorrências ignoradas não entram como linha nem voltam como projeção.
 */
export function buildMonthRows(params: {
  items: FinanceItem[];
  occurrences: FinanceOccurrence[];
  competence: Competence;
  fallbackRate?: number | null;
  /** Versões de regra de recorrência (histórico). Opcional. */
  rules?: FinanceRecurrenceRule[];
}): MonthRow[] {
  const { items, occurrences, competence } = params;
  const fallbackRate = params.fallbackRate ?? null;
  const rules = params.rules ?? [];
  const competenceISO = competenceToISO(competence);

  /** Ocorrências com identidade agendada (`item_id + scheduled_date`). */
  const byScheduled = new Map<string, FinanceOccurrence>();
  /** Ocorrências sem data agendada: faturas, avulsos, legado e mensais. */
  const byItem = new Map<string, FinanceOccurrence>();
  for (const occ of occurrences) {
    if (occ.competence_month !== competenceISO) continue;
    if (occ.scheduled_date) {
      byScheduled.set(scheduleIdentity(occ.item_id, occ.scheduled_date), occ);
    } else {
      byItem.set(occ.item_id, occ);
    }
  }

  const rows: MonthRow[] = [];
  const consumed = new Set<string>();

  for (const item of items) {
    if (!isCostBearing(item)) continue;

    // ---- Recorrência sub-mensal: uma linha por data agendada do cronograma.
    if (item.recurrence_type === "daily" || item.recurrence_type === "weekly") {
      const dates = item.active ? scheduledDatesInMonth({ item, rules, competence }) : [];
      for (const date of dates) {
        const identity = scheduleIdentity(item.id, date);
        const occ = byScheduled.get(identity);
        if (occ) {
          consumed.add(identity);
          // Ignorada: sai do mês inteiro (não vira linha nem volta a projetar).
          if (isSkippedOccurrence(occ)) continue;
          rows.push(rowFromOccurrence(item, occ, fallbackRate));
        } else {
          rows.push(rowFromProjection(item, competence, fallbackRate, date));
        }
      }
      // Fatos fora do cronograma atual (regra mudou depois): o fato manda.
      for (const [identity, occ] of byScheduled) {
        if (occ.item_id !== item.id || consumed.has(identity)) continue;
        consumed.add(identity);
        if (isSkippedOccurrence(occ)) continue;
        rows.push(rowFromOccurrence(item, occ, fallbackRate));
      }
      continue;
    }

    // ---- Demais naturezas: no máximo uma linha por competência (inalterado).
    const scheduledFallback = [...byScheduled.entries()].find(
      ([identity, occ]) => occ.item_id === item.id && !consumed.has(identity),
    );
    const occ = byItem.get(item.id) ?? scheduledFallback?.[1];
    if (scheduledFallback) consumed.add(scheduledFallback[0]);
    if (occ) {
      if (isSkippedOccurrence(occ)) continue;
      rows.push(rowFromOccurrence(item, occ, fallbackRate));
    } else if (isProjectableInMonth(item, competence, rules)) {
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

/** Exceção do mês: lançamento ignorado, com o cadastro de origem. */
export interface SkippedEntry {
  occurrence: FinanceOccurrence;
  item: FinanceItem;
  scheduledDate: string | null;
  reason: string | null;
}

/**
 * Ocorrências IGNORADAS da competência — para uma área discreta de exceções.
 * Elas nunca entram em previsto, aberto, composição, fatura ou alertas.
 */
export function skippedEntriesInMonth(params: {
  items: FinanceItem[];
  occurrences: FinanceOccurrence[];
  competence: Competence;
}): SkippedEntry[] {
  const competenceISO = competenceToISO(params.competence);
  const byId = new Map(params.items.map((i) => [i.id, i]));
  return params.occurrences
    .filter((occ) => occ.competence_month === competenceISO && isSkippedOccurrence(occ))
    .map((occ) => {
      const item = byId.get(occ.item_id);
      if (!item) return null;
      return {
        occurrence: occ,
        item,
        scheduledDate: occ.scheduled_date ?? occ.due_date ?? occ.charge_date ?? null,
        reason: occ.skip_reason ?? null,
      } satisfies SkippedEntry;
    })
    .filter((e): e is SkippedEntry => e !== null)
    .sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""));
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

/* -------------------------------------------------------------------------- */
/*                        OPERAÇÃO x HISTÓRICO (inativos)                     */
/* -------------------------------------------------------------------------- */

/**
 * REGRA CANÔNICA DE OPERAÇÃO: um cadastro `active = false` NÃO participa mais do
 * mês operacional (composição, KPIs, contas e despesas, assinaturas, filas e
 * alertas) enquanto PROJEÇÃO. O registro continua no banco para auditoria e
 * segue acessível no catálogo de cadastros — mas o mês não pode continuar
 * cobrando dele.
 *
 * EXCEÇÕES — fatos REAIS já persistidos nunca desaparecem da competência:
 * 1. FATURA de cartão inativo com ocorrência real (ver `financeCardVisibility`);
 * 2. AVULSO (`one_off`) inativo com ocorrência real: o master inativo é apenas o
 *    registro arquivado do gasto pontual (inclusive importações legadas); a
 *    ocorrência é o fato histórico/contábil da competência.
 *
 * Recorrentes inativos (monthly/annual/daily/weekly/installments/credits/
 * variable) seguem FORA do operacional mesmo com ocorrência, preservando a
 * supressão já decidida para cadastros encerrados.
 */
export function isOperationalRow(row: MonthRow): boolean {
  if (row.item.active) return true;
  if (!row.occurrence) return false;
  if (isStatementRow(row)) return true;
  return row.item.recurrence_type === "one_off";
}


/** Recorte operacional do mês — ponto único, nunca filtro por tela. */
export function operationalMonthRows(rows: MonthRow[]): MonthRow[] {
  return rows.filter(isOperationalRow);
}

/**
 * Índice de liquidação por fatura (ver `financeSettlement.ts`).
 * Tipado estruturalmente aqui para manter `financeModel` sem dependências.
 */
export interface SettlementIndexLike {
  paidComponentKeys: Set<string>;
}

/**
 * FATURA VINCULADA a um componente de cartão — prova JÁ PERSISTIDA.
 *
 * Duas provas válidas, nesta ordem:
 *  a) `statement_occurrence_id` (vínculo explícito);
 *  b) `statement_competence_snapshot` + cartão conhecido (histórico migrado).
 *
 * "Mesmo mês" NUNCA é prova: a cobrança pode cair na fatura seguinte.
 *
 * Esta é a MESMA função consultada por `effectivePaid` (contabilidade) e pela
 * apresentação (`financeRowStatus`), para que badge e recorte não divirjam.
 */
export function linkedStatementRowFor(
  row: MonthRow,
  statementRows: MonthRow[],
): MonthRow | null {
  const occ = row.occurrence;
  const statementId = occ?.statement_occurrence_id ?? null;
  if (statementId) {
    return statementRows.find((r) => r.occurrence?.id === statementId) ?? null;
  }
  const snapshot = occ?.statement_competence_snapshot ?? null;
  const cardId = occ?.card_item_id_snapshot ?? row.cardItemId ?? null;
  if (!snapshot || !cardId) return null;
  return (
    statementRows.find(
      (r) =>
        r.item.id === cardId &&
        !!r.occurrence &&
        r.occurrence.competence_month.slice(0, 10) === snapshot.slice(0, 10),
    ) ?? null
  );
}

/**
 * IOF de uma fatura PAGA (R$ > 0) — despesa real do mês cobrada pelo banco.
 *
 * Primitivo canônico: `financeIof.ts` (linha sintética) e `computeTotals`
 * consultam ESTA função, para que a composição e os KPIs nunca divirjam.
 */
export function paidStatementIofBrl(row: MonthRow): number {
  if (!isStatementRow(row) || !row.paid) return 0;
  const value = row.occurrence?.iof_amount_brl ?? null;
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Number(value.toFixed(2));
}

export function computeTotals(
  rows: MonthRow[],
  settlement?: SettlementIndexLike | null,
): MonthTotals {
  let expected = 0;
  let paid = 0;
  let open = 0;
  let toolsAndAi = 0;
  let statements = 0;

  for (const row of rows) {
    const value = row.amountBrl ?? 0;
    if (isStatementRow(row)) {
      statements += value;
      /**
       * A fatura em si nunca é despesa (duplicaria os componentes), MAS o
       * repasse de IOF é uma despesa adicional do mês, já liquidada no
       * pagamento. Entra uma única vez em `expected` e `paid` — nunca em
       * `open`, já que só existe depois do pagamento.
       */
      const iof = paidStatementIofBrl(row);
      if (iof > 0) {
        expected += iof;
        paid += iof;
      }
      continue;
    }
    expected += value;
    if (row.item.kind === "tool" || row.item.kind === "package") toolsAndAi += value;
    // MESMO booleano canônico usado por composição, filtros e badges.
    if (effectivePaid(row, rows, settlement)) paid += row.paidAmountBrl ?? value;
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


/**
 * AUTORIDADE ÚNICA de "pago" no Financeiro.
 *
 * Decide simultaneamente: entrada em `paid`/`open`, badge de pago, totais,
 * lista de Assinaturas e tools-only. Se esta função devolve `false`, nenhuma
 * camada de apresentação pode pintar semântica de pago.
 *
 * Provas aceitas: fato próprio (`paid_at`), liquidação derivada da fatura
 * (`settlement`) ou vínculo histórico com uma fatura paga.
 */
export function effectivePaid(
  row: MonthRow,
  rows: MonthRow[],
  settlement?: SettlementIndexLike | null,
): boolean {
  if (row.paid) return true;
  if (settlement?.paidComponentKeys.has(row.key)) return true;
  const statement = linkedStatementRowFor(row, rows.filter(isStatementRow));
  return !!statement?.paid;
}

/* -------------------------------------------------------------------------- */
/*                        CÂMBIO: REFERÊNCIA vs EFETIVO                       */
/* -------------------------------------------------------------------------- */

/**
 * Câmbio EFETIVO de uma linha USD: só existe quando há fato real, e é sempre
 * derivado do próprio par (BRL exato / USD original) daquela compra.
 *
 * Duas compras da mesma fatura podem ter câmbios diferentes — não existe
 * "câmbio da fatura" nem "câmbio do mês" como fato.
 */
export function effectiveUsdRate(row: MonthRow): number | null {
  if (row.currency !== "USD") return null;
  const occ = row.occurrence;
  if (!occ) return null;
  const original = occ.amount_original ?? null;
  const brl = occ.amount_brl ?? null;
  if (original != null && original > 0 && brl != null) {
    return Number((brl / original).toFixed(6));
  }
  return null;
}

/** A linha USD ainda depende de câmbio de REFERÊNCIA (estimativa)? */
export function usesReferenceRate(row: MonthRow): boolean {
  if (row.currency !== "USD") return false;
  return effectiveUsdRate(row) == null;
}

/** Câmbio calculado a partir de um par informado, com precisão de 6 casas. */
export function computeUsdRate(
  amountBrl: number | null | undefined,
  amountOriginal: number | null | undefined,
): number | null {
  if (amountBrl == null || amountOriginal == null) return null;
  if (!(amountOriginal > 0) || !(amountBrl > 0)) return null;
  return Number((amountBrl / amountOriginal).toFixed(6));
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
  /** actualTotal - projectedTotal - IOF classificado (quando o total existe). */
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
  /** Versões de regra de recorrência (histórico). Opcional. */
  rules?: FinanceRecurrenceRule[];
}): StatementGroup[] {
  const { items, occurrences, competence } = params;
  const fallbackRate = params.fallbackRate ?? null;
  const rules = params.rules ?? [];
  const cards = items.filter((i) => i.kind === "card");
  const currentRows = buildMonthRows({ items, occurrences, competence, fallbackRate, rules });


  return cards.map((card) => {
    const cycle = { closingDay: card.statement_closing_day, dueDay: card.statement_due_day };
    const configIncomplete = card.statement_closing_day == null || card.statement_due_day == null;

    // Snapshots podem mover uma cobrança para outro cartão no mês: por isso o
    // recorte do mês anterior parte de TODOS os itens e filtra por `cardItemId`.
    const cardItems = items.filter((i) => isCostBearing(i));
    const components: MonthRow[] = [];

    if (configIncomplete) {
      for (const row of currentRows) {
        if (!isOperationalRow(row)) continue;
        if (row.cardItemId === card.id) components.push(row);
      }
    } else {
      /**
       * DEDUPE POR IDENTIDADE DE COBRANÇA: a mesma cobrança pode chegar duas
       * vezes — como projeção do mês da charge_date e como ocorrência REAL
       * arquivada em outra competência. O fato real sempre vence a projeção.
       */
      const byChargeIdentity = new Map<string, MonthRow>();
      for (const chargeCompetence of candidateChargeCompetences(competence)) {
        const monthRows = sameCompetence(chargeCompetence, competence)
          ? currentRows
          : buildMonthRows({ items: cardItems, occurrences, competence: chargeCompetence, fallbackRate, rules });
        for (const row of monthRows) {
          // Cadastro inativo sem fato real não compõe fatura nenhuma.
          if (!isOperationalRow(row)) continue;
          if (row.cardItemId !== card.id) continue;
          const chargeDay = chargeDayFrom(row.chargeDate, row.item.charge_day);
          // Competência REAL da cobrança (charge_date), não a do loop.
          const actualChargeCompetence = chargeDateCompetence(row.chargeDate, chargeCompetence);
          const resolved = resolveStatementForCharge({
            chargeDay,
            competence: actualChargeCompetence,
            card: cycle,
          });
          if (resolved.incomplete || !resolved.statementCompetence) continue;
          if (!sameCompetence(resolved.statementCompetence, competence)) continue;
          const identity = `${card.id}|${row.item.id}|${row.chargeDate ?? competenceToISO(actualChargeCompetence)}`;
          const existing = byChargeIdentity.get(identity);
          if (existing) {
            const existingReal = !!existing.occurrence && !existing.projected;
            const rowReal = !!row.occurrence && !row.projected;
            if (existingReal || !rowReal) continue;
          }
          byChargeIdentity.set(identity, row);
        }
      }
      /**
       * DETERMINISMO: a `charge_date` REAL da occurrence manda sobre o
       * `charge_day` do cadastro. Se o mesmo item aparece como fato e como
       * projeção (dias diferentes), a fatura fica só com o fato — senão o item
       * apareceria duas vezes e o total da fatura dobraria.
       */
      const realItemIds = new Set(
        [...byChargeIdentity.values()]
          .filter((row) => !!row.occurrence && !row.projected)
          .map((row) => row.item.id),
      );
      for (const row of byChargeIdentity.values()) {
        if (row.projected && realItemIds.has(row.item.id)) continue;
        components.push(row);
      }
    }


    const statementRow = currentRows.find((r) => r.item.id === card.id) ?? null;
    const projectedTotal = Number(
      components.reduce((sum, row) => sum + (row.amountBrl ?? 0), 0).toFixed(2),
    );
    const actualTotal = statementRow?.occurrence?.amount_brl ?? null;
    const statementIof = statementRow ? paidStatementIofBrl(statementRow) : 0;
    const difference = actualTotal != null
      ? Number((actualTotal - projectedTotal - statementIof).toFixed(2))
      : null;

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

export function applyQuickFilter(
  rows: MonthRow[],
  filter: QuickFilter,
  todayISO: string,
  settlement?: SettlementIndexLike | null,
): MonthRow[] {
  if (filter === "all") return rows;
  const tomorrow = addDaysISO(todayISO, 1);
  const in7 = addDaysISO(todayISO, 7);

  return rows.filter((row) => {
    const paid = effectivePaid(row, rows, settlement);

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
