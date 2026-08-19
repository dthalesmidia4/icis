/**
 * TROCA DE TIPO + ETAPA (long-press do chip de etapa na Visão Geral).
 *
 * Regras:
 *  - a mesma etapa em outro tipo é um DESTINO NOVO: tipo e etapa mudam juntos,
 *    em uma única gravação condicionada ao estado esperado (RPC com
 *    compare-and-set). Nunca existe "tipo novo + etapa antiga";
 *  - a validade é sempre a do RESPONSÁVEL ATUAL (mesmas regras de
 *    `stageOptions`): função habilitada, etapa não repetida, sem autorrevisão,
 *    sem pular para etapa de cliente numa decisão administrativa;
 *  - a passagem em execução é encerrada pelo GUARD de saída (o chamador usa
 *    `useExecutionExitGuard`, que só fecha o run APÓS o sucesso confirmado —
 *    aqui nunca se fecha run diretamente) e a mudança fica no histórico;
 *  - o tempo operacional personalizado da etapa antiga não é herdado: a etapa
 *    nova volta ao tempo padrão do fluxo.
 */
import { supabase } from "@/integrations/supabase/client";
import { recordFlowHistory } from "@/lib/flowHistory";
import { jumpToFunction, type ProceedResult } from "@/lib/proceedDemand";
import { saveStageDurationOverrides } from "@/lib/durationOverrides";
import {
  loadTypeStageGroups,
  typeStageChoiceError,
  type TypeStageCard,
} from "@/lib/typeStageOptions";

export interface TypeStageChangeParams {
  tenantId: string;
  card: TypeStageCard & { assigned_to?: string | null };
  targetTypeKey: string;
  targetTypeLabel?: string | null;
  targetFunctionKey: string;
  /** Origem do registro no histórico (tela que disparou). */
  source?: string;
}

export type TypeStageChangeResult =
  | { status: "ok"; message: string }
  | { status: "invalid"; message: string }
  | { status: "stale"; message: string }
  | { status: "error"; message: string };

const norm = (v?: string | null) => (v ?? "").trim();

/**
 * Aplica a troca. Quando o tipo não muda, delega para o caminho normal de
 * fluxo (`jumpToFunction`), que já cuida de histórico e responsável.
 */
export async function applyTypeStageChange(
  params: TypeStageChangeParams,
): Promise<TypeStageChangeResult> {
  const { tenantId, card } = params;
  const currentType = norm(card.demand_type_key);
  const targetType = norm(params.targetTypeKey);
  const targetStage = norm(params.targetFunctionKey);

  if (!targetStage) return { status: "invalid", message: "Escolha uma etapa." };

  if (!card.assigned_to) {
    return {
      status: "invalid",
      message: "Defina um responsável antes de trocar a etapa deste card.",
    };
  }

  // Validação autoritativa: sempre recalculada contra o banco.
  const { groups } = await loadTypeStageGroups({
    tenantId,
    card,
    userId: card.assigned_to,
    administrative: true,
  });
  const invalid = typeStageChoiceError(groups, targetType, targetStage);
  if (invalid) return { status: "invalid", message: invalid };

  if (targetType === currentType || !targetType) {
    const res: ProceedResult = await jumpToFunction({
      demandId: card.id,
      tenantId,
      demandTypeKey: card.demand_type_key ?? null,
      targetFunctionKey: targetStage,
      currentFunctionKey: card.current_function_key ?? null,
    });
    if (!res.success) {
      return { status: "error", message: res.message || "Não foi possível alterar a etapa." };
    }
    await dropStageDurationOverride(tenantId, card.id, card.current_function_key, targetStage);
    return { status: "ok", message: res.message || "Etapa alterada." };
  }

  const { data, error } = await (supabase as any).rpc("change_demand_type_and_stage", {
    p_demand_id: card.id,
    p_next_type_key: targetType,
    p_next_function_key: targetStage,
    p_next_assigned_to: card.assigned_to,
    p_expected_type_key: currentType,
    p_expected_function_key: norm(card.current_function_key),
    p_expected_assigned_to: card.assigned_to,
    p_next_type_label: norm(params.targetTypeLabel) || null,
  });

  if (error) {
    console.error("[typeStageChange] rpc error", error);
    return { status: "error", message: "Não foi possível trocar o tipo e a etapa." };
  }
  if ((data as any)?.status !== "ok") {
    return {
      status: "stale",
      message: "Este card mudou enquanto você decidia. Nada foi alterado — recarregue e tente novamente.",
    };
  }

  await recordFlowHistory({
    tenantId,
    demandId: card.id,
    action: "manual_assignment",
    fromUserId: card.assigned_to,
    toUserId: card.assigned_to,
    fromFunctionKey: card.current_function_key ?? null,
    toFunctionKey: targetStage,
    metadata: {
      source: params.source ?? "type_stage_quick_change",
      change: "demand_type_and_stage",
      from_demand_type_key: currentType || null,
      to_demand_type_key: targetType,
    },
  });

  await dropStageDurationOverride(tenantId, card.id, card.current_function_key, targetStage);

  return { status: "ok", message: "Tipo e etapa atualizados." };
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
