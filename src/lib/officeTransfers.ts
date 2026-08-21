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

/**
 * Caminho PRINCIPAL de latência mínima: converte um UPDATE realtime de
 * `demands.assigned_to` em evento de transferência SEM esperar o refetch.
 *
 * - `snapshot` nulo (baseline ainda não carregado) nunca gera evento;
 * - origem vem de `old.assigned_to` quando disponível, senão do snapshot;
 * - o snapshot já é atualizado aqui, então o refetch seguinte NÃO reanima;
 * - eventos que não mudam `assigned_to` (título, status…) não geram nada.
 */
export function transferFromRealtime(
  snapshot: AssignmentSnapshot | null | undefined,
  row: {
    id: string;
    title?: string | null;
    assignedTo: string | null;
    oldAssignedTo?: string | null;
  },
): { event: TransferEvent | null; snapshot: AssignmentSnapshot | null } {
  if (!snapshot || !row?.id) return { event: null, snapshot: snapshot ?? null };
  const before = snapshot[row.id];
  if (!before) return { event: null, snapshot };

  const from = row.oldAssignedTo ?? before.assignedTo;
  const to = row.assignedTo;
  const title = row.title || before.title;

  const nextSnapshot: AssignmentSnapshot = {
    ...snapshot,
    [row.id]: { id: row.id, title, assignedTo: to },
  };

  if (!from || !to || from === to) return { event: null, snapshot: nextSnapshot };
  return { event: { demandId: row.id, title, fromUserId: from, toUserId: to }, snapshot: nextSnapshot };
}
