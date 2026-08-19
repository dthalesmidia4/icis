/**
 * ETAPAS DE TODOS OS TIPOS DE ATIVIDADE DA MESMA ÁREA.
 *
 * `src/lib/stageOptions.ts` responde "quais etapas do TIPO ATUAL este
 * colaborador pode executar". Este módulo estende a pergunta para "quais
 * etapas de QUALQUER tipo da mesma área ele pode executar", preservando
 * exatamente as mesmas regras de validade (função habilitada, etapa já
 * concluída, anti-autorrevisão, etapa client-facing em decisão administrativa).
 *
 * Serve ao long-press do chip de etapa na Visão Geral: mostrar o tipo atual em
 * primeiro lugar e, abaixo, os outros tipos disponíveis — nunca esconder uma
 * etapa sem explicar o motivo.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeWorkArea, type WorkArea } from "@/lib/flowFunctions";
import { isClientOrigin } from "@/lib/proceedDemand";
import { getStageCompletions, hasUserCompletedStage } from "@/lib/stageCompletions";
import {
  computeStageOptions,
  type StageOption,
  type StageSequenceItem,
} from "@/lib/stageOptions";

export interface TypeStageCard {
  id: string;
  demand_type_key?: string | null;
  demand_type?: string | null;
  work_area?: string | null;
  origin?: string | null;
  current_function_key?: string | null;
}

export interface AreaDemandType {
  demandTypeKey: string;
  demandTypeLabel: string;
  sequence: StageSequenceItem[];
}

export interface TypeStageOption extends StageOption {
  demandTypeKey: string;
  demandTypeLabel: string;
  isCurrentType: boolean;
  isCurrentStage: boolean;
}

export interface TypeStageGroup {
  demandTypeKey: string;
  demandTypeLabel: string;
  isCurrentType: boolean;
  stages: TypeStageOption[];
  /** Alguma etapa executável neste tipo pelo responsável atual? */
  hasValidStage: boolean;
}

const norm = (v?: string | null) => (v ?? "").trim();

/** Rótulo legível quando o tipo não tem nome cadastrado. */
export function humanizeTypeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/* ============================== LÓGICA PURA ============================== */

export interface ComputeTypeStageGroupsParams {
  types: AreaDemandType[];
  currentTypeKey?: string | null;
  currentFunctionKey?: string | null;
  allowedKeys: Set<string> | string[];
  completedByUser?: Set<string> | string[];
  administrative?: boolean;
  /** Nome do responsável — usado nos motivos de bloqueio. */
  assigneeName?: string | null;
}

/**
 * Grupos por tipo: o tipo atual primeiro, os demais em ordem alfabética.
 * Tipos sem nenhuma etapa configurada são descartados (não há para onde ir).
 */
export function computeTypeStageGroups(
  params: ComputeTypeStageGroupsParams,
): TypeStageGroup[] {
  const currentType = norm(params.currentTypeKey);
  const currentStage = norm(params.currentFunctionKey);
  const who = (params.assigneeName ?? "").trim();

  const groups = params.types
    .filter((t) => t.sequence.length > 0)
    .map<TypeStageGroup>((t) => {
      const isCurrentType = norm(t.demandTypeKey) === currentType && !!currentType;
      const options = computeStageOptions({
        sequence: t.sequence,
        allowedKeys: params.allowedKeys,
        completedByUser: params.completedByUser,
        // Só o tipo ATUAL tem "etapa atual": em outro tipo, tudo é destino novo.
        currentKey: isCurrentType ? currentStage || null : null,
        administrative: params.administrative !== false,
      });

      const stages = options.map<TypeStageOption>((o) => ({
        ...o,
        reasonLabel:
          o.reason === "not_allowed" && who
            ? `${who} não possui esta etapa habilitada`
            : o.reasonLabel,
        demandTypeKey: t.demandTypeKey,
        demandTypeLabel: t.demandTypeLabel,
        isCurrentType,
        isCurrentStage: isCurrentType && o.functionKey === currentStage,
      }));

      return {
        demandTypeKey: t.demandTypeKey,
        demandTypeLabel: t.demandTypeLabel,
        isCurrentType,
        stages,
        hasValidStage: stages.some((s) => s.valid),
      };
    });

  return groups.sort((a, b) => {
    if (a.isCurrentType !== b.isCurrentType) return a.isCurrentType ? -1 : 1;
    return a.demandTypeLabel.localeCompare(b.demandTypeLabel, "pt-BR");
  });
}

/** Encontra uma opção específica dentro dos grupos (validação pontual). */
export function findTypeStageOption(
  groups: TypeStageGroup[],
  demandTypeKey: string,
  functionKey: string,
): TypeStageOption | null {
  for (const g of groups) {
    if (norm(g.demandTypeKey) !== norm(demandTypeKey)) continue;
    const found = g.stages.find((s) => s.functionKey === functionKey);
    if (found) return found;
  }
  return null;
}

