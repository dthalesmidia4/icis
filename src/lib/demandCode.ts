/**
 * Código estável da demanda (ex.: `DF-004`) extraído do título.
 *
 * Snapshots históricos em `period_plans.final_plan` competem com as demands
 * vivas quando o título/tipo muda após a materialização. O código é a chave
 * estável de precedência: existindo demand viva com o mesmo código, o snapshot
 * NÃO deve ser renderizado.
 */
export const extractDemandCode = (title?: string | null): string | null => {
  const match = String(title || "").match(/\bDF[\s\-–—_]?(\d{3})\b/i);
  return match ? `DF-${match[1]}` : null;
};

/** Título normalizado para o fallback de deduplicação (itens sem código). */
export const normalizeDemandTitle = (title?: string | null): string =>
  String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Remove itens de snapshot que já existem como demand viva
 * (precedência por código; fallback por título normalizado).
 */
export function dedupeSnapshotAgainstLive<T extends { titulo?: string | null }>(
  snapshotItems: T[],
  liveTitles: (string | null | undefined)[]
): T[] {
  const liveCodes = new Set<string>();
  const liveNormalized = new Set<string>();
  liveTitles.forEach((t) => {
    const code = extractDemandCode(t);
    if (code) liveCodes.add(code);
    liveNormalized.add(normalizeDemandTitle(t));
  });

  return snapshotItems.filter((item) => {
    const code = extractDemandCode(item.titulo);
    if (code) return !liveCodes.has(code);
    return !liveNormalized.has(normalizeDemandTitle(item.titulo));
  });
}
