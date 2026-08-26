/**
 * CORTE OPERACIONAL DO NOVO FINANCEIRO.
 *
 * O mecanismo mensal (cadastros + `finance_occurrences` nativas) entra em
 * operação em AGOSTO/2026. Tudo que existe antes disso é legado (`legacy_bill_id`)
 * e permanece intacto no banco para auditoria — mas NÃO é competência
 * operacional: não projeta, não atrasa, não entra em KPI/composição/fatura.
 *
 * Fonte única de verdade: `FINANCE_TRACKING_START`. Navegação, fail-safe de
 * modelo e telas leem daqui, nunca de uma constante duplicada.
 *
 * IMPORTANTE: o corte é da COMPETÊNCIA exibida. Uma cobrança com
 * `charge_date` em julho continua válida quando pertence à fatura/competência
 * de agosto — datas anteriores não são proibidas, apenas meses operacionais.
 */
import { Competence, normalizeCompetence } from "./financeCardCycle";

export const FINANCE_TRACKING_START: Competence = { year: 2026, month: 8 };

/** Índice absoluto de meses — comparação sem armadilha de string. */
function monthIndex(competence: Competence): number {
  const { year, month } = normalizeCompetence(competence);
  return year * 12 + (month - 1);
}

/** `-1`, `0` ou `1` (a antes / igual / depois de b). */
export function compareCompetence(a: Competence, b: Competence): number {
  const ia = monthIndex(a);
  const ib = monthIndex(b);
  return ia === ib ? 0 : ia < ib ? -1 : 1;
}

/** A competência é anterior ao início do novo Financeiro? */
export function isBeforeTrackingStart(
  competence: Competence,
  start: Competence = FINANCE_TRACKING_START,
): boolean {
  return compareCompetence(competence, start) < 0;
}

/** A competência pertence ao novo Financeiro (agosto/2026 em diante)? */
export function isTrackedCompetence(
  competence: Competence,
  start: Competence = FINANCE_TRACKING_START,
): boolean {
  return !isBeforeTrackingStart(competence, start);
}

/** Puxa qualquer competência inválida de volta para o início do corte. */
export function clampToTrackingStart(
  competence: Competence,
  start: Competence = FINANCE_TRACKING_START,
): Competence {
  return isBeforeTrackingStart(competence, start)
    ? normalizeCompetence(start)
    : normalizeCompetence(competence);
}

export const FINANCE_TRACKING_START_MESSAGE =
  "O novo Financeiro começa em agosto de 2026. Meses anteriores ficam preservados apenas como histórico.";
