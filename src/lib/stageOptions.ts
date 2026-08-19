/**
 * OPÇÕES DE ETAPA — helper central de "o usuário X pode executar a etapa Y
 * nesta demanda?".
 *
 * Um único lugar produz a lista de etapas válidas/inválidas para um par
 * (demanda, colaborador), com o MOTIVO de cada bloqueio. Consumidores:
 *  - Alocação em massa (seletor de etapa de destino, autoritativo);
 *  - Visão Geral (long-press no chip da etapa).
 *
 * Regras aplicadas (todas já existentes no fluxo, aqui reunidas):
 *  - sequência real do pipeline por `demand_type_key` + `work_area` + origem;
 *  - funções permitidas do colaborador (`collaborator_function_assignments`);
 *  - etapas já concluídas por ele neste card (`demand_flow_history`);
 *  - anti-auto-revisão (não revisa o que ele mesmo produziu);
 *  - etapas client-facing/sem tempo operacional são inválidas em decisão
 *    ADMINISTRATIVA (exigem evento real de processo).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  isClientFacingFunction,
  isReviewFunction,
  normalizeWorkArea,
  type WorkArea,
} from "@/lib/flowFunctions";
import { isClientOrigin } from "@/lib/proceedDemand";
import {
  isStageOutsideFlow,
  pickAdministrativeStage,
  sameAdministrativeSegment,
} from "@/lib/flowSegments";

import { getStageCompletions, hasUserCompletedStage } from "@/lib/stageCompletions";

export interface StageSequenceItem {
  functionKey: string;
  name: string;
}

export type StageInvalidReason =
  | "not_allowed"
  | "already_completed"
  | "self_review"
  | "client_facing"
  | "crosses_process_gate"
  | "outside_flow";

export interface StageOption {
  functionKey: string;
  name: string;
  index: number;
  valid: boolean;
  reason: StageInvalidReason | null;
  reasonLabel: string | null;
  /** Etapa sem consumo de agenda operacional. */
  untimed: boolean;
  clientFacing: boolean;
}

export const STAGE_REASON_LABEL: Record<StageInvalidReason, string> = {
  not_allowed: "Sem a função habilitada nesta área",
  already_completed: "Este colaborador já concluiu esta etapa neste card",
  self_review: "Não pode revisar a etapa que ele mesmo executou",
  client_facing: "Etapa de cliente: exige evento real do processo",
  crosses_process_gate: "Fora do segmento atual do fluxo (atravessa etapa de cliente)",
  outside_flow: "A etapa atual do card não pertence ao fluxo deste tipo",
};


/**
 * Contexto da decisão:
 *  - `administrative_reassign` (default): decisão automática/administrativa
 *    (alocação em massa, reatribuição). Repetir uma etapa que o colaborador já
 *    concluiu neste card é indesejado e fica bloqueado;
 *  - `manual_stage_change`: ESCOLHA MANUAL EXPLÍCITA de uma pessoa (long-press
 *    do chip da etapa). Aqui `already_completed` é apenas histórico — não
 *    impede a escolha. As demais regras (função habilitada, anti-autorrevisão,
 *    etapa de cliente, segmento do fluxo) continuam valendo.
 */
export type StageDecisionMode = "administrative_reassign" | "manual_stage_change";

export interface ComputeStageOptionsParams {
  sequence: StageSequenceItem[];
  /** Funções `allowed = true` do colaborador na área do card. */
  allowedKeys: Set<string> | string[];
  /** Etapas que ESTE colaborador já concluiu neste card. */
  completedByUser?: Set<string> | string[];
  currentKey?: string | null;
  /**
   * `true` (default) = decisão administrativa: etapas client-facing não podem
   * ser escolhidas. `false` = transição real de processo.
   */
  administrative?: boolean;
  mode?: StageDecisionMode;
}

const toSet = (v?: Set<string> | string[]): Set<string> =>
  v instanceof Set ? v : new Set(v || []);

