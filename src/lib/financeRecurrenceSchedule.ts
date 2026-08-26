/**
 * CRONOGRAMA DA RECORRÊNCIA (lógica pura).
 *
 * O Financeiro deixou de tratar "recorrente" como sinônimo de "mensal". Um
 * cadastro passa a ter FREQUÊNCIA (`daily` | `weekly` | `monthly`) com
 * intervalo próprio ("a cada N"), e o mês é gerado a partir desse cronograma.
 *
 * Princípios preservados:
 *  - Nada é pré-criado no banco: as datas são PROJETADAS a partir do cadastro.
 *  - A identidade de um lançamento recorrente é `item_id + scheduled_date` (a
 *    data ORIGINALMENTE agendada). Mover a data efetiva de um lançamento não
 *    altera o padrão nem cria uma segunda ocorrência.
 *  - Alterar a regra vale a partir de uma data (`effective_from`): o passado
 *    continua explicado pela versão que valia naquele momento.
 */
import { Competence, competenceToISO, normalizeCompetence } from "./financeCardCycle";
import type { FinanceItem } from "./financeModel";

export type FinanceFrequency = "daily" | "weekly" | "monthly";

export const FREQUENCY_LABELS: Record<FinanceFrequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
};

/** Dias da semana em ISO (1 = segunda ... 7 = domingo). */
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Segunda-feira", short: "Seg" },
  { value: 2, label: "Terça-feira", short: "Ter" },
  { value: 3, label: "Quarta-feira", short: "Qua" },
  { value: 4, label: "Quinta-feira", short: "Qui" },
  { value: 5, label: "Sexta-feira", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 7, label: "Domingo", short: "Dom" },
];

/** Versão de regra vigente a partir de uma data (`finance_recurrence_rules`). */
export interface FinanceRecurrenceRule {
  id?: string;
  tenant_id?: string;
  item_id: string;
  effective_from: string;
  frequency: FinanceFrequency;
  interval_count: number;
  weekday?: number | null;
  day_of_month?: number | null;
  anchor_date?: string | null;
  note?: string | null;
}

/* ------------------------------ datas (UTC) ------------------------------- */

const toUTC = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};

const fromUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

