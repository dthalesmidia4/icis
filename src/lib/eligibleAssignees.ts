/**
 * ELEGIBILIDADE DE RESPONSÁVEL — PONTO ÚNICO PARA SELETORES DE UI.
 *
 * Antes cada tela calculava "quem pode receber este card" com parâmetros
 * próprios (normalmente `currentKey = null` e modo `flow`), o que desabilitava
 * colaboradores que o contrato de reatribuição (`evaluateReassign`) aceitaria
 * com remapeamento de etapa. Agora existe um único resolvedor, com as regras
 * puras em `src/lib/eligibilityRules.ts`.
 *
 * Nada é gravado aqui.
 */
import { resolveFunctionForAssignee } from "@/lib/initialFlowFunction";
import { eligibilityResolverArgs } from "@/lib/eligibilityRules";

export type { EligibilityMode, EligibilityCard, EligibilityResolverArgs } from "@/lib/eligibilityRules";
export { eligibilityResolverArgs };

import type { EligibilityCard, EligibilityMode } from "@/lib/eligibilityRules";

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

  return Object.fromEntries(entries) as Record<string, AssigneeEligibility>;
}
