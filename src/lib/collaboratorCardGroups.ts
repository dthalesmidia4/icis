/**
 * Agrupamento CANÔNICO das demandas do colaborador (Modo Foco e
 * `/colaborador/:id/demandas`).
 *
 * Regras (puras, sem UI):
 * - `aguardando_cliente` SEMPRE forma agrupamento próprio;
 * - `planejar` SEMPRE forma agrupamento próprio (mesmo com 1 card) e nunca
 *   aparece na lista principal nem dentro de "Em revisão";
 * - funções de revisão só são agrupadas a partir do limiar existente
 *   (`REVIEW_GROUP_THRESHOLD`); abaixo dele seguem na lista principal.
 *
 * Nada aqui altera status, responsável ou ordenação: a ordem de entrada é
 * preservada em cada grupo.
 */
import {
  isClientSendFunction,
  isPublicationReviewFunction,
  isReviewFunction,
} from "@/lib/flowFunctions";

export const AWAITING_CLIENT_FUNCTION_KEY = "aguardando_cliente";
export const PLANNING_FUNCTION_KEY = "planejar";
/** Limiar histórico do agrupamento "Revisar" — não alterar. */
export const REVIEW_GROUP_THRESHOLD = 3;

export interface GroupableCard {
  current_function_key?: string | null;
}

export interface CollaboratorCardGroups<T extends GroupableCard> {
  awaitingCards: T[];
  planningCards: T[];
  clientSendCards: T[];
  publicationReviewCards: T[];
  reviewCards: T[];
  mainCards: T[];
  shouldGroupReview: boolean;
}

const normalize = (key?: string | null) => (key ?? "").toLowerCase().trim();

/** `true` só para a etapa de planejamento (chave exata `planejar`). */
export function isPlanningFunction(key?: string | null): boolean {
  return normalize(key) === PLANNING_FUNCTION_KEY;
}

export function isAwaitingClientFunction(key?: string | null): boolean {
  return normalize(key) === AWAITING_CLIENT_FUNCTION_KEY;
}

/** Cards que nunca podem ficar na lista principal/produção. */
function isOwnGroupFunction(key?: string | null): boolean {
  return (
    isAwaitingClientFunction(key) ||
    isPlanningFunction(key) ||
    isClientSendFunction(key) ||
    isPublicationReviewFunction(key)
  );
}

export function splitCollaboratorCardGroups<T extends GroupableCard>(
  cards: T[],
): CollaboratorCardGroups<T> {
  const awaitingCards: T[] = [];
  const planningCards: T[] = [];
  const clientSendCards: T[] = [];
  const publicationReviewCards: T[] = [];
  const reviewCandidates: T[] = [];
  const rest: T[] = [];

  for (const card of cards) {
    const key = card.current_function_key;
    if (isAwaitingClientFunction(key)) awaitingCards.push(card);
    else if (isPlanningFunction(key)) planningCards.push(card);
    else if (isClientSendFunction(key)) clientSendCards.push(card);
    // `revisar_publicacao` ANTES de `isReviewFunction`: nunca cai em "Revisar".
    else if (isPublicationReviewFunction(key)) publicationReviewCards.push(card);
    else if (isReviewFunction(key)) reviewCandidates.push(card);
    else rest.push(card);
  }

  const shouldGroupReview = reviewCandidates.length >= REVIEW_GROUP_THRESHOLD;

  return {
    awaitingCards,
    planningCards,
    clientSendCards,
    publicationReviewCards,
    reviewCards: shouldGroupReview ? reviewCandidates : [],
    // Abaixo do limiar, revisão de produção volta para a principal preservando a ordem original.
    mainCards: shouldGroupReview
      ? rest
      : cards.filter((c) => !isOwnGroupFunction(c.current_function_key)),
    shouldGroupReview,
  };
}


export default splitCollaboratorCardGroups;