/** Erro legível quando a escolha não é aceitável. */
export function typeStageChoiceError(
  groups: TypeStageGroup[],
  demandTypeKey: string,
  functionKey: string,
): string | null {
  const found = findTypeStageOption(groups, demandTypeKey, functionKey);
  if (!found) return "Etapa fora dos fluxos configurados para esta área";
  return found.valid ? null : found.reasonLabel || "Etapa inválida para este colaborador";
}

/* ============================== CARREGAMENTO ============================== */

interface FlowFunctionRow {
  function_key: string;
  name: string | null;
  requires_client_origin: boolean | null;
}

/**
 * Todos os tipos de atividade configurados na área, cada um com sua sequência
 * real de etapas. O tipo atual do card entra mesmo sem regras próprias
 * (nesse caso usa a sequência completa da área).
 */
export async function loadAreaDemandTypes(
  tenantId: string,
  card: TypeStageCard,
): Promise<AreaDemandType[]> {
  const area: WorkArea = normalizeWorkArea(card.work_area ?? undefined);
  const clientOrigin = isClientOrigin(card.origin ?? undefined);

  const [{ data: fnRows }, { data: ruleRows }] = await Promise.all([
    (supabase.from("flow_functions") as any)
      .select("function_key, name, position, active, requires_client_origin")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("work_area", area)
      .neq("function_key", "avaliar")
      .order("position"),
    (supabase.from("demand_type_flow_rules") as any)
      .select("demand_type_key, demand_type_name, function_key, requirement")
      .eq("tenant_id", tenantId)
      .eq("work_area", area),
  ]);

  const fns = (((fnRows as any[]) || []) as FlowFunctionRow[]).filter((f) =>
    f.requires_client_origin ? clientOrigin : true,
  );
  const fullSequence: StageSequenceItem[] = fns.map((f) => ({
    functionKey: f.function_key,
    name: f.name || humanizeTypeKey(f.function_key),
  }));

  const byType = new Map<string, { label: string; required: Set<string> }>();
  for (const row of ((ruleRows as any[]) || [])) {
    const key = norm(row.demand_type_key);
    if (!key) continue;
    const entry =
      byType.get(key) ??
      { label: norm(row.demand_type_name) || humanizeTypeKey(key), required: new Set<string>() };
    if (row.requirement === "required" && row.function_key !== "avaliar") {
      entry.required.add(row.function_key as string);
    }
    byType.set(key, entry);
  }

  const types: AreaDemandType[] = [];
  for (const [key, entry] of byType) {
    const sequence =
      entry.required.size > 0
        ? fullSequence.filter((s) => entry.required.has(s.functionKey))
        : fullSequence;
    types.push({ demandTypeKey: key, demandTypeLabel: entry.label, sequence });
  }

  const currentKey = norm(card.demand_type_key);
  if (currentKey && !byType.has(currentKey)) {
    types.push({
      demandTypeKey: currentKey,
      demandTypeLabel: norm(card.demand_type) || humanizeTypeKey(currentKey),
      sequence: fullSequence,
    });
  }

  return types;
}

export interface LoadTypeStageGroupsResult {
  groups: TypeStageGroup[];
  types: AreaDemandType[];
}

/**
 * Grupos (tipo → etapas) para o par (demanda, responsável atual).
 * Nada é gravado aqui.
 */
export async function loadTypeStageGroups(params: {
  tenantId: string;
  card: TypeStageCard;
  userId: string;
  administrative?: boolean;
  assigneeName?: string | null;
}): Promise<LoadTypeStageGroupsResult> {
  const { tenantId, card, userId } = params;
  const area = normalizeWorkArea(card.work_area ?? undefined);

  const [types, allowedRows, completions] = await Promise.all([
    loadAreaDemandTypes(tenantId, card),
    (supabase.from("collaborator_function_assignments") as any)
      .select("function_key")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("work_area", area)
      .eq("allowed", true)
      .neq("function_key", "avaliar"),
    getStageCompletions(tenantId, card.id),
  ]);

  const allowedKeys = new Set(
    (((allowedRows as any)?.data as any[]) || []).map((r) => r.function_key as string),
  );

  const allStageKeys = new Set<string>();
  for (const t of types) for (const s of t.sequence) allStageKeys.add(s.functionKey);

  const completedByUser = new Set<string>();
  for (const key of allStageKeys) {
    if (hasUserCompletedStage(completions as any, key, userId)) completedByUser.add(key);
  }

  const groups = computeTypeStageGroups({
    types,
    currentTypeKey: card.demand_type_key,
    currentFunctionKey: card.current_function_key,
    allowedKeys,
    completedByUser,
    administrative: params.administrative !== false,
    assigneeName: params.assigneeName ?? null,
  });

  return { groups, types };
}