/** Lista completa (válidas e inválidas, com motivo) na ordem da sequência. */
export function computeStageOptions(params: ComputeStageOptionsParams): StageOption[] {
  const allowed = toSet(params.allowedKeys);
  const completed = toSet(params.completedByUser);
  const administrative = params.administrative !== false;
  const manual = params.mode === "manual_stage_change";
  const current = (params.currentKey || "").trim() || null;
  const keys = params.sequence.map((s) => s.functionKey);
  const outsideFlow = isStageOutsideFlow(keys, current);

  return params.sequence.map((item, index) => {
    const key = item.functionKey;
    const clientFacing = isClientFacingFunction(key);
    let reason: StageInvalidReason | null = null;

    if (!allowed.has(key)) reason = "not_allowed";
    else if (!manual && completed.has(key) && key !== current) reason = "already_completed";
    else if (isReviewFunction(key) && completed.has(params.sequence[index - 1]?.functionKey || ""))
      reason = "self_review";
    else if (administrative && clientFacing && key !== current) reason = "client_facing";
    else if (administrative && outsideFlow) reason = "outside_flow";
    else if (
      administrative &&
      current &&
      !outsideFlow &&
      key !== current &&
      !sameAdministrativeSegment(keys, current, key)
    )
      reason = "crosses_process_gate";

    return {
      functionKey: key,
      name: item.name,
      index,
      valid: !reason,
      reason,
      reasonLabel: reason ? STAGE_REASON_LABEL[reason] : null,
      untimed: clientFacing,
      clientFacing,
    };
  });
}

export type StageSuggestionSource = "current" | "suggested";

export interface StageSuggestion {
  functionKey: string;
  source: StageSuggestionSource;
}

/**
 * Sugestão DETERMINÍSTICA: mantém a etapa atual quando válida; senão a primeira
 * válida à frente e depois atrás — sempre dentro do mesmo segmento
 * administrativo (barreiras de cliente nunca são atravessadas).
 * `null` = nenhuma etapa compatível (card não alocável sem escolha explícita).
 */
export function pickSuggestedStage(
  options: StageOption[],
  currentKey?: string | null,
): StageSuggestion | null {
  const current = (currentKey || "").trim() || null;
  const idx = current ? options.findIndex((o) => o.functionKey === current) : -1;
  if (idx >= 0 && options[idx].valid) return { functionKey: current as string, source: "current" };
  if (idx >= 0) {
    const keys = options.map((o) => o.functionKey);
    const picked = pickAdministrativeStage({
      sequence: keys,
      currentKey: current,
      usable: (k) => !!options.find((o) => o.functionKey === k && o.valid),
    });
    return picked ? { functionKey: picked, source: "suggested" } : null;
  }
  const first = options.find((o) => o.valid);
  return first ? { functionKey: first.functionKey, source: "suggested" } : null;
}


/** Etapas válidas comuns a TODOS os cards (seletor "aplicar etapa a todos"). */
export function commonValidStages(optionSets: StageOption[][]): StageSequenceItem[] {
  if (optionSets.length === 0) return [];
  const [first, ...rest] = optionSets;
  return first
    .filter((o) => o.valid)
    .filter((o) => rest.every((set) => set.some((x) => x.functionKey === o.functionKey && x.valid)))
    .map((o) => ({ functionKey: o.functionKey, name: o.name }));
}

/** Validação pontual: a etapa escolhida é aceitável para este par? */
export function stageChoiceError(options: StageOption[], functionKey: string): string | null {
  const found = options.find((o) => o.functionKey === functionKey);
  if (!found) return "Etapa fora do fluxo desta demanda";
  return found.valid ? null : found.reasonLabel || "Etapa inválida para este colaborador";
}

// ------------------------------------------------------------------
// Carregamento (mesmas tabelas usadas pelo motor de fluxo)
// ------------------------------------------------------------------

