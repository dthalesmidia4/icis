/**
 * AGENDA DE PAGAMENTO — separada da agenda da DESPESA.
 *
 * O Financeiro passa a tratar duas perguntas diferentes:
 *
 *  1. QUANDO O GASTO ACONTECE (agenda da despesa)
 *     Fonte: cadastro (`finance_items`) + versões em `finance_recurrence_rules`
 *     (`financeRecurrenceSchedule.ts`). Ex.: faxina toda quarta-feira.
 *
 *  2. QUANDO EU REALMENTE PAGO (agenda de pagamento — este módulo)
 *     Fonte: `finance_payment_rules`. Ex.: pago a faxina do mês toda no dia 5.
 *
 * Consequência de negócio: um pagamento pode QUITAR VÁRIAS ocorrências sem
 * duplicar despesa. O agrupamento é um LOTE (`finance_payment_batches`), que é a
 * SAÍDA DE CAIXA; as ocorrências continuam sendo os fatos da despesa e passam a
 * constar como pagas por DERIVAÇÃO — exatamente como a fatura de cartão.
 *
 * Tudo aqui é lógica PURA e determinística: mesma entrada, mesma saída, nunca
 * depende do relógio e nunca grava nada.
 */
import { Competence, addMonths, dateInMonth, normalizeCompetence } from "./financeCardCycle";
import type { FinanceItem, MonthRow } from "./financeModel";
import { addDaysISO, diffDaysISO, monthDates, weekdayISO } from "./financeRecurrenceSchedule";

/** Como o pagamento é feito. NÃO diz nada sobre quando a despesa acontece. */
export type FinancePaymentMode = "per_occurrence" | "daily" | "weekly" | "monthly" | "manual";

export const PAYMENT_MODE_LABELS: Record<FinancePaymentMode, string> = {
  per_occurrence: "A cada ocorrência",
  daily: "Em dias fixos",
  weekly: "Uma vez por semana",
  monthly: "Uma vez por mês",
  manual: "Manual (eu decido quando)",
};

export const PAYMENT_MODE_HELP: Record<FinancePaymentMode, string> = {
  per_occurrence: "Cada lançamento é pago na própria data — sem agrupamento.",
  daily: "Os lançamentos são pagos em dias fixos (a cada N dias).",
  weekly: "Os lançamentos da semana são pagos juntos, num dia da semana.",
  monthly: "Os lançamentos do mês são pagos juntos, num dia do mês.",
  manual: "Nada é agendado: você monta o pagamento quando quiser.",
};

/** Versão da agenda de PAGAMENTO vigente a partir de uma data. */
export interface FinancePaymentRule {
  id?: string;
  tenant_id?: string;
  item_id: string;
  effective_from: string;
  mode: FinancePaymentMode;
  interval_count: number;
  weekday?: number | null;
  day_of_month?: number | null;
  note?: string | null;
}

/** Saída de caixa que quita um conjunto de ocorrências. */
export interface FinancePaymentBatch {
  id: string;
  tenant_id?: string;
  item_id?: string | null;
  competence_month: string;
  scheduled_date?: string | null;
  paid_at?: string | null;
  note?: string | null;
}

/** Componente do lote pela IDENTIDADE do lançamento (item + data agendada). */
export interface FinancePaymentBatchEntry {
  id?: string;
  tenant_id?: string;
  batch_id: string;
  item_id: string;
  scheduled_date: string;
}

/* -------------------------------------------------------------------------- */
/*                        REGRA VIGENTE (com histórico)                       */
/* -------------------------------------------------------------------------- */

/**
 * Agenda de pagamento PADRÃO de um cadastro que nunca configurou uma:
 * cada ocorrência é paga na própria data. É o comportamento histórico do
 * Financeiro — nada muda para quem não usa agrupamento.
 */
export function defaultPaymentRule(item: FinanceItem): FinancePaymentRule {
  return {
    item_id: item.id,
    effective_from: "0001-01-01",
    mode: "per_occurrence",
    interval_count: 1,
    weekday: null,
    day_of_month: null,
  };
}

