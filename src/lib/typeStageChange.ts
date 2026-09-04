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
import { transitionDemand } from "@/lib/demandTransition";
import { jumpToFunction, type ProceedResult } from "@/lib/proceedDemand";
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
  /**
   * Contexto da decisão. O long-press do chip é uma ESCOLHA MANUAL: etapas já
   * concluídas pelo responsável continuam disponíveis (só o histórico registra).
   */
  mode?: StageDecisionMode;
  /**
   * Grupos JÁ validados pelo popover (a opção clicada veio de `valid=true`).
   * Quando informados, a validação não é refeita do zero — a gravação continua
   * protegida por compare-and-set, então nenhuma etapa proibida passa.
   */
  validatedGroups?: TypeStageGroup[];
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

  // Validação: reaproveita os grupos recém-carregados pelo popover quando
  // existirem; senão recalcula contra o banco.
  const groups =
    params.validatedGroups ??
    (
      await loadTypeStageGroups({
        tenantId,
        card,
        userId: card.assigned_to,
        administrative: true,
        mode: params.mode ?? "manual_stage_change",
      })
    ).groups;
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

  // AUTORIDADE ÚNICA: tipo + etapa mudam juntos, validados e gravados pelo
  // kernel (`transition_demand_v2`), com trava, compare-and-set e histórico.
  const result = await transitionDemand({
    demandId: card.id,
    intent: "change_type",
    targetTypeKey: targetType,
    targetTypeLabel: params.targetTypeLabel ?? null,
    targetFunctionKey: targetStage,
    targetUserId: card.assigned_to,
    administrative: true,
    expected: {
      assignedTo: card.assigned_to,
      functionKey: card.current_function_key ?? null,
    },
    source: params.source ?? "type_stage_quick_change",
    metadata: {
      change: "demand_type_and_stage",
      from_demand_type_key: currentType || null,
      to_demand_type_key: targetType,
    },
  });

  if (result.status === "stale") return { status: "stale", message: result.message };
  if (result.status === "blocked") return { status: "invalid", message: result.message };
  if (result.status === "error") return { status: "error", message: result.message };

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
