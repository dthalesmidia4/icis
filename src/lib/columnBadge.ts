/**
 * BADGE DA COLUNA DA VISÃO GERAL — número único e sempre igual ao que a coluna mostra.
 *
 * O badge NUNCA pode vir de uma consulta paralela (`useCollaborators.demandCount`),
 * porque essa métrica conta tudo que está atribuído ao usuário — inclusive cards
 * com publicação agendada, que a coluna não renderiza. Foi assim que "Lúcia 37"
 * apareceu como "66".
 *
 * Regra: o badge é a contagem de IDs ÚNICOS entre os agrupamentos efetivamente
 * renderizados na coluna. Agrupar (revisão / aguardando cliente / avaliar /
 * sub-colunas do modo foco) reorganiza, nunca multiplica.
 */

export interface BadgeCountableCard {
  /** Demanda real. */
  id?: string | null;
  /** Item ainda sem demanda gravada (cards de avaliação usam `key`). */
  key?: string | null;
}

/** Identidades únicas entre todos os agrupamentos visíveis da coluna. */
export function countColumnBadge(
  groups: Array<ReadonlyArray<BadgeCountableCard> | null | undefined>,
): number {
  const ids = new Set<string>();
  for (const group of groups) {
    if (!group) continue;
    for (const card of group) {
      const identity = card?.id || card?.key;
      if (identity) ids.add(identity);
    }
  }
  return ids.size;
}

/**
 * Texto secundário (tooltip) que preserva a informação total sem poluir o número
 * principal: `37 na fila desta coluna · 29 com publicação/agendamento fora desta
 * visualização · 66 atribuídas no total`.
 */
export function describeColumnBadge(params: {
  badge: number;
  totalActiveDemandCount?: number | null;
}): string {
  const base = `${params.badge} na fila desta coluna`;
  const total = params.totalActiveDemandCount ?? null;
  if (total == null || total <= params.badge) return base;
  const hidden = total - params.badge;
  return `${base} · ${hidden} fora desta visualização (publicação/agendamento, avaliação ou fila) · ${total} atribuídas no total`;
}
