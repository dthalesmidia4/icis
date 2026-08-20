/**
 * Filtro de texto compartilhado da busca de demandas.
 *
 * Fonte de verdade única para "o card casa com o termo digitado?" — usado
 * tanto pelo filtro do quadro (Visão Geral) quanto por quem precisar da mesma
 * semântica. Puro: nenhuma dependência de React ou Supabase.
 */

export interface SearchableDemandLike {
  title?: string | null;
  clientName?: string | null;
  description?: string | null;
  objective?: string | null;
  /** Alias legado (algumas telas usam nomes em português). */
  objetivo?: string | null;
  instructions?: string | null;
  instrucoes?: string | null;
  observations?: string | null;
  post_caption?: string | null;
  demand_type?: string | null;
  status?: string | null;
  attachments?: Array<{ name?: string | null; type?: string | null }> | null;
  reference_attachments?: Array<{ name?: string | null; type?: string | null }> | null;
}

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Termos individuais do texto digitado (todos precisam casar — AND). */
export function searchTerms(term: string): string[] {
  return normalizeSearchText(term.trim())
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function haystackOf(item: SearchableDemandLike): string {
  const attachmentNames = [...(item.attachments || []), ...(item.reference_attachments || [])]
    .map((a) => `${a?.name || ""} ${a?.type || ""}`)
    .join(" ");

  return normalizeSearchText(
    [
      item.title,
      item.clientName,
      item.description,
      item.objective,
      item.objetivo,
      item.instructions,
      item.instrucoes,
      item.observations,
      item.post_caption,
      item.demand_type,
      item.status,
      attachmentNames,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * Termo vazio nunca esconde nada. Vários termos = AND (todos precisam existir
 * em algum dos campos do card).
 */
export function matchesDemandSearch(item: SearchableDemandLike, term: string): boolean {
  const terms = searchTerms(term || "");
  if (terms.length === 0) return true;
  const haystack = haystackOf(item);
  return terms.every((t) => haystack.includes(t));
}