/**
 * Versão vigente numa data: a gravada mais recente com `effective_from <= data`.
 * Sem versão aplicável, cai no padrão (por ocorrência) — o passado continua
 * explicado pela regra que valia naquele momento.
 */
export function effectivePaymentRuleFor(
  item: FinanceItem,
  rules: FinancePaymentRule[],
  dateISO: string,
): FinancePaymentRule {
  const own = rules
    .filter((r) => r.item_id === item.id && r.effective_from.slice(0, 10) <= dateISO.slice(0, 10))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  return own[own.length - 1] ?? defaultPaymentRule(item);
}

/** Frase curta da agenda de pagamento: "Pago dia 5 de cada mês". */
export function describePaymentRule(rule: FinancePaymentRule): string {
  const n = rule.interval_count > 0 ? Math.trunc(rule.interval_count) : 1;
  switch (rule.mode) {
    case "per_occurrence":
      return "Pago a cada ocorrência";
    case "manual":
      return "Pagamento manual";
    case "daily":
      return n === 1 ? "Pago todos os dias" : `Pago a cada ${n} dias`;
    case "weekly":
      return n === 1 ? "Pago uma vez por semana" : `Pago a cada ${n} semanas`;
    case "monthly":
    default:
      return rule.day_of_month != null
        ? `Pago dia ${rule.day_of_month} de cada mês`
        : "Pago uma vez por mês";
  }
}

/* -------------------------------------------------------------------------- */
/*                          DATAS DE PAGAMENTO DO MÊS                          */
/* -------------------------------------------------------------------------- */

const anchorOf = (rule: FinancePaymentRule): string | null => {
  const anchor = rule.effective_from?.slice(0, 10) ?? null;
  if (!anchor || anchor.startsWith("0001")) return null;
  return anchor;
};

/**
 * Datas em que o PAGAMENTO acontece dentro da competência.
 * `per_occurrence` e `manual` não têm agenda própria (retornam vazio): num a
 * data é a do próprio lançamento, no outro quem decide é a pessoa.
 */
export function paymentDatesInMonth(rule: FinancePaymentRule, competence: Competence): string[] {
  const c = normalizeCompetence(competence);
  const interval = rule.interval_count > 0 ? Math.trunc(rule.interval_count) : 1;
  const anchor = anchorOf(rule);

  if (rule.mode === "monthly") {
    const day = rule.day_of_month;
    if (day == null) return [];
    return [dateInMonth(c, day)];
  }

  if (rule.mode === "weekly") {
    const weekday = rule.weekday ?? (anchor ? weekdayISO(anchor) : null);
    if (weekday == null) return [];
    return monthDates(c).filter((date) => {
      if (weekdayISO(date) !== weekday) return false;
      if (!anchor) return true;
      const shift = (weekday - weekdayISO(anchor) + 7) % 7;
      const aligned = addDaysISO(anchor, shift);
      const offset = diffDaysISO(date, aligned);
      return offset >= 0 && (offset / 7) % interval === 0;
    });
  }

  if (rule.mode === "daily") {
    return monthDates(c).filter((date) => {
      if (!anchor) return true;
      const offset = diffDaysISO(date, anchor);
      return offset >= 0 && offset % interval === 0;
    });
  }

  return [];
}

