/**
 * Regras de payload do cadastro (`finance_items`) que o formulário não pode
 * errar.
 *
 * Por que existe: depois da migration de recorrência,
 * `recurrence_interval` e `recurrence_interval_months` são NOT NULL DEFAULT 1.
 * O formulário mandava `recurrence_interval: null` em todo item que não fosse
 * diário/semanal, então QUALQUER edição mensal/avulsa violava o banco e
 * aparecia como "Erro ao atualizar cadastro". Coluna NOT NULL nunca recebe
 * NULL daqui.
 */

export type FinanceFrequency = "daily" | "weekly" | "monthly" | "custom" | "annual";

export interface RecurrenceIntervalInput {
  /** É uma recorrência (não avulsa/parcelada/consumo)? */
  isRecurring: boolean;
  frequency: FinanceFrequency;
  /** "A cada X meses" da frequência custom. */
  intervalMonths: number | null;
  /** "A cada X dias/semanas" das frequências sub-mensais. */
  subInterval: number | null;
}

export interface RecurrenceIntervals {
  recurrence_interval: number;
  recurrence_interval_months: number;
}

const atLeastOne = (value: number | null | undefined) =>
  Number.isFinite(value) && (value as number) >= 1 ? Math.floor(value as number) : 1;

/**
 * Intervalos genéricos SEMPRE >= 1:
 *  - sub-mensal (daily/weekly): o intervalo genérico é o "a cada N" escolhido;
 *  - custom mensal: espelha o intervalo em meses (a cada N meses);
 *  - qualquer outro caso: 1 (equivalente ao default do banco).
 */
export function resolveRecurrenceIntervals(input: RecurrenceIntervalInput): RecurrenceIntervals {
  const isSubMonthly = input.isRecurring && (input.frequency === "daily" || input.frequency === "weekly");
  const isCustom = input.isRecurring && input.frequency === "custom";
  const months = isCustom ? atLeastOne(input.intervalMonths) : 1;
  const interval = isSubMonthly ? atLeastOne(input.subInterval) : isCustom ? months : 1;
  return { recurrence_interval: interval, recurrence_interval_months: months };
}

/**
 * Compra no cartão: o vencimento pertence à FATURA, não ao item. O cadastro
 * guarda só o dia da cobrança e `due_day` fica NULL.
 */
export function itemDueDayIsMeaningless(onCard: boolean, cardSelected: boolean): boolean {
  return onCard && cardSelected;
}

export interface ChargeDueCheckInput {
  onCard: boolean;
  cardSelected: boolean;
  chargeDay: number | null;
  dueDay: number | null;
}

export const CHARGE_AFTER_DUE_MESSAGE =
  "O vencimento ficou anterior à cobrança dentro do mesmo mês. Se o vencimento é no mês seguinte, deixe o dia da cobrança em branco e informe apenas o vencimento.";

/**
 * Pagamento DIRETO com cobrança e vencimento no mesmo mês precisa ser
 * coerente. Não viramos isso em regra de banco: `due < charge` pode significar
 * vencimento no mês seguinte, e o modelo não guarda offset de mês — então a
 * ambiguidade é resolvida na UI, explicitamente.
 *
 * Cartão (item cobrado no cartão) não entra nessa comparação: fechamento e
 * vencimento da fatura são do cartão, não do item.
 */
export function chargeDueConflictMessage(input: ChargeDueCheckInput): string | null {
  if (itemDueDayIsMeaningless(input.onCard, input.cardSelected)) return null;
  if (input.chargeDay == null || input.dueDay == null) return null;
  if (input.dueDay >= input.chargeDay) return null;
  return CHARGE_AFTER_DUE_MESSAGE;
}
