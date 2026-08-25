/**
 * VISIBILIDADE DE CARTÕES em `Cartões e faturas`.
 *
 * A tela é operacional: um cartão inativo só aparece quando há FATO REAL na
 * competência consultada que precise ser auditado (fatura registrada ou alguma
 * cobrança persistida). Assim um cartão desativado e sem movimento desaparece,
 * sem nunca apagar o cadastro — e um cartão desativado com histórico real
 * continua consultável na competência em que aquele fato existe.
 */
import type { StatementGroup } from "./financeModel";

/** A competência tem fato real (fatura ou cobrança persistida) neste cartão? */
export function statementGroupHasFacts(group: StatementGroup): boolean {
  if (group.statementRow?.occurrence) return true;
  return group.components.some((component) => !!component.occurrence);
}

export function isStatementGroupVisible(group: StatementGroup): boolean {
  if (group.card.active) return true;
  return statementGroupHasFacts(group);
}

export function visibleStatementGroups(groups: StatementGroup[]): StatementGroup[] {
  return groups.filter(isStatementGroupVisible);
}
