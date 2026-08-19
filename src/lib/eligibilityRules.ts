/**
 * Regras PURAS de elegibilidade de responsável (sem acesso a rede).
 * Consumidas por `src/lib/eligibleAssignees.ts`.
 */

export type EligibilityMode = "saved" | "draft";

export interface EligibilityCard {
  id?: string | null;
  demand_type_key?: string | null;
  work_area?: string | null;
  origin?: string | null;
  current_function_key?: string | null;
}

export interface EligibilityResolverArgs {
  demandTypeKey: string | null;
  currentFunctionKey: string | null;
  demandId: string | null;
  workArea: string | null;
  origin: string | null;
  mode: "flow" | "administrative_reassign";
}

/**
 * Parâmetros exatos do resolvedor para (card, modo):
 *  - card SALVO  → etapa ATUAL em modo administrativo (mesma pergunta do
 *    `evaluateReassign`, portanto com remapeamento de etapa);
 *  - RASCUNHO    → etapa INICIAL do fluxo (o card ainda não existe).
 */
export function eligibilityResolverArgs(
  card: EligibilityCard,
  mode: EligibilityMode,
): EligibilityResolverArgs {
  const saved = mode === "saved";
  return {
    demandTypeKey: card.demand_type_key ?? null,
    currentFunctionKey: saved ? card.current_function_key ?? null : null,
    demandId: saved ? card.id ?? null : null,
    workArea: card.work_area ?? null,
    origin: card.origin ?? null,
    mode: saved ? "administrative_reassign" : "flow",
  };
}
