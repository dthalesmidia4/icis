/**
 * Decisão de foco inicial da Visão Geral.
 *
 * Regras:
 * - gestor/admin/super_admin → visão completa (null);
 * - colaborador com ao menos 1 card operacional atribuído → foca a própria coluna;
 * - colaborador sem nenhum card atribuído → visão completa (evita quadro vazio).
 */
export interface FocusCandidateCard {
  assigned_to?: string | null;
  additional_assignees?: string[] | null;
}

export function isAssignedToUser(card: FocusCandidateCard, userId: string): boolean {
  if (!userId) return false;
  if (card.assigned_to === userId) return true;
  return Array.isArray(card.additional_assignees) && card.additional_assignees.includes(userId);
}

export function countAssignedCards(cards: FocusCandidateCard[], userId: string): number {
  if (!userId) return 0;
  return cards.reduce((acc, card) => (isAssignedToUser(card, userId) ? acc + 1 : acc), 0);
}

export function resolveInitialOverviewFocus(params: {
  canManageQueue: boolean;
  userId: string | null | undefined;
  cards: FocusCandidateCard[];
}): string | null {
  const { canManageQueue, userId, cards } = params;
  if (canManageQueue) return null;
  if (!userId) return null;
  return countAssignedCards(cards, userId) > 0 ? userId : null;
}

/**
 * Após atualizações (realtime/filtros), se o colaborador está focado na PRÓPRIA
 * coluna e ela ficou sem cards visíveis, o foco deve ser abandonado.
 * Nunca desfaz foco manual de gestor em coluna alheia, nem durante busca ativa.
 */
export function shouldExitEmptyOwnFocus(params: {
  focusedColumnId: string | null;
  canManageQueue: boolean;
  userId: string | null | undefined;
  isSearching: boolean;
  visibleCards: FocusCandidateCard[];
}): boolean {
  const { focusedColumnId, canManageQueue, userId, isSearching, visibleCards } = params;
  if (isSearching) return false;
  if (canManageQueue) return false;
  if (!userId || !focusedColumnId) return false;
  if (focusedColumnId !== userId) return false;
  return countAssignedCards(visibleCards, userId) === 0;
}
