import { supabase } from "@/integrations/supabase/client";

/** Colunas que representam "encerrado" no pipeline. */
const DONE_STATUS_NAMES = ["feito", "feitos"];

const isDoneStatusName = (name?: string | null) =>
  DONE_STATUS_NAMES.includes((name || "").toLowerCase().trim());

const normalize = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Resolve o status operacional para onde um card deve voltar ao reentrar no
 * fluxo: preferimos a coluna do responsável (mesmo nome do colaborador),
 * caindo para o status inicial do pipeline.
 */
export async function resolveOperationalStatusId(
  pipelineId: string,
  assigneeId?: string | null,
): Promise<string | null> {
  const { data: statuses } = await supabase
    .from("pipeline_statuses")
    .select("id, name, position, is_initial, is_final")
    .eq("pipeline_id", pipelineId)
    .order("position");
  const list = (statuses || []) as any[];
  if (list.length === 0) return null;

  const candidates = list.filter((s) => !s.is_final && !isDoneStatusName(s.name));

  if (assigneeId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", assigneeId)
      .maybeSingle();
    const fullName = normalize((prof as any)?.full_name);
    const firstName = fullName.split(" ")[0] || "";
    const match = candidates.find((s) => {
      const n = normalize(s.name);
      return n === fullName || (!!firstName && n === firstName);
    });
    if (match) return match.id;
  }

  const initial = candidates.find((s) => s.is_initial) || candidates[0];
  return initial?.id ?? null;
}

/**
 * Um card que volta ao fluxo (prosseguir, voltar, salto de etapa ou
 * transferência) nunca pode continuar arquivado nem no status "Feito" — senão
 * ele desaparece da visão geral mesmo tendo responsável e etapa ativos.
 *
 * Aplica no `payload` (in-place) a limpeza necessária e devolve `true` quando
 * houve reativação.
 */
export async function applyFlowReactivation(
  payload: Record<string, any>,
  demandId: string,
  assigneeId?: string | null,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("demands")
      .select("archived_at, status_id, pipeline_id, pipeline_statuses(name, is_final)")
      .eq("id", demandId)
      .maybeSingle();
    const card: any = data;
    if (!card) return false;

    const statusName = card.pipeline_statuses?.name as string | undefined;
    const closedStatus = isDoneStatusName(statusName) || !!card.pipeline_statuses?.is_final;
    if (!card.archived_at && !closedStatus) return false;

    if (card.archived_at) payload.archived_at = null;
    if (closedStatus && card.pipeline_id) {
      const statusId = await resolveOperationalStatusId(card.pipeline_id, assigneeId ?? null);
      if (statusId && statusId !== card.status_id) payload.status_id = statusId;
    }
    return true;
  } catch (err) {
    console.warn("[reactivateDemand] falha ao reativar card:", err);
    return false;
  }
}

/**
 * Desarquiva um card já persistido, devolvendo também o status operacional.
 * Usado pelo botão manual de desarquivar.
 */
export async function reactivateDemandById(
  demandId: string,
  assigneeId?: string | null,
): Promise<{ error: unknown | null }> {
  const payload: Record<string, any> = { archived_at: null };
  const { data } = await supabase
    .from("demands")
    .select("pipeline_id, assigned_to, status_id, pipeline_statuses(name, is_final)")
    .eq("id", demandId)
    .maybeSingle();
  const card: any = data;
  if (card?.pipeline_id) {
    const closedStatus = isDoneStatusName(card.pipeline_statuses?.name) || !!card.pipeline_statuses?.is_final;
    if (closedStatus) {
      const statusId = await resolveOperationalStatusId(
        card.pipeline_id,
        assigneeId ?? card.assigned_to ?? null,
      );
      if (statusId) payload.status_id = statusId;
    }
  }
  const { error } = await supabase.from("demands").update(payload).eq("id", demandId);
  return { error };
}
