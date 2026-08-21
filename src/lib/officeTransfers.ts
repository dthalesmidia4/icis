/**
 * Detector PURO de transferências de responsável para a animação do `/escritorio`.
 *
 * Nada aqui altera atribuição, fila, datas ou persistência: apenas compara
 * snapshots consecutivos de `demands.assigned_to` e devolve eventos visuais.
 */

export interface AssignmentSnapshotEntry {
  id: string;
  title: string;
  assignedTo: string | null;
}

export type AssignmentSnapshot = Record<string, AssignmentSnapshotEntry>;

export interface TransferEvent {
  demandId: string;
  title: string;
  fromUserId: string;
  toUserId: string;
}

/** Snapshot mínimo (id → responsável) a partir dos cards já carregados. */
export function buildAssignmentSnapshot(
  cards: { id: string; title: string; assignedTo: string | null }[],
): AssignmentSnapshot {
  const out: AssignmentSnapshot = {};
  cards.forEach((c) => {
    if (!c?.id) return;
    out[c.id] = { id: c.id, title: c.title || "Sem título", assignedTo: c.assignedTo ?? null };
  });
  return out;
}

/**
 * Compara dois snapshots. Só é transferência quando o MESMO card muda de um
 * responsável identificável para outro responsável identificável.
 * - snapshot inicial (`prev` nulo) nunca gera eventos;
 * - reorder/posição na fila não muda `assignedTo` ⇒ nenhum evento;
 * - A→A, A→null, null→B não geram evento;
 * - `additional_assignees` é ignorado de propósito.
 */
export function detectTransfers(
  prev: AssignmentSnapshot | null | undefined,
  next: AssignmentSnapshot,
): TransferEvent[] {
  if (!prev) return [];
  const events: TransferEvent[] = [];
  Object.values(next).forEach((entry) => {
    const before = prev[entry.id];
    if (!before) return; // card novo não é transferência
    const from = before.assignedTo;
    const to = entry.assignedTo;
    if (!from || !to || from === to) return;
    events.push({ demandId: entry.id, title: entry.title, fromUserId: from, toUserId: to });
  });
  return events;
}

export const transferKey = (e: TransferEvent) => `${e.demandId}:${e.fromUserId}:${e.toUserId}`;

export interface DedupeResult {
  events: TransferEvent[];
  recent: Record<string, number>;
}

/** Descarta eventos repetidos do mesmo `demandId + from + to` dentro da janela. */
export function dedupeTransfers(
  events: TransferEvent[],
  recent: Record<string, number>,
  now: number,
  windowMs = 5000,
): DedupeResult {
  const nextRecent: Record<string, number> = {};
  Object.entries(recent).forEach(([k, ts]) => {
    if (now - ts < windowMs) nextRecent[k] = ts;
  });
  const kept: TransferEvent[] = [];
  events.forEach((e) => {
    const key = transferKey(e);
    if (nextRecent[key] !== undefined) return;
    nextRecent[key] = now;
    kept.push(e);
  });
  return { events: kept, recent: nextRecent };
}
