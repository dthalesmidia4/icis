/**
 * Regras da aba Briefing no TaskCard.
 *
 * Cards de Mídia devem SEMPRE poder preencher o briefing estruturado, mesmo
 * quando `demands.content_brief` ainda é null (criação manual). O briefing
 * vazio é apenas de renderização: nada é gravado no banco por abrir o card.
 */

export const EMPTY_CONTENT_BRIEF: Record<string, any> = { version: 1 };

export function isMediaWorkArea(workArea?: string | null): boolean {
  return workArea !== "sistemas";
}

/**
 * Briefing usado para renderizar/editar a aba.
 * - existe conteúdo → usa exatamente o existente (nunca substitui);
 * - Mídia sem conteúdo → briefing vazio seguro (não persistido);
 * - Sistemas sem conteúdo → null (comportamento anterior, sem aba).
 */
export function resolveBriefForEditing(
  brief: Record<string, any> | null | undefined,
  workArea?: string | null,
): Record<string, any> | null {
  if (brief && typeof brief === "object") return brief;
  return isMediaWorkArea(workArea) ? { ...EMPTY_CONTENT_BRIEF } : null;
}

/** A aba Briefing aparece quando há briefing existente ou o card é de Mídia. */
export function shouldShowBriefingTab(
  brief: Record<string, any> | null | undefined,
  workArea?: string | null,
): boolean {
  return resolveBriefForEditing(brief, workArea) !== null;
}
