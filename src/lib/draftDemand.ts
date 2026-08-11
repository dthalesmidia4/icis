/**
 * Regras puras do RASCUNHO de demanda (TaskCard em modo `isDraft`).
 *
 * O rascunho não existe no banco: tudo vive em memória até `create_manual_demand_atomic`.
 * Estas funções concentram as decisões que precisam ser previsíveis e testáveis:
 *  - o que ainda falta preencher para poder salvar;
 *  - o que precisa ser limpo quando o operador troca área ou cliente.
 */

export type DraftWorkArea = "midia" | "sistemas";

export interface DraftCompletenessInput {
  clientId?: string | null;
  demand_type_key?: string | null;
  assigned_to?: string | null;
  title?: string | null;
  is_daily_card?: boolean | null;
  daily_start_date?: string | null;
  due_date?: string | null;
}

/**
 * Campos obrigatórios ainda ausentes, na ordem em que o formulário os pede.
 *
 * Publicação NÃO substitui a data de início de produção e `delivery_date`
 * sozinha também não: sem início, o card entra no Kanban sem lugar na agenda.
 * Card Diário troca o início pela data inicial da recorrência.
 */
export function computeDraftMissingFields(card: DraftCompletenessInput | null | undefined): string[] {
  if (!card) return ["cliente", "tipo de demanda", "responsável", "título", "data de início de produção"];
  const missing: (string | null)[] = [
    !card.clientId ? "cliente" : null,
    !card.demand_type_key ? "tipo de demanda" : null,
    !card.assigned_to ? "responsável" : null,
    !card.title?.trim() ? "título" : null,
    card.is_daily_card
      ? (!card.daily_start_date ? "data inicial do Card Diário" : null)
      : (!card.due_date ? "data de início de produção" : null),
  ];
  return missing.filter(Boolean) as string[];
}

export function isDraftComplete(card: DraftCompletenessInput | null | undefined): boolean {
  return computeDraftMissingFields(card).length === 0;
}

export interface DraftAreaChangeResult {
  /** Patch a aplicar sobre o card local (nunca vai ao banco no rascunho). */
  patch: Record<string, unknown>;
  /** O tipo escolhido não existe na nova área e foi descartado. */
  typeCleared: boolean;
  /** O responsável precisa ser revalidado contra o novo fluxo. */
  needsAssigneeRecheck: boolean;
}

/**
 * Troca de área no rascunho.
 *
 * Tipos são específicos por área: manter um tipo de Mídia em Sistemas apontaria
 * para etapas inexistentes. Quando o tipo cai, o responsável cai com ele.
 * Voltar para Mídia também zera origem/subclientes, que só existem em Sistemas.
 *
 * `typeKeysForArea` vem de `demandTypesForArea(newArea)` — recebido por parâmetro
 * para manter este módulo puro (sem depender do client Supabase).
 */
export function draftAreaChangePatch(
  card: { demand_type_key?: string | null; assigned_to?: string | null },
  newArea: DraftWorkArea,
  typeKeysForArea: string[],
): DraftAreaChangeResult {
  const patch: Record<string, unknown> = { work_area: newArea };
  if (newArea === "midia") {
    patch.origin = "interno";
    patch.subclient_id = null;
    patch.subclient_ids = [];
  }
  const stillValid = !!card.demand_type_key && typeKeysForArea.includes(card.demand_type_key);
  if (!stillValid) {
    patch.demand_type = null;
    patch.demand_type_key = null;
    patch.assigned_to = null;
    patch.current_function_key = null;
    return { patch, typeCleared: !!card.demand_type_key, needsAssigneeRecheck: false };
  }
  return { patch, typeCleared: false, needsAssigneeRecheck: !!card.assigned_to };
}

/**
 * Troca de cliente no rascunho: período e subclientes pertencem ao cliente
 * anterior e precisam cair. Tipo e responsável permanecem — elegibilidade de
 * etapa não depende do cliente (apenas a preferência de roteamento depende).
 */
export function draftClientChangePatch(): Record<string, unknown> {
  return {
    period_plan_id: null,
    periodPlanId: "",
    subclient_id: null,
    subclient_ids: [],
  };
}
