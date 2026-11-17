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

/**
 * Qual FATURA (competência) recebe uma cobrança feita em `chargeDate`, segundo
 * as janelas efetivas do cartão. `null` quando nenhuma janela conhecida cobre a
 * data — nada é afirmado sem prova.
 */
export function findCycleForChargeDate(
  cycles: StatementCycleMap | null | undefined,
  cardId: string | null | undefined,
  chargeDate: string | null | undefined,
): StatementCycle | null {
  if (!cycles || !cardId || !chargeDate) return null;
  for (const cycle of cycles.values()) {
    if (cycle.cardId !== cardId) continue;
    if (chargeDateInCycle(chargeDate, cycle)) return cycle;
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* COMPRA NA VIRADA: escolha excepcional da fatura (apenas apresentação/patch) */
/* ------------------------------------------------------------------------- */

/** Dia civil anterior (`YYYY-MM-DD`), sem fuso. */
function previousDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

/** Competência seguinte (`YYYY-MM-01`). */
function nextCompetenceISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Compras no dia do fechamento efetivo ou 1 dia antes podem cair na próxima. */
export function isStatementBoundaryDate(chargeDate: string, cycle: StatementCycle): boolean {
  return chargeDate === cycle.cycleEnd || chargeDate === previousDayISO(cycle.cycleEnd);
}

export const BOUNDARY_STATEMENT_QUESTION = "Em qual fatura esta compra apareceu?";
export const BOUNDARY_STATEMENT_HELP =
  "Compras na virada podem cair na próxima fatura. Confira seu extrato.";

export interface BoundaryStatementOption {
  competenceMonth: string;
  cycle: StatementCycle;
  /** Fatura fechada/paga nunca é destino de uma nova escolha. */
  selectable: boolean;
}

export interface BoundaryStatementChoice {
  automatic: StatementCycle;
  options: BoundaryStatementOption[];
  /** Snapshot já gravado (`YYYY-MM-01`) ou `null`. */
  existingSnapshot: string | null;
  /** Valor pré-selecionado: snapshot existente > fatura automática. */
  selected: string;
}

export interface BoundaryStatementParams {
  cycles: StatementCycleMap | null | undefined;
  /** Cartão INTERNO efetivo da compra (null = sem cartão interno). */
  cardId: string | null | undefined;
  chargeDate: string | null | undefined;
  /** Compra no cartão (não pagamento direto / Pix / boleto). */
  cardCharge: boolean;
  /** Cartão de terceiro: sem fatura interna. */
  externalCard: boolean;
  /** Linha da própria fatura (pai). */
  statementRow: boolean;
  /** Recarga/extra ou qualquer papel diferente de `regular`. */
  entryRole: string | null | undefined;
  supplemental: boolean;
  /** Fato fechado (pago ou liquidado por fatura paga). */
  closed: boolean;
  occurrence?: {
    statement_occurrence_id?: string | null;
    statement_competence_snapshot?: string | null;
    paid_at?: string | null;
    skipped_at?: string | null;
  } | null;
  /** Fatura (cartão + competência `YYYY-MM-01`) já fechada/paga? */
  isStatementLocked: (cardId: string, competenceMonth: string) => boolean;
}

/**
 * Escolha OPCIONAL da fatura para uma compra de cartão interno na virada.
 *
 * Nunca adivinha: sem janelas conhecidas (automática e seguinte) → `null`.
 * Só existe para compra regular, aberta, sem vínculo com fatura e com fatura
 * seguinte ainda aberta. Mostrada na virada (dia do fechamento ou 1 dia antes)
 * ou quando o fato já tem snapshot coincidente com uma das opções.
 */
export function boundaryStatementChoice(p: BoundaryStatementParams): BoundaryStatementChoice | null {
  if (!p.cardCharge || p.externalCard || p.statementRow || p.supplemental || p.closed) return null;
  if ((p.entryRole ?? "regular") !== "regular") return null;
  const occ = p.occurrence ?? null;
  if (occ?.statement_occurrence_id || occ?.paid_at || occ?.skipped_at) return null;
  if (!p.cardId || !p.chargeDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.chargeDate)) return null;

  const automatic = findCycleForChargeDate(p.cycles, p.cardId, p.chargeDate);
  if (!automatic) return null;
  const next = cycleFor(p.cycles, p.cardId, competenceFromISOLocal(nextCompetenceISO(automatic.competenceMonth)));
  if (!next) return null;

  const existingSnapshot = occ?.statement_competence_snapshot
    ? `${occ.statement_competence_snapshot.slice(0, 7)}-01`
    : null;
  const options: BoundaryStatementOption[] = [automatic, next].map((cycle) => ({
    competenceMonth: cycle.competenceMonth.slice(0, 10),
    cycle,
    selectable: !p.isStatementLocked(p.cardId!, cycle.competenceMonth.slice(0, 10)),
  }));
  const nextOption = options[1];
  const snapshotMatches = !!existingSnapshot && options.some((o) => o.competenceMonth === existingSnapshot);
  if (existingSnapshot && !snapshotMatches) return null; // snapshot de outra fatura: não opinar
  if (!isStatementBoundaryDate(p.chargeDate, automatic) && !snapshotMatches) return null;
  if (!nextOption.selectable && !snapshotMatches) return null;

  return {
    automatic,
    options,
    existingSnapshot,
    selected: existingSnapshot ?? options[0].competenceMonth,
  };
}

function competenceFromISOLocal(iso: string): Competence {
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
}

/**
 * Patch do snapshot a partir da escolha EXPLÍCITA do usuário.
 * Sem escolha (`pick === null`) → nada é salvo nem apagado. A `charge_date`
 * nunca é tocada aqui.
 */
export function boundaryStatementPatch(
  choice: BoundaryStatementChoice | null,
  pick: string | null,
): { statement_competence_snapshot?: string } {
  if (!choice || !pick) return {};
  const option = choice.options.find((o) => o.competenceMonth === pick);
  if (!option || !option.selectable) return {};
  if (pick === choice.existingSnapshot) return {};
  if (!choice.existingSnapshot && pick === choice.automatic.competenceMonth.slice(0, 10)) return {};
  return { statement_competence_snapshot: pick };
}
