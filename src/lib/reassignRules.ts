/**
 * Regras PURAS da transferência administrativa (sem acesso a rede).
 * Consumidas por `src/lib/reassignDemand.ts`.
 */

/**
 * Normalização dos colaboradores extras numa transferência.
 *
 *  - sair de `captar` → lista zerada (extras existem só na captação);
 *  - continuar em `captar` → o novo responsável principal nunca fica duplicado
 *    entre os extras;
 *  - nada a gravar → `null`.
 */
export function normalizeAdditionalAssignees(params: {
  extras: string[] | null;
  currentFunctionKey: string | null;
  nextFunctionKey: string | null;
  newAssignedTo: string | null;
}): { value: string[] } | null {
  const extras = (params.extras || []).filter(Boolean);
  const isCaptar = (k: string | null) => (k || "").toLowerCase().trim() === "captar";
  const leavingCaptar = isCaptar(params.currentFunctionKey) && !isCaptar(params.nextFunctionKey);

  if (leavingCaptar) return extras.length > 0 ? { value: [] } : null;
  if (extras.length === 0) return null;
  const deduped = extras.filter((u) => u !== params.newAssignedTo);
  return deduped.length === extras.length ? null : { value: deduped };
}