export function addDaysISO(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

export function diffDaysISO(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

/** Dia da semana em ISO (1 = segunda ... 7 = domingo). */
export function weekdayISO(iso: string): number {
  const day = new Date(toUTC(iso)).getUTCDay(); // 0 = domingo
  return day === 0 ? 7 : day;
}

/** Todas as datas civis do mês da competência, em ordem. */
export function monthDates(competence: Competence): string[] {
  const c = normalizeCompetence(competence);
  const first = competenceToISO(c);
  const dates: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const iso = addDaysISO(first, day - 1);
    if (Number(iso.slice(5, 7)) !== c.month) break;
    dates.push(iso);
  }
  return dates;
}

/* --------------------------- regra do cadastro ---------------------------- */

/**
 * Frequência do cadastro. `null` para naturezas que continuam com regra
 * especializada própria: avulso, anual, parcelado.
 */
export function itemFrequency(item: FinanceItem): FinanceFrequency | null {
  switch (item.recurrence_type) {
    case "daily":
      return "daily";
    case "weekly":
      return "weekly";
    case "monthly":
    case "credits":
    case "variable":
      return "monthly";
    default:
      return null;
  }
}

/** Recorrência sub-mensal (gera mais de um lançamento por mês). */
export function isSubMonthlyItem(item: FinanceItem): boolean {
  const freq = itemFrequency(item);
  return freq === "daily" || freq === "weekly";
}

/** Intervalo genérico ("a cada N"), sempre >= 1. */
export function recurrenceInterval(item: FinanceItem): number {
  const raw =
    item.recurrence_interval ??
    (itemFrequency(item) === "monthly" ? item.recurrence_interval_months : null);
  return raw != null && raw > 0 ? Math.trunc(raw) : 1;
}

/** Âncora do cronograma: a partir de quando o intervalo é contado. */
export function scheduleAnchor(item: FinanceItem): string | null {
  return (
    item.recurrence_anchor_date ??
    item.recurrence_start_date ??
    item.subscription_date ??
    null
  );
}

/** Regra derivada do cadastro mestre (usada quando não há versão gravada). */
export function ruleFromItem(item: FinanceItem): FinanceRecurrenceRule | null {
  const frequency = itemFrequency(item);
  if (!frequency) return null;
  return {
    item_id: item.id,
    effective_from: scheduleAnchor(item) ?? "0001-01-01",
    frequency,
    interval_count: recurrenceInterval(item),
    weekday: item.recurrence_weekday ?? null,
    // Dia do FATO mensal: o campo próprio da agenda da despesa vem primeiro;
    // vencimento/cobrança são só fallback histórico (eles falam de PAGAMENTO).
    day_of_month: item.recurrence_day_of_month ?? item.due_day ?? item.charge_day ?? null,
    anchor_date: scheduleAnchor(item),
  };
}

/**
 * Regra vigente em uma data: a versão gravada mais recente com
 * `effective_from <= data`; sem versão aplicável, cai no cadastro mestre.
 */
export function effectiveRuleFor(
  item: FinanceItem,
  rules: FinanceRecurrenceRule[],
  dateISO: string,
): FinanceRecurrenceRule | null {
  const own = rules
    .filter((r) => r.item_id === item.id && r.effective_from.slice(0, 10) <= dateISO)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const latest = own[own.length - 1];
  return latest ?? ruleFromItem(item);
}

/** Âncora efetiva de uma versão de regra. */
function ruleAnchor(rule: FinanceRecurrenceRule): string | null {
  const anchor = rule.anchor_date ?? rule.effective_from ?? null;
  if (!anchor || anchor.startsWith("0001")) return null;
  return anchor.slice(0, 10);
}

/** A data cai no cronograma da versão de regra informada? */
export function matchesRule(rule: FinanceRecurrenceRule, dateISO: string): boolean {
  const interval = rule.interval_count > 0 ? Math.trunc(rule.interval_count) : 1;
  const anchor = ruleAnchor(rule);

  if (rule.frequency === "daily") {
    if (!anchor) return true;
    const offset = diffDaysISO(dateISO, anchor);
    if (offset < 0) return false;
    return offset % interval === 0;
  }

  if (rule.frequency === "weekly") {
    const weekday = rule.weekday ?? (anchor ? weekdayISO(anchor) : null);
    // Semanal sem dia padrão não é cronograma: não inventa data.
    if (weekday == null) return false;
    if (weekdayISO(dateISO) !== weekday) return false;
    if (!anchor) return true;
    // Alinha a âncora ao primeiro dia da semana pedido (>= âncora).
    const shift = (weekday - weekdayISO(anchor) + 7) % 7;
    const aligned = addDaysISO(anchor, shift);
    const offsetDays = diffDaysISO(dateISO, aligned);
    if (offsetDays < 0) return false;
    return (offsetDays / 7) % interval === 0;
  }

  return false; // mensal não é resolvido por data civil aqui
}

/**
 * Datas agendadas de um cadastro sub-mensal dentro do mês.
 * Determinístico: mesma entrada, mesma saída — nunca depende do relógio.
 */
export function scheduledDatesInMonth(params: {
  item: FinanceItem;
  rules?: FinanceRecurrenceRule[];
  competence: Competence;
}): string[] {
  const { item, competence } = params;
  const rules = params.rules ?? [];
  if (!isSubMonthlyItem(item)) return [];
  const out: string[] = [];
  for (const date of monthDates(competence)) {
    const rule = effectiveRuleFor(item, rules, date);
    if (!rule) continue;
    // A versão vigente pode ser mensal: nesse mês o item volta a ter 1 linha,
    // resolvida pelo caminho mensal (dia do vencimento/cobrança).
    if (rule.frequency === "monthly") continue;
    if (matchesRule(rule, date)) out.push(date);
  }
  return out;
}

/** Identidade canônica de um lançamento recorrente. */
export function scheduleIdentity(itemId: string, scheduledDate: string): string {
  return `${itemId}|${scheduledDate.slice(0, 10)}`;
}

/** Frase curta do cronograma: "A cada 2 semanas na quarta-feira". */
export function describeSchedule(item: FinanceItem): string | null {
  const freq = itemFrequency(item);
  if (!freq) return null;
  const n = recurrenceInterval(item);
  if (freq === "daily") return n === 1 ? "Todos os dias" : `A cada ${n} dias`;
  if (freq === "weekly") {
    const day = WEEKDAYS.find((w) => w.value === item.recurrence_weekday)?.label ?? "dia definido";
    return n === 1 ? `Toda ${day.toLowerCase()}` : `A cada ${n} semanas na ${day.toLowerCase()}`;
  }
  return n === 1 ? "Todo mês" : `A cada ${n} meses`;
}
