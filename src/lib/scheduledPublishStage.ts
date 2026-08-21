/**
 * ETAPA CANÔNICA DE PUBLICAÇÃO AGENDADA.
 *
 * Cards cuja etapa atual é `publicar` ("Publicar agendado") NÃO fazem parte da
 * fila operacional da Visão Geral (`/kanban-central`): eles já estão agendados e
 * têm tela própria (Home → Agendamentos). A comparação é feita SEMPRE pela
 * `function_key` estável, nunca pelo label exibido.
 *
 * Nada é excluído/alterado no banco — apenas não é renderizado/contado ali.
 */

/** `function_key` da etapa de publicação agendada (área Mídia). */
export const SCHEDULED_PUBLISH_FUNCTION_KEY = "publicar";

export function isScheduledPublishStageKey(key: string | null | undefined): boolean {
  return (key ?? null) === SCHEDULED_PUBLISH_FUNCTION_KEY;
}

/** Aceita qualquer objeto com `current_function_key`. */
export function isScheduledPublishStage(
  row: { current_function_key?: string | null } | null | undefined,
): boolean {
  return isScheduledPublishStageKey(row?.current_function_key ?? null);
}

/**
 * Predicado único usado pela Visão Geral (cards, agrupamentos, contadores,
 * reordenação e busca): o card sai do board operacional quando está na etapa
 * `publicar` OU quando possui dispatch de publicação ativo.
 */
export function isOutOfOperationalBoard(
  row: { id: string; current_function_key?: string | null },
  activeDispatchIds?: Set<string> | ReadonlySet<string> | null,
): boolean {
  if (isScheduledPublishStage(row)) return true;
  return !!activeDispatchIds?.has(row.id);
}