/** Primeira data de pagamento do mês SEGUINTE (destino do que "sobra"). */
function nextMonthPaymentDate(rule: FinancePaymentRule, competence: Competence): string | null {
  const next = addMonths(normalizeCompetence(competence), 1);
  return paymentDatesInMonth(rule, next)[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/*                    AGRUPAMENTO: DESPESAS -> PAGAMENTOS                     */
/* -------------------------------------------------------------------------- */

/** Data do FATO da despesa numa linha do mês (identidade do lançamento). */
export function rowFactDate(row: MonthRow): string | null {
  return row.scheduledDate ?? row.dueDate ?? row.chargeDate ?? null;
}

export interface PaymentGroup {
  /** Data prevista da saída de caixa. `null` em pagamento manual. */
  paymentDate: string | null;
  /** Linhas do mês quitadas por esta saída de caixa. */
  rows: MonthRow[];
  /** Soma prevista do grupo (`null` quando alguma linha não tem valor). */
  totalBrl: number | null;
  /** O grupo agrupa mais de uma ocorrência (pagamento agrupado de verdade)? */
  grouped: boolean;
}

function sumRows(rows: MonthRow[]): number | null {
  let total = 0;
  let known = false;
  for (const row of rows) {
    if (row.amountBrl == null) continue;
    total += row.amountBrl;
    known = true;
  }
  return known ? Number(total.toFixed(2)) : null;
}

/**
 * Agrupa as linhas de um cadastro na competência conforme a agenda de PAGAMENTO.
 *
 * Regra de alocação: uma ocorrência é paga na PRIMEIRA data de pagamento igual
 * ou posterior ao fato. O que acontece depois da última data do mês vai para o
 * primeiro pagamento do mês seguinte — nunca desaparece e nunca é antecipado.
 */
export function groupRowsForPayment(params: {
  rows: MonthRow[];
  rule: FinancePaymentRule;
  competence: Competence;
}): PaymentGroup[] {
  const rows = [...params.rows].sort((a, b) =>
    (rowFactDate(a) ?? "9999-99-99").localeCompare(rowFactDate(b) ?? "9999-99-99"),
  );
  const { rule, competence } = params;

  if (rows.length === 0) return [];

  if (rule.mode === "per_occurrence") {
    return rows.map((row) => ({
      paymentDate: rowFactDate(row),
      rows: [row],
      totalBrl: sumRows([row]),
      grouped: false,
    }));
  }

  if (rule.mode === "manual") {
    return [{ paymentDate: null, rows, totalBrl: sumRows(rows), grouped: rows.length > 1 }];
  }

  const dates = paymentDatesInMonth(rule, competence);
  if (dates.length === 0) {
    // Agenda incompleta (ex.: mensal sem dia): não inventamos data.
    return [{ paymentDate: null, rows, totalBrl: sumRows(rows), grouped: rows.length > 1 }];
  }

  const overflow = nextMonthPaymentDate(rule, competence);
  const buckets = new Map<string, MonthRow[]>();
  const push = (key: string, row: MonthRow) => {
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  };

  for (const row of rows) {
    const fact = rowFactDate(row);
    const target = fact ? dates.find((d) => d >= fact) ?? overflow ?? dates[dates.length - 1] : dates[0];
    push(target, row);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([paymentDate, groupRows]) => ({
      paymentDate,
      rows: groupRows,
      totalBrl: sumRows(groupRows),
      grouped: groupRows.length > 1,
    }));
}

/** Identidade canônica usada pelos componentes do lote. */
export function batchEntryIdentity(itemId: string, scheduledDate: string): string {
  return `${itemId}|${scheduledDate.slice(0, 10)}`;
}

/**
 * Índice de liquidação POR LOTE: as linhas cujas identidades pertencem a um lote
 * PAGO contam como pagas. Nada é gravado nas ocorrências — mesma arquitetura
 * derivada da fatura de cartão.
 */
export function buildBatchSettlementIndex(params: {
  rows: MonthRow[];
  batches: FinancePaymentBatch[];
  entries: FinancePaymentBatchEntry[];
}): { paidComponentKeys: Set<string> } {
  const paidBatchIds = new Set(
    params.batches.filter((b) => !!b.paid_at).map((b) => b.id),
  );
  const paidIdentities = new Set(
    params.entries
      .filter((e) => paidBatchIds.has(e.batch_id))
      .map((e) => batchEntryIdentity(e.item_id, e.scheduled_date)),
  );
  const paidComponentKeys = new Set<string>();
  for (const row of params.rows) {
    const fact = rowFactDate(row);
    if (!fact) continue;
    if (paidIdentities.has(batchEntryIdentity(row.item.id, fact))) {
      paidComponentKeys.add(row.key);
    }
  }
  return { paidComponentKeys };
}

/** O lançamento já está dentro de algum lote (pago ou não)? */
export function batchedIdentities(entries: FinancePaymentBatchEntry[]): Set<string> {
  return new Set(entries.map((e) => batchEntryIdentity(e.item_id, e.scheduled_date)));
}
