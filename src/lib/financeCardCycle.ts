/**
 * Ciclo de fatura de cartão de crédito.
 *
 * Regra:
 * 1. Uma cobrança agendada no mês M (dia `chargeDay`) entra no primeiro fechamento
 *    igual ou posterior à cobrança: se `chargeDay <= closingDay`, fecha em M;
 *    senão, fecha em M+1.
 * 2. A fatura vence no mesmo mês do fechamento quando `dueDay > closingDay`;
 *    caso contrário, vence no mês seguinte ao fechamento.
 * 3. A competência da fatura é o mês do seu vencimento.
 * 4. Sem fechamento/vencimento cadastrados não há projeção — devolve `incomplete`.
 */

export interface Competence {
  /** Ano com 4 dígitos. */
  year: number;
  /** Mês 1-12. */
  month: number;
}

export interface CardCycleConfig {
  closingDay: number | null | undefined;
  dueDay: number | null | undefined;
}

/**
 * Resultado da projeção. Quando `incomplete` é `true`, as datas vêm nulas e
 * `reason` explica o que falta cadastrar — nada é inventado.
 */
export interface StatementResolution {
  incomplete: boolean;
  reason: string | null;
  /** Data em que a cobrança cai no cartão (ISO yyyy-MM-dd). */
  chargeDate: string | null;
  /** Data do fechamento da fatura (ISO). */
  closingDate: string | null;
  /** Data de vencimento da fatura (ISO). */
  dueDate: string | null;
  /** Competência da fatura (mês do vencimento). */
  statementCompetence: Competence | null;
}

export const INCOMPLETE_CARD_MESSAGE =
  "Complete os dados do cartão para projetar a fatura";

/** Último dia do mês informado. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Normaliza uma competência (aceita mês fora de 1-12 e transborda o ano). */
export function normalizeCompetence({ year, month }: Competence): Competence {
  const zero = month - 1;
  const y = year + Math.floor(zero / 12);
  const m = ((zero % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

export function addMonths(competence: Competence, delta: number): Competence {
  return normalizeCompetence({ year: competence.year, month: competence.month + delta });
}

/** Monta a data ISO limitando o dia ao último dia do mês (ex.: 31 em fevereiro). */
export function dateInMonth(competence: Competence, day: number): string {
  const { year, month } = normalizeCompetence(competence);
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/** Primeiro dia do mês (formato usado em `finance_occurrences.competence_month`). */
export function competenceToISO(competence: Competence): string {
  return dateInMonth(competence, 1);
}

export function competenceFromISO(iso: string): Competence {
  const [year, month] = iso.split("-").map(Number);
  return normalizeCompetence({ year, month });
}

export function sameCompetence(a: Competence, b: Competence): boolean {
  const na = normalizeCompetence(a);
  const nb = normalizeCompetence(b);
  return na.year === nb.year && na.month === nb.month;
}

/**
 * Resolve o fechamento/vencimento da fatura que receberá uma cobrança feita
 * no mês `competence`, no dia `chargeDay`.
 */
export function resolveStatementForCharge(params: {
  chargeDay: number | null | undefined;
  competence: Competence;
  card: CardCycleConfig;
}): StatementResolution {
  const { chargeDay, competence, card } = params;
  const closingDay = card.closingDay ?? null;
  const dueDay = card.dueDay ?? null;
  const blank = { chargeDate: null, closingDate: null, dueDate: null, statementCompetence: null };

  if (closingDay == null || dueDay == null) {
    return { incomplete: true, reason: INCOMPLETE_CARD_MESSAGE, ...blank };
  }
  if (chargeDay == null) {
    return {
      incomplete: true,
      reason: "Informe o dia da cobrança para projetar a fatura",
      ...blank,
    };
  }

  const chargeDate = dateInMonth(competence, chargeDay);
  const closingCompetence = chargeDay <= closingDay ? competence : addMonths(competence, 1);
  const closingDate = dateInMonth(closingCompetence, closingDay);
  const dueCompetence = dueDay > closingDay ? closingCompetence : addMonths(closingCompetence, 1);
  const dueDate = dateInMonth(dueCompetence, dueDay);

  return {
    incomplete: false,
    chargeDate,
    closingDate,
    dueDate,
    statementCompetence: normalizeCompetence(dueCompetence),
  };
}

/**
 * Dada a competência de uma fatura, devolve os meses de cobrança que podem
 * alimentá-la (o próprio mês e o anterior — suficiente para qualquer
 * combinação de fechamento/vencimento).
 */
export function candidateChargeCompetences(statement: Competence): Competence[] {
  return [addMonths(statement, -1), statement];
}

/** A cobrança do mês `chargeCompetence` pertence à fatura de `statement`? */
export function chargeBelongsToStatement(params: {
  chargeDay: number | null | undefined;
  chargeCompetence: Competence;
  statement: Competence;
  card: CardCycleConfig;
}): boolean {
  const resolved = resolveStatementForCharge({
    chargeDay: params.chargeDay,
    competence: params.chargeCompetence,
    card: params.card,
  });
  if (resolved.incomplete) return false;
  return sameCompetence(resolved.statementCompetence, params.statement);
}
