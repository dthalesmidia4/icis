/**
 * PULSO DA AGÊNCIA (Painel coletivo do Escritório) — lógica PURA.
 *
 * Todos os números são derivados de dados reais já carregados: cards
 * agency-wide (`useOfficeOverview.agencyCards`) e entregas de
 * `demand_flow_history` (`action = 'delivered'`). Nada é inventado: quando não
 * há meta do dia, não existe "100%".
 *
 * XP é uma leitura declarada da própria operação: 25 XP por demanda entregue,
 * 1000 XP por nível. Sem ranking individual.
 */
import { isClientWaitingFunction } from "@/lib/flowFunctions";
import { REVIEW_FUNCTION_KEYS } from "@/lib/officeZone";

export const XP_PER_DELIVERY = 25;
export const XP_PER_LEVEL = 1000;
export const XP_LEGEND = "25 XP por demanda entregue";
/** Fila acima disso é mesa sobrecarregada (mesma semântica de `paperStackShape`). */
export const OVERLOAD_QUEUE = 15;

export interface AgencyLevel {
  deliveredTotal: number;
  totalXp: number;
  level: number;
  xpInLevel: number;
  nextLevelXp: number;
}

export function levelFromDeliveries(deliveredTotal: number): AgencyLevel {
  const safe = Math.max(0, Math.floor(deliveredTotal || 0));
  const totalXp = safe * XP_PER_DELIVERY;
  return {
    deliveredTotal: safe,
    totalXp,
    level: Math.floor(totalXp / XP_PER_LEVEL) + 1,
    xpInLevel: totalXp % XP_PER_LEVEL,
    nextLevelXp: XP_PER_LEVEL,
  };
}

export interface PulseCard {
  id: string;
  functionKey: string | null;
  startTs: number | null;
  endTs: number | null;
  deliveryDate: string | null;
  dueDate: string | null;
}

export interface AgencyPulse {
  /** Entregas de hoje (dia canônico do expediente). */
  deliveredToday: number;
  /** Cards com janela iniciada e ainda dentro do prazo. */
  inProgress: number;
  /** Cards cujo fim previsto já venceu (mesma semântica temporal da mesa). */
  atRisk: number;
  awaitingClient: number;
  inReview: number;
  /** Entregas previstas para hoje (concluídas + pendentes com data de hoje). */
  todayTarget: number;
  /** Percentual do dia, ou null quando não há meta (nunca 100% inventado). */
  progressPct: number | null;
}

const REVIEW_SET = new Set<string>(REVIEW_FUNCTION_KEYS);

/** Data efetiva de entrega: `delivery_date` e, na falta, `due_date`. */
export const effectiveDeliveryDate = (card: PulseCard): string | null =>
  card.deliveryDate || card.dueDate || null;

export interface DerivePulseInput {
  /** Cards operacionais agency-wide (sem filtro de área). */
  cards: PulseCard[];
  now: number;
  /** Dia canônico do expediente (`YYYY-MM-DD`). */
  today: string;
  deliveredToday: number;
}

export function deriveAgencyPulse({ cards, now, today, deliveredToday }: DerivePulseInput): AgencyPulse {
  let inProgress = 0;
  let atRisk = 0;
  let awaitingClient = 0;
  let inReview = 0;
  let pendingToday = 0;

  cards.forEach((card) => {
    if (isClientWaitingFunction(card.functionKey)) {
      awaitingClient += 1;
      return;
    }
    const overdue = card.endTs !== null && card.endTs <= now;
    if (overdue) atRisk += 1;
    else if (card.startTs !== null && card.startTs <= now) inProgress += 1;
    if (card.functionKey && REVIEW_SET.has(card.functionKey)) inReview += 1;
    if (effectiveDeliveryDate(card) === today) pendingToday += 1;
  });

  const done = Math.max(0, Math.floor(deliveredToday || 0));
  const todayTarget = done + pendingToday;

  return {
    deliveredToday: done,
    inProgress,
    atRisk,
    awaitingClient,
    inReview,
    todayTarget,
    progressPct: todayTarget > 0 ? Math.round((done / todayTarget) * 100) : null,
  };
}

export interface OfficeMission {
  id: "no_delay" | "clear_review" | "no_overload";
  label: string;
  done: boolean;
  /** Progresso real quando não concluída (nunca texto genérico). */
  detail: string | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * 3 missões COLETIVAS derivadas do estado atual — sem persistência, sem
 * pontuação individual, sem missão fictícia.
 */
export function buildOfficeMissions(input: {
  atRisk: number;
  inReview: number;
  overloadedDesks: number;
}): { missions: OfficeMission[]; doneCount: number; total: number } {
  const missions: OfficeMission[] = [
    {
      id: "no_delay",
      label: "Zerar atrasos",
      done: input.atRisk === 0,
      detail: input.atRisk === 0 ? null : plural(input.atRisk, "em atraso", "em atraso"),
    },
    {
      id: "clear_review",
      label: "Zerar revisão",
      done: input.inReview === 0,
      detail: input.inReview === 0 ? null : plural(input.inReview, "em revisão", "em revisão"),
    },
    {
      id: "no_overload",
      label: "Sem mesas sobrecarregadas",
      done: input.overloadedDesks === 0,
      detail:
        input.overloadedDesks === 0
          ? null
          : plural(input.overloadedDesks, "mesa sobrecarregada", "mesas sobrecarregadas"),
    },
  ];
  return { missions, doneCount: missions.filter((m) => m.done).length, total: missions.length };
}

/** Mesas sobrecarregadas: fila acima do limite já usado pela pilha física. */
export function countOverloadedDesks(queueCounts: number[]): number {
  return queueCounts.filter((n) => n > OVERLOAD_QUEUE).length;
}
