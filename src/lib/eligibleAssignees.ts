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
import { eligibilityResolverArgs } from "@/lib/eligibilityRules";
import { normalizeWorkArea } from "@/lib/flowFunctions";
import { isClientOrigin } from "@/lib/proceedDemand";
import { loadSharedFlowContext, resolveFunctionsFromContext } from "@/lib/flowResolution";

export type { EligibilityMode, EligibilityCard, EligibilityResolverArgs } from "@/lib/eligibilityRules";
export { eligibilityResolverArgs };

import type { EligibilityCard, EligibilityMode } from "@/lib/eligibilityRules";

export interface AssigneeEligibility {
  eligible: boolean;
  /** Etapa que a pessoa assumiria (já remapeada quando necessário). */
  functionKey: string | null;
}

/**
 * Elegibilidade de cada colaborador para receber o card — resolvida EM LOTE.
 *
 * Uma chamada faz no máximo: 1× flow_functions, 1× demand_type_flow_rules,
 * 1× collaborator_function_assignments (`in user_id`) e 1× histórico do card.
 * Nada de consulta por colaborador. As regras são as mesmas de
 * `resolveFunctionForAssignee` (núcleo puro compartilhado).
 *
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

  const started = import.meta.env.DEV ? performance.now() : 0;
  try {
    const context = await loadSharedFlowContext({
      tenantId,
      area: normalizeWorkArea(args.workArea ?? undefined),
      clientOrigin: isClientOrigin(args.origin ?? undefined),
      demandTypeKey: args.demandTypeKey,
      demandId: args.demandId,
      userIds,
    });
    const resolved = resolveFunctionsFromContext({
      context,
      userIds,
      currentFunctionKey: args.currentFunctionKey,
      administrative: args.mode === "administrative_reassign",
    });
    if (import.meta.env.DEV) {
      console.debug(
        `[perf] eligible-assignees ${(performance.now() - started).toFixed(1)}ms · ${userIds.length} colaborador(es) · consultas compartilhadas`,
      );
    }
    // A UI NÃO PRÉ-BLOQUEIA: `functionKey` é apenas uma DICA de qual etapa a
    // pessoa assumiria. A decisão (e o eventual bloqueio real) é do kernel do
    // banco no momento da transferência — o fato de o responsável atual não
    // possuir a etapa nunca esconde um colaborador do seletor.
    return Object.fromEntries(
      userIds.map((userId) => {
        const key = resolved[userId] ?? null;
        return [userId, { eligible: true, functionKey: key }];
      }),
    ) as Record<string, AssigneeEligibility>;

  } catch {
    // Nunca esconder colaborador por falha de leitura.
    return Object.fromEntries(
      userIds.map((userId) => [userId, { eligible: true, functionKey: null }]),
    ) as Record<string, AssigneeEligibility>;
  }
}

