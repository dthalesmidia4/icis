/**
 * Status SEGURO da fatura do cartão (escopo `Assinaturas e ferramentas`).
 *
 * O escopo `tools` não pode ver valores, limite, orçamento nem detalhes da
 * fatura — mas precisa saber o FATO da competência: existe fatura real? venceu?
 * está paga? Só isso vive aqui, exatamente como a RPC
 * `list_finance_safe_card_statement_status` devolve.
 *
 * IMPORTANTE: este status é APRESENTAÇÃO. Ele nunca cria vínculo contábil
 * (`statement_occurrence_id`), nunca alimenta liquidação, totais ou
 * reconciliação.
 */
import { Competence, competenceToISO } from "./financeCardCycle";
import { MonthRow } from "./financeModel";
import { paidLabelWithDate } from "./financeRowStatus";

export interface SafeCardStatementStatus {
  cardId: string;
  /** Competência da fatura (`YYYY-MM-01`). */
  competenceMonth: string;
  dueDate: string | null;
  paid: boolean;
  paidAt?: string | null;
}

/** Linha crua da RPC segura. */
export interface SafeCardStatementStatusRow {
  card_id: string;
  competence_month: string;
  due_date: string | null;
  paid: boolean;
  paid_at?: string | null;
}

export type SafeStatementStatusMap = Map<string, SafeCardStatementStatus>;

/** Chave canônica do mapa: `cardId|YYYY-MM-01`. */
export function safeStatementKey(cardId: string, competenceMonthISO: string): string {
  return `${cardId}|${competenceMonthISO.slice(0, 10)}`;
}

/** Normaliza qualquer data para o primeiro dia do mês (`YYYY-MM-01`). */
export function monthStartISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Constrói o mapa seguro a partir do retorno da RPC. */
export function buildSafeStatementStatusMap(
  rows: SafeCardStatementStatusRow[] | null | undefined,
): SafeStatementStatusMap {
  const map: SafeStatementStatusMap = new Map();
  for (const raw of rows ?? []) {
    if (!raw?.card_id || !raw?.competence_month) continue;
    const competenceMonth = monthStartISO(raw.competence_month);
    map.set(safeStatementKey(raw.card_id, competenceMonth), {
      cardId: raw.card_id,
      competenceMonth,
      dueDate: raw.due_date ? raw.due_date.slice(0, 10) : null,
      paid: !!raw.paid,
      paidAt: raw.paid_at ?? null,
    });
  }
  return map;
}

/**
 * Deriva o MESMO mapa seguro a partir das faturas reais já carregadas no escopo
 * `full`, para que os dois cockpits produzam a mesma semântica de status.
 */
export function safeStatementStatusesFromRows(
  statementRows: MonthRow[],
): SafeStatementStatusMap {
  const map: SafeStatementStatusMap = new Map();
  for (const row of statementRows) {
    const occ = row.occurrence;
    if (!occ) continue; // sem fato real não existe status seguro
    const competenceMonth = monthStartISO(occ.competence_month.slice(0, 10));
    map.set(safeStatementKey(row.item.id, competenceMonth), {
      cardId: row.item.id,
      competenceMonth,
      dueDate: row.dueDate ?? (occ.due_date ? occ.due_date.slice(0, 10) : null),
      paid: !!row.paid,
      paidAt: occ.paid_at ?? null,
    });
  }
  return map;
}

/**
 * Busca o status seguro da fatura de um cartão.
 *
 * `competenceMonthISO` é a competência selecionada na tela. Quando ela não é
 * informada, cai para a única entrada existente daquele cartão — o mapa já vem
 * escopado por competência.
 */
export function findSafeStatementStatus(
  map: SafeStatementStatusMap | undefined,
  cardId: string | null | undefined,
  competenceMonthISO?: string | null,
): SafeCardStatementStatus | null {
  if (!map || !cardId) return null;
  if (competenceMonthISO) {
    const direct = map.get(safeStatementKey(cardId, monthStartISO(competenceMonthISO)));
    if (direct) return direct;
    return null;
  }
  for (const status of map.values()) {
    if (status.cardId === cardId) return status;
  }
  return null;
}

/** Competência -> `YYYY-MM-01`. */
export function competenceMonthISO(competence: Competence): string {
  return competenceToISO(competence).slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*                    CABEÇALHO DO GRUPO (por cartão)                         */
/* -------------------------------------------------------------------------- */

export interface GroupStatementNotice {
  /** Estado da FATURA REAL da competência. `null` quando não existe fatura. */
  statementText: string | null;
  statementTone: "positive" | "danger" | "warning" | "neutral" | null;
  /**
   * Aviso de CADASTRO incompleto — só fala de projeções futuras, nunca
   * contradiz o fato real da competência atual.
   */
  projectionWarning: string | null;
}

/**
 * `Fatura paga` + data real quando a RPC segura devolve `paid_at`.
 * Sem `paid_at`, nenhuma data é inventada.
 */
export function safeStatementPaidLabel(safe: SafeCardStatementStatus): string {
  return paidLabelWithDate("Fatura paga", safe.paidAt);
}

export const PROJECTION_WARNING =
  "Fechamento não configurado — projeções futuras podem ficar imprecisas";

/**
 * Decide o que o cabeçalho do grupo de cartão mostra.
 *
 * Se existe fatura real da competência, ela manda: `Dados da fatura incompletos`
 * deixa de ser o estado da fatura e o que resta é, no máximo, um aviso sobre
 * projeções futuras.
 */
export function groupStatementNotice(params: {
  safe: SafeCardStatementStatus | null;
  cycleWarning: string | null;
  today: string;
}): GroupStatementNotice {
  const { safe, cycleWarning, today } = params;
  if (!safe) {
    return {
      statementText: null,
      statementTone: null,
      projectionWarning: cycleWarning ? `Dados da fatura incompletos · ${cycleWarning}` : null,
    };
  }

  const projectionWarning = cycleWarning ? PROJECTION_WARNING : null;
  if (safe.paid) {
    return {
      statementText: safeStatementPaidLabel(safe),
      statementTone: "positive",
      projectionWarning,
    };
  }
  if (safe.dueDate && safe.dueDate < today) {
    return { statementText: "Fatura atrasada", statementTone: "danger", projectionWarning };
  }
  if (safe.dueDate === today) {
    return { statementText: "Fatura vence hoje", statementTone: "warning", projectionWarning };
  }
  return { statementText: "Fatura a pagar", statementTone: "neutral", projectionWarning };
}
