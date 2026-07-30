import { isReviewFunction, isEvaluationFunction, isClientWaitingFunction } from "@/lib/flowFunctions";

/**
 * Resolve qual card está "em andamento" e qual é o "próximo" na fila de um colaborador.
 *
 * Premissa central: a coluna de um colaborador só contém cards PENDENTES.
 * Quando ele entrega, o card muda de etapa/responsável e sai da coluna.
 * Logo, "a anterior já foi entregue?" já está representado pela presença dos cards —
 * o trabalho corrente é o primeiro card pendente da fila que já é para hoje ou antes,
 * independentemente do relógio.
 */

export interface WorkQueueCard {
  id: string;
  current_function_key?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  is_daily_card?: boolean | null;
}

export interface ResolveCurrentOptions {
  /** Timestamp reativo (ms). */
  now: number;
  /** Cards com publicação já agendada (saem da fila operacional). */
  activeDispatchIds?: Set<string>;
  /**
   * Etapas já entregues por ESTE colaborador, por card.
   * Ex.: { [cardId]: Set(["captar"]) } — usado em cards multi-responsável.
   */
  deliveredStagesByCard?: Map<string, Set<string>>;
}

export interface CurrentAndNext {
  currentId: string | null;
  nextId: string | null;
  /** Fila ordenada resultante (útil para debug/exibição). */
  queue: WorkQueueCard[];
}

const tierOf = (key?: string | null): number => {
  if (isReviewFunction(key)) return 1;
  if (isEvaluationFunction(key)) return 2;
  return 0;
};

const startTsOf = (c: WorkQueueCard): number => {
  if (!c.due_date) return Number.POSITIVE_INFINITY;
  const [y, mo, d] = c.due_date.split("-").map((x) => parseInt(x, 10));
  const [h, mi] = ((c.due_time || "00:00").slice(0, 5)).split(":").map((x) => parseInt(x, 10));
  const ts = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0).getTime();
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
};

/** Fim do dia (local) do timestamp informado. */
const endOfDay = (now: number): number => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export function resolveCurrentAndNext<T extends WorkQueueCard>(
  cards: T[],
  opts: ResolveCurrentOptions,
): CurrentAndNext {
  const { now, activeDispatchIds, deliveredStagesByCard } = opts;

  const queue = cards
    .filter((c) => {
      const key = (c.current_function_key || "").toLowerCase().trim();
      // Fora da fila operacional
      if (isClientWaitingFunction(key)) return false;
      if (key === "captar") return false; // tem lógica própria de pausa/multi-responsável
      if (activeDispatchIds?.has(c.id)) return false;
      // Card cuja etapa atual este colaborador já entregou (multi-responsável)
      const delivered = deliveredStagesByCard?.get(c.id);
      if (delivered && key && delivered.has(key)) return false;
      return Number.isFinite(startTsOf(c));
    })
    .sort((a, b) => {
      const d = startTsOf(a) - startTsOf(b);
      if (d !== 0) return d;
      return tierOf(a.current_function_key) - tierOf(b.current_function_key);
    });

  const limit = endOfDay(now);
  const currentIdx = queue.findIndex((c) => startTsOf(c) <= limit);

  const currentId = currentIdx >= 0 ? queue[currentIdx].id : null;
  const nextId =
    currentIdx >= 0
      ? queue[currentIdx + 1]?.id ?? null
      : queue[0]?.id ?? null;

  return { currentId, nextId, queue };
}

export default resolveCurrentAndNext;
