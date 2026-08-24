/**
 * Identidade das colunas da Visão Geral (drag & drop).
 *
 * No MODO FOCO uma coluna vira várias sub-colunas com id composto
 * (`<uuid>::production`), então o droppableId NUNCA pode ser usado direto como
 * `assigned_to`. Este helper é a única fonte de verdade dessa tradução.
 */

export type KanbanFocusKind = "production" | "planning" | "review" | "awaiting" | "evaluate";

export const UNASSIGNED_DROPPABLE_ID = "__unassigned__";

const FOCUS_KINDS: KanbanFocusKind[] = ["production", "planning", "review", "awaiting", "evaluate"];

export interface ParsedKanbanDroppable {
  /** UUID do responsável ou null quando "sem responsável". */
  userId: string | null;
  focusKind: KanbanFocusKind | null;
  unassigned: boolean;
}

export function parseKanbanDroppableId(id: string | null | undefined): ParsedKanbanDroppable {
  const raw = (id || "").trim();
  if (!raw || raw === UNASSIGNED_DROPPABLE_ID) {
    return { userId: null, focusKind: null, unassigned: true };
  }
  const [head, tail] = raw.split("::");
  const focusKind = FOCUS_KINDS.includes(tail as KanbanFocusKind)
    ? (tail as KanbanFocusKind)
    : null;
  if (head === UNASSIGNED_DROPPABLE_ID) {
    return { userId: null, focusKind, unassigned: true };
  }
  return { userId: head || null, focusKind, unassigned: false };
}

export interface KanbanDropDecision {
  /** true = deve executar transferência administrativa. */
  reassign: boolean;
  newAssignedTo: string | null;
  /** Motivo quando o drop é ignorado. */
  ignoredReason?: "same_owner" | "same_column" | "invalid";
}

/**
 * O drag representa TRANSFERÊNCIA DE RESPONSÁVEL — nunca troca de agrupamento
 * semântico. Mover entre sub-colunas do MESMO usuário não muda nada.
 */
export function decideKanbanDrop(params: {
  sourceDroppableId: string;
  destinationDroppableId: string;
  currentAssignedTo: string | null;
}): KanbanDropDecision {
  const src = parseKanbanDroppableId(params.sourceDroppableId);
  const dest = parseKanbanDroppableId(params.destinationDroppableId);

  if (params.sourceDroppableId === params.destinationDroppableId) {
    return { reassign: false, newAssignedTo: params.currentAssignedTo, ignoredReason: "same_column" };
  }
  // Sub-colunas do mesmo usuário (production -> review etc.): nada muda.
  if ((src.userId ?? null) === (dest.userId ?? null)) {
    return { reassign: false, newAssignedTo: params.currentAssignedTo, ignoredReason: "same_owner" };
  }
  const newAssignedTo = dest.unassigned ? null : dest.userId;
  if ((params.currentAssignedTo ?? null) === (newAssignedTo ?? null)) {
    return { reassign: false, newAssignedTo, ignoredReason: "same_owner" };
  }
  return { reassign: true, newAssignedTo };
}

/** Um item só é arrastável quando representa uma DEMANDA REAL transferível. */
export function isCardDraggable(state: {
  selectionMode: boolean;
  historyMode: boolean;
  kind: "production" | "planning" | "review" | "awaiting" | "evaluate" | "history" | "queued";
  /** Fila de liberação: só arrasta o que já está operacionalmente liberado. */
  operationallyReleased?: boolean;
}): boolean {
  if (state.selectionMode) return false;
  if (state.historyMode) return false;
  if (state.kind === "history" || state.kind === "evaluate") return false;
  if (state.kind === "queued") return false;
  if (state.operationallyReleased === false) return false;
  return true;
}
