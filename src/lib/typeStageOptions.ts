/**
 * ETAPAS DE TODOS OS TIPOS DE ATIVIDADE DA MESMA ÁREA (fluxo canônico).
 *
 * As opções vêm do kernel no banco (`get_area_type_stage_options_v1`), que já
 * aplica: funções ativas, exclusão de `avaliar`, regras `requirement`
 * (incluindo `disabled`) e dependência de origem do cliente.
 *
 * IMPORTANTE: a seleção NÃO é bloqueada pelas funções do responsável atual.
 * Quem decide responsável é `transition_demand_v2`: mantém o atual quando
 * elegível, senão escolhe outro automaticamente (`preferred_user_id` é apenas
 * preferência). Cards sem responsável também podem trocar de etapa/tipo.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeWorkArea, type WorkArea } from "@/lib/flowFunctions";

export interface TypeStageCard {
  id: string;
  demand_type_key?: string | null;
  demand_type?: string | null;
  work_area?: string | null;
  origin?: string | null;
  current_function_key?: string | null;
}

export interface TypeStageOption {
  functionKey: string;
  name: string;
  position: number;
  clientFacing: boolean;
  review: boolean;
  demandTypeKey: string;
  demandTypeLabel: string;
  isCurrentType: boolean;
  isCurrentStage: boolean;
  /** O fluxo aceita esta etapa. O responsável é resolvido pelo servidor. */
  valid: boolean;
  reasonLabel: string | null;
}

export interface TypeStageGroup {
  demandTypeKey: string;
  demandTypeLabel: string;
  isCurrentType: boolean;
  stages: TypeStageOption[];
  hasValidStage: boolean;
}

const norm = (v?: string | null) => (v ?? "").trim();

/** Rótulo legível quando o tipo não tem nome cadastrado. */
export function humanizeTypeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

/* ============================== LÓGICA PURA ============================== */

export interface RawTypeStageOptions {
  types?: Array<{
    demand_type_key?: string | null;
    demand_type_label?: string | null;
    is_current?: boolean | null;
    stages?: Array<{
      function_key?: string | null;
      name?: string | null;
      position?: number | null;
      client_facing?: boolean | null;
      review?: boolean | null;
    }> | null;
  }> | null;
}

/**
 * Traduz a resposta do kernel em grupos de UI. O tipo atual vem primeiro;
 * nenhuma etapa é escondida ou bloqueada localmente.
 */
export function mapTypeStageOptions(
  raw: RawTypeStageOptions | null | undefined,
  card: Pick<TypeStageCard, "demand_type_key" | "current_function_key">,
): TypeStageGroup[] {
  const currentType = norm(card.demand_type_key);
  const currentStage = norm(card.current_function_key);

  const groups = (raw?.types || [])
    .map<TypeStageGroup | null>((t) => {
      const typeKey = norm(t.demand_type_key);
      if (!typeKey) return null;
      const label = norm(t.demand_type_label) || humanizeTypeKey(typeKey);
      const isCurrentType = !!currentType && typeKey === currentType;

      const stages = (t.stages || [])
        .map<TypeStageOption | null>((s, index) => {
          const functionKey = norm(s.function_key);
          if (!functionKey) return null;
          return {
            functionKey,
            name: norm(s.name) || humanizeTypeKey(functionKey),
            position: typeof s.position === "number" ? s.position : index,
            clientFacing: !!s.client_facing,
            review: !!s.review,
            demandTypeKey: typeKey,
            demandTypeLabel: label,
            isCurrentType,
            isCurrentStage: isCurrentType && functionKey === currentStage,
            valid: true,
            reasonLabel: null,
          };
        })
        .filter((s): s is TypeStageOption => !!s)
        .sort((a, b) => a.position - b.position);

      if (stages.length === 0) return null;

      return {
        demandTypeKey: typeKey,
        demandTypeLabel: label,
        isCurrentType,
        stages,
        hasValidStage: true,
      };
    })
    .filter((g): g is TypeStageGroup => !!g);

  return groups.sort((a, b) => {
    if (a.isCurrentType !== b.isCurrentType) return a.isCurrentType ? -1 : 1;
    return a.demandTypeLabel.localeCompare(b.demandTypeLabel, "pt-BR");
  });
}

/** Encontra uma opção específica dentro dos grupos. */
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

/** Erro legível apenas quando a etapa não pertence a nenhum fluxo da área. */
export function typeStageChoiceError(
  groups: TypeStageGroup[],
  demandTypeKey: string,
  functionKey: string,
): string | null {
  const found = findTypeStageOption(groups, demandTypeKey, functionKey);
  if (!found) return "Etapa fora dos fluxos configurados para esta área";
  return null;
}

/* ============================== CARREGAMENTO ============================== */

export interface LoadTypeStageGroupsResult {
  groups: TypeStageGroup[];
}

/**
 * Grupos (tipo → etapas) do fluxo canônico para o card.
 * Nada é gravado aqui e nenhuma decisão de responsável acontece aqui.
 */
export async function loadTypeStageGroups(params: {
  tenantId: string;
  card: TypeStageCard;
}): Promise<LoadTypeStageGroupsResult> {
  const { tenantId, card } = params;
  const area: WorkArea = normalizeWorkArea(card.work_area ?? undefined);

  let data: any = null;
  let error: any = null;
  try {
    ({ data, error } = await (supabase as any).rpc("get_area_type_stage_options_v1", {
      _tenant_id: tenantId,
      _work_area: area,
      _origin: card.origin ?? null,
      _current_type_key: norm(card.demand_type_key) || null,
      _current_type_label: norm(card.demand_type) || null,
    }));
  } catch (e) {
    error = e;
  }
  if (error) {
    console.error("[typeStageOptions] load error", error);
    throw error;
  }

  return { groups: mapTypeStageOptions(data as RawTypeStageOptions, card) };
}
