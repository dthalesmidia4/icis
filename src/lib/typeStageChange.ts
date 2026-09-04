/**
 * TROCA DE TIPO + ETAPA (long-press do chip de etapa na Visão Geral).
 *
 * Regras:
 *  - a mesma etapa em outro tipo é um DESTINO NOVO: tipo e etapa mudam juntos,
 *    em uma única gravação condicionada ao estado esperado (RPC com
 *    compare-and-set). Nunca existe "tipo novo + etapa antiga";
 *  - a validade da ETAPA é a do FLUXO (kernel no banco). O responsável não
 *    bloqueia a escolha: `transition_demand_v2` mantém o responsável atual
 *    quando ele é elegível (`preferred_user_id`) ou escolhe outro. Cards sem
 *    responsável também podem trocar de etapa/tipo;
 *  - a passagem em execução é encerrada pelo GUARD de saída (o chamador usa
 *    `useExecutionExitGuard`, que só fecha o run APÓS o sucesso confirmado);
 *  - o tempo operacional personalizado da etapa antiga não é herdado.
 */
import { transitionDemand } from "@/lib/demandTransition";
import { saveStageDurationOverrides } from "@/lib/durationOverrides";
import {
  loadTypeStageGroups,
  typeStageChoiceError,
  type TypeStageCard,
  type TypeStageGroup,
} from "@/lib/typeStageOptions";
import type { StageDecisionMode } from "@/lib/stageOptions";

export interface TypeStageChangeParams {
  tenantId: string;
  card: TypeStageCard & { assigned_to?: string | null };
  targetTypeKey: string;
  targetTypeLabel?: string | null;
  targetFunctionKey: string;
  /** Origem do registro no histórico (tela que disparou). */
  source?: string;
  /** Contexto da decisão (mantido para compatibilidade das chamadas). */
  mode?: StageDecisionMode;
  /**
   * Grupos JÁ carregados pelo popover. Quando informados, a checagem de
   * pertencimento ao fluxo não é refeita — a gravação continua protegida por
   * compare-and-set e pelo kernel.
   */
  validatedGroups?: TypeStageGroup[];
}

export type TypeStageChangeResult =
  | { status: "ok"; message: string }
  | { status: "invalid"; message: string }
  | { status: "stale"; message: string }
  | { status: "error"; message: string };

const norm = (v?: string | null) => (v ?? "").trim();

/** Aplica a troca sempre pela autoridade única de transição. */
export async function applyTypeStageChange(
  params: TypeStageChangeParams,
): Promise<TypeStageChangeResult> {
  const { tenantId, card } = params;
  const currentType = norm(card.demand_type_key);
  const targetType = norm(params.targetTypeKey);
  const targetStage = norm(params.targetFunctionKey);

  if (!targetStage) return { status: "invalid", message: "Escolha uma etapa." };

  const groups =
    params.validatedGroups ?? (await loadTypeStageGroups({ tenantId, card })).groups;
  const invalid = typeStageChoiceError(groups, targetType || currentType, targetStage);
  if (invalid) return { status: "invalid", message: invalid };

  const sameType = !targetType || targetType === currentType;

  const result = await transitionDemand({
    demandId: card.id,
    intent: sameType ? "jump_stage" : "change_type",
    targetFunctionKey: targetStage,
    ...(sameType
      ? {}
      : { targetTypeKey: targetType, targetTypeLabel: params.targetTypeLabel ?? null }),
    // Preferência, nunca alvo duro: o banco troca de responsável se preciso.
    preferredUserId: card.assigned_to ?? null,
    administrative: true,
    expected: {
      assignedTo: card.assigned_to ?? null,
      functionKey: card.current_function_key ?? null,
    },
    source: params.source ?? "type_stage_quick_change",
    metadata: sameType
      ? { change: "demand_stage" }
      : {
          change: "demand_type_and_stage",
          from_demand_type_key: currentType || null,
          to_demand_type_key: targetType,
        },
  });

  if (result.status === "stale") return { status: "stale", message: result.message };
  if (result.status === "blocked") return { status: "invalid", message: result.message };
  if (result.status === "error") return { status: "error", message: result.message };

  await dropStageDurationOverride(tenantId, card.id, card.current_function_key, targetStage);

  return {
    status: "ok",
    message: sameType ? "Etapa alterada." : "Tipo e etapa atualizados.",
  };
}



/**
 * O tempo personalizado pertence a (demanda, etapa). Ao sair da etapa antiga
 * o override dela é removido para que a nova etapa use o tempo padrão.
 */
async function dropStageDurationOverride(
  tenantId: string,
  demandId: string,
  previousFunctionKey?: string | null,
  nextFunctionKey?: string | null,
): Promise<void> {
  const previous = norm(previousFunctionKey);
  if (!previous || previous === norm(nextFunctionKey)) return;
  await saveStageDurationOverrides(tenantId, [], [{ demandId, functionKey: previous }]);
}
