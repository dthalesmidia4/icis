/**
 * JANELA EFETIVA DA FATURA (uma só verdade, servidor e UI).
 *
 * O fechamento do cartão é um PADRÃO (`statement_closing_day`), mas cada fatura
 * pode ter um fechamento REAL informado pelo usuário
 * (`finance_occurrences.statement_closing_date`). A RPC
 * `finance_statement_cycles` devolve, por cartão e competência, a janela
 * `[cycle_start, cycle_end]` já considerando esse override e recortando o ciclo
 * seguinte. Nenhum valor é exposto aqui — só datas.
 *
 * Regra de pertencimento: `charge_date` DENTRO da janela, limites INCLUSIVOS.
 * `cycle_end + 1` já é a próxima fatura.
 */
import { Competence, competenceToISO } from "./financeCardCycle";

export interface StatementCycle {
  cardId: string;
  /** Competência (mês do vencimento) da fatura, ISO do primeiro dia. */
  competenceMonth: string;
  cycleStart: string;
  cycleEnd: string;
  /** `true` quando o fechamento foi INFORMADO (fato), não apenas previsto. */
  closingDateIsActual: boolean;
}

/** Ciclos indexados por `cardId|competenceISO`. */
export type StatementCycleMap = Map<string, StatementCycle>;

/** Falha explícita: janela ausente nunca deve virar palpite silencioso. */
export class FinanceStatementCycleError extends Error {
  code = "FINANCE_STATEMENT_CYCLES_FAILED" as const;
  constructor(cause?: unknown) {
    super("Não foi possível carregar as janelas de fatura dos cartões");
    this.name = "FinanceStatementCycleError";
    (this as any).cause = cause;
  }
}

export function cycleKey(cardId: string, competence: Competence | string): string {
  const iso = typeof competence === "string" ? competence : competenceToISO(competence);
  return `${cardId}|${iso}`;
}

export function cycleFor(
  cycles: StatementCycleMap | null | undefined,
  cardId: string,
  competence: Competence,
): StatementCycle | null {
  if (!cycles) return null;
  return cycles.get(cycleKey(cardId, competence)) ?? null;
}

/** `charge_date` pertence à janela? Início e fim inclusivos. */
export function chargeDateInCycle(
  chargeDate: string | null | undefined,
  cycle: StatementCycle,
): boolean {
  if (!chargeDate) return false;
  return chargeDate >= cycle.cycleStart && chargeDate <= cycle.cycleEnd;
}

/** Converte as linhas cruas da RPC no mapa indexado. */
export function parseStatementCycles(rows: any[] | null | undefined): StatementCycleMap {
  const map: StatementCycleMap = new Map();
  for (const row of rows ?? []) {
    const cardId = row.card_id as string;
    const competenceMonth = String(row.competence_month).slice(0, 10);
    if (!cardId || !row.cycle_start || !row.cycle_end) continue;
    map.set(cycleKey(cardId, competenceMonth), {
      cardId,
      competenceMonth,
      cycleStart: String(row.cycle_start).slice(0, 10),
      cycleEnd: String(row.cycle_end).slice(0, 10),
      closingDateIsActual: row.closing_date_is_actual === true,
    });
  }
  return map;
}
