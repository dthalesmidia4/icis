/**
 * Código estável da demanda (ex.: `DF-004`) extraído do título.
 *
 * Snapshots históricos em `period_plans.final_plan` competem com as demands
 * vivas quando o título/tipo muda após a materialização. O código é a chave
 * estável de precedência: existindo demand viva com o mesmo código, o snapshot
 * NÃO deve ser renderizado.
 */
export const extractDemandCode = (title?: string | null): string | null => {
  const match = String(title || "").match(/\bDF[\s\-–—_]?(\d{3})(?:[\s\-–—_]?([A-Z]))?\b/i);
  if (!match) return null;
  const suffix = match[2] ? `-${match[2].toUpperCase()}` : "";
  return `DF-${match[1]}${suffix}`;
};

/** Código do pai de um código com sufixo (`DF-002-A` -> `DF-002`). */
export const parentDemandCode = (code?: string | null): string | null => {
  const m = String(code || "").match(/^(DF-\d{3})-[A-Z]$/);
  return m ? m[1] : null;
};

/**
 * Códigos de cards que foram DIVIDIDOS em posts isolados: quando existem
 * `DF-002-A/B/...` vivos, o card-pai `DF-002` não deve ser renderizado como
 * mais uma célula do Feed (a entrega real são os filhos).
 */
export const splitParentCodes = (titles: (string | null | undefined)[]): Set<string> => {
  const parents = new Set<string>();
  titles.forEach((t) => {
    const parent = parentDemandCode(extractDemandCode(t));
    if (parent) parents.add(parent);
  });
  return parents;
};

/** Título normalizado para o fallback de deduplicação (itens sem código). */
export const normalizeDemandTitle = (title?: string | null): string =>
  String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

/** Referência a uma demand viva: UUID é a fonte de verdade; título é fallback. */
export type LiveDemandRef = string | null | undefined | { id?: string | null; title?: string | null };

const liveRefParts = (ref: LiveDemandRef): { id: string | null; title: string | null } => {
  if (ref && typeof ref === "object") return { id: ref.id ?? null, title: ref.title ?? null };
  return { id: null, title: (ref as string | null | undefined) ?? null };
};

/**
 * Remove itens de snapshot que já existem como demand viva.
 *
 * Precedência: `demand_id` (UUID real, imune a edição de título) → código
 * estável (DF-XXX) → título normalizado (snapshots legados sem UUID).
 */
export function dedupeSnapshotAgainstLive<
  T extends { titulo?: string | null; demand_id?: string | null },
>(snapshotItems: T[], live: LiveDemandRef[]): T[] {
  const liveIds = new Set<string>();
  const liveCodes = new Set<string>();
  const liveNormalized = new Set<string>();
  live.forEach((ref) => {
    const { id, title } = liveRefParts(ref);
    if (id) liveIds.add(id);
    const code = extractDemandCode(title);
    if (code) liveCodes.add(code);
    liveNormalized.add(normalizeDemandTitle(title));
  });

  return snapshotItems.filter((item) => {
    // UUID real: nunca cair em título/código quando o vínculo existe.
    if (item.demand_id) return !liveIds.has(item.demand_id);
    const code = extractDemandCode(item.titulo);
    if (code) return !liveCodes.has(code);
    return !liveNormalized.has(normalizeDemandTitle(item.titulo));
  });
}

