/**
 * ELEGIBILIDADE DE RESPONSÁVEL — PONTO ÚNICO PARA SELETORES DE UI.
 *
 * Antes cada tela calculava "quem pode receber este card" com parâmetros
 * próprios (normalmente `currentKey = null` e modo `flow`), o que desabilitava
 * colaboradores que o contrato de reatribuição (`evaluateReassign`) aceitaria
 * com remapeamento de etapa. Agora existe um único resolvedor:
 *
 *  - card SALVO  → mesma pergunta do `evaluateReassign`: a etapa ATUAL do card
 *    com `mode: "administrative_reassign"` (respeita barreiras de cliente,
 *    etapas já concluídas e anti-autorrevisão);
 *  - RASCUNHO    → o card ainda não existe: pergunta a etapa INICIAL do fluxo
 *    (`currentKey = null`, modo `flow`).
 *
 * Nada é gravado aqui.
 */
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";

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
 * Parâmetros exatos do resolvedor para (card, modo). Exposto separadamente para
 * permitir teste puro da regra sem rede.
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

export interface AssigneeEligibility {
  eligible: boolean;
  /** Etapa que a pessoa assumiria (já remapeada quando necessário). */
  functionKey: string | null;
}

/**
 * Elegibilidade de cada colaborador para receber o card.
 * Falha de leitura NUNCA esconde colaborador (a decisão final é do contrato
 * `evaluateReassign`, que roda no momento da transferência).
 */
export async function listEligibleAssignees(params: {
  tenantId: string;
  card: EligibilityCard;
  userIds: string[];
  mode: EligibilityMode;
}): Promise<Record<string, AssigneeEligibility>> {
  const { tenantId, card, userIds } = params;
  const args = eligibilityResolverArgs(card, params.mode);
  if (!tenantId || userIds.length === 0) return {};

  const entries = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const key = await resolveFunctionForAssignee(
          tenantId,
          userId,
          args.demandTypeKey,
          args.currentFunctionKey,
          args.demandId,
          { workArea: args.workArea, origin: args.origin, mode: args.mode },
        );
        return [userId, { eligible: !!key, functionKey: key ?? null }] as const;
      } catch {
        return [userId, { eligible: true, functionKey: null }] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
