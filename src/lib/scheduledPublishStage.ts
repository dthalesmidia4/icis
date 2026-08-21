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

/** `function_key` da conferência pós-agendamento. */
export const REVIEW_PUBLISH_FUNCTION_KEY = "revisar_publicacao";

export function isScheduledPublishStageKey(key: string | null | undefined): boolean {
  return (key ?? null) === SCHEDULED_PUBLISH_FUNCTION_KEY;
}

/** Aceita qualquer objeto com `current_function_key`. */
export function isScheduledPublishStage(
  row: { current_function_key?: string | null } | null | undefined,
): boolean {
  return isScheduledPublishStageKey(row?.current_function_key ?? null);
}

/** Data de hoje (YYYY-MM-DD) no fuso do expediente. */
export function operationalToday(
  now: Date = new Date(),
  tz = "America/Sao_Paulo",
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * `revisar_publicacao` = já agendado, aguardando a data para o responsável
 * conferir. Antes da data de publicação o card NÃO polui a coluna nem entra
 * em contagem; no dia da publicação (ou depois) volta a ser um card normal.
 * Sem `publish_date` nada é escondido.
 */
export function isPendingScheduledReview(
  row: { current_function_key?: string | null; publish_date?: string | null } | null | undefined,
  today: string = operationalToday(),
): boolean {
  if ((row?.current_function_key ?? null) !== REVIEW_PUBLISH_FUNCTION_KEY) return false;
  const publishDate = row?.publish_date ?? null;
  if (!publishDate) return false;
  return publishDate.slice(0, 10) > today;
}

/**
 * Predicado único usado pela Visão Geral (cards, agrupamentos, contadores,
 * reordenação e busca): o card sai do board operacional quando está na etapa
 * `publicar`, quando possui dispatch de publicação ativo, ou quando é uma
 * conferência de publicação cuja data ainda não chegou.
 */
export function isOutOfOperationalBoard(
  row: { id: string; current_function_key?: string | null; publish_date?: string | null },
  activeDispatchIds?: Set<string> | ReadonlySet<string> | null,
  today?: string,
): boolean {
  if (isScheduledPublishStage(row)) return true;
  if (isPendingScheduledReview(row, today)) return true;
  return !!activeDispatchIds?.has(row.id);
}