export interface StageOptionsCard {
  id: string;
  demand_type_key?: string | null;
  work_area?: string | null;
  origin?: string | null;
  current_function_key?: string | null;
}

export interface LoadStageOptionsResult {
  sequence: StageSequenceItem[];
  options: StageOption[];
  suggestion: StageSuggestion | null;
  /** A etapa atual do card não pertence ao fluxo do tipo (exige escolha explícita). */
  currentOutsideFlow: boolean;
}

/** Sequência real de etapas da demanda (área + tipo + origem). */
export async function loadStageSequence(
  tenantId: string,
  card: StageOptionsCard,
): Promise<StageSequenceItem[]> {
  const area: WorkArea = normalizeWorkArea(card.work_area ?? undefined);
  const clientOrigin = isClientOrigin(card.origin ?? undefined);
  const typeKey = (card.demand_type_key || "").trim();

  const [{ data: fns }, { data: rules }] = await Promise.all([
    (supabase.from("flow_functions") as any)
      .select("function_key, name, position, active, requires_client_origin")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("work_area", area)
      .neq("function_key", "avaliar")
      .order("position"),
    typeKey
      ? (supabase.from("demand_type_flow_rules") as any)
          .select("function_key, requirement")
          .eq("tenant_id", tenantId)
          .eq("work_area", area)
          .eq("demand_type_key", typeKey)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const required = new Set(
    ((rules as any[]) || [])
      .filter((r) => r.requirement === "required" && r.function_key !== "avaliar")
      .map((r) => r.function_key),
  );

  const list = (fns as any[]) || [];
  return (required.size > 0 ? list.filter((f) => required.has(f.function_key)) : list)
    .filter((f) => (f.requires_client_origin ? clientOrigin : true))
    .map((f) => ({ functionKey: f.function_key as string, name: (f.name as string) || f.function_key }));
}

/** Funções permitidas de um colaborador na área do card. */
export async function loadAllowedFunctionKeys(
  tenantId: string,
  userId: string,
  workArea?: string | null,
): Promise<Set<string>> {
  const area = normalizeWorkArea(workArea ?? undefined);
  const { data } = await (supabase.from("collaborator_function_assignments") as any)
    .select("function_key")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("work_area", area)
    .eq("allowed", true)
    .neq("function_key", "avaliar");
  return new Set(((data as any[]) || []).map((r) => r.function_key as string));
}

/**
 * Opções de etapa para um par (demanda, colaborador), já com sugestão
 * determinística. Nada é gravado.
 */
export async function loadStageOptionsForAssignee(params: {
  tenantId: string;
  card: StageOptionsCard;
  userId: string;
  administrative?: boolean;
  mode?: StageDecisionMode;
  /** Sequência já carregada (evita reconsulta por card na alocação em massa). */
  sequence?: StageSequenceItem[];
  allowedKeys?: Set<string>;
}): Promise<LoadStageOptionsResult> {
  const { tenantId, card, userId } = params;
  const [sequence, allowedKeys, completions] = await Promise.all([
    params.sequence ? Promise.resolve(params.sequence) : loadStageSequence(tenantId, card),
    params.allowedKeys
      ? Promise.resolve(params.allowedKeys)
      : loadAllowedFunctionKeys(tenantId, userId, card.work_area),
    getStageCompletions(tenantId, card.id),
  ]);

  const completedByUser = new Set<string>();
  for (const item of sequence) {
    if (hasUserCompletedStage(completions as any, item.functionKey, userId)) {
      completedByUser.add(item.functionKey);
    }
  }

  const options = computeStageOptions({
    sequence,
    allowedKeys,
    completedByUser,
    currentKey: card.current_function_key,
    administrative: params.administrative !== false,
    mode: params.mode,
  });

  return {
    sequence,
    options,
    suggestion: pickSuggestedStage(options, card.current_function_key),
    currentOutsideFlow: isStageOutsideFlow(
      sequence.map((s) => s.functionKey),
      card.current_function_key,
    ),
  };
}
