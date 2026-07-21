import { supabase } from "@/integrations/supabase/client";
import { coerceDemandTypeKey, normalizeDemandTypeKey } from "@/lib/proceedDemand";
import { assignInitialResponsible } from "@/lib/initialFlowFunction";

/**
 * Núcleo compartilhado da lógica de "Avaliar Demandas".
 * Reutiliza a mesma materialização usada por /approve-cards, mas isolada
 * para poder ser chamada de qualquer superfície (modal in-Kanban etc.).
 */

const pick = (...vals: any[]) => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = typeof v === "string" ? v.trim() : v;
    if (s !== "" && s !== null && s !== undefined) return s;
  }
  return null;
};

export interface PlanCardContext {
  card: any;
  source: "default" | "ultra";
  tenantId: string;
  clientId: string;
  periodId: string;
  pipelineId: string;
  initialStatusId: string;
}

/**
 * Materializa um card do plano em uma demand real.
 * Executa a mesma lógica de ApproveCards.handleApprove, mas exposta pra reuso.
 * Dispara auto-geração de arte/carrossel quando aplicável.
 * Retorna o id da demand criada.
 */
export async function approvePlanCard(ctx: PlanCardContext): Promise<string> {
  const c: any = ctx.card;

  const title = pick(c.titulo, c.title) || "Sem título";
  const tipo = pick(c.tipo, c.tipo_conteudo, c.type, c.formato);
  const channel = pick(c.canal, c.channel, c.plataforma);
  const objetivo = pick(c.objetivo, c.objective, c.goal);
  const conteudo = pick(
    c.conteudo, c.texto_da_peca, c.descricao_da_tarefa,
    c.descricao, c.description, c.content, c.copy, c.copy_sugerida,
  );
  const instrucoes = pick(
    c.instrucoes_de_producao, c.instrucoes, c.instructions,
    c.production_instructions, c.briefing,
  );
  const cta = pick(c.cta_recomendado, c.cta, c.call_to_action);
  const caption = pick(c.legenda, c.caption, c.post_caption);
  const dateStr = pick(c.data_sugerida, c.suggested_date, c.date, c.publish_date, c.data_publicacao);
  const racional = pick(c.racional_estrategico, c.rationale, c.strategic_rationale, c.racional);
  const conceitoUltra = pick(c.conceito_ultra, c.ultra_concept, c.conceito);
  const hook = pick(c.hook, c.gancho);
  const tomDeVoz = pick(c.tom_de_voz, c.tone_of_voice);
  const observacoesExtra = pick(c.observacoes, c.observations, c.notas, c.notes);

  const instructionParts = [
    instrucoes,
    cta ? `CTA: ${cta}` : "",
    hook ? `Hook: ${hook}` : "",
    tomDeVoz ? `Tom de voz: ${tomDeVoz}` : "",
  ].filter(Boolean);

  const observationsParts = [
    racional ? `Racional estratégico:\n${racional}` : "",
    conceitoUltra ? `Conceito ultra:\n${conceitoUltra}` : "",
    caption ? `Legenda sugerida:\n${caption}` : "",
    observacoesExtra ? `Observações:\n${observacoesExtra}` : "",
  ].filter(Boolean);

  const explicitKey = coerceDemandTypeKey(c.demand_type_key || c.type_key);
  const demandTypeKey = explicitKey ?? normalizeDemandTypeKey(tipo);

  const payload: any = {
    tenant_id: ctx.tenantId,
    client_id: ctx.clientId,
    pipeline_id: ctx.pipelineId,
    status_id: ctx.initialStatusId,
    period_plan_id: ctx.periodId,
    title,
    source: ctx.source === "ultra" ? "ultra_card" : "card",
  };
  if (objetivo) payload.objective = objetivo;
  if (conteudo) payload.description = conteudo;
  if (instructionParts.length) payload.instructions = instructionParts.join("\n\n");
  if (dateStr) payload.publish_date = dateStr;
  if (channel) payload.channel = channel;
  if (tipo) payload.demand_type = tipo;
  if (demandTypeKey) payload.demand_type_key = demandTypeKey;
  if (observationsParts.length) payload.observations = observationsParts.join("\n\n");

  const { data: inserted, error } = await supabase
    .from("demands")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  const demandId = inserted!.id as string;

  await assignInitialResponsible(demandId, ctx.tenantId, demandTypeKey, {
    metadataSource: ctx.source === "ultra" ? "ultra_card" : "card",
  });

  // Fire-and-forget: auto-geração de arte pra post estático / carrossel
  const t = (tipo || "").toLowerCase();
  const isStatic = t.includes("post");
  const isCarousel = t.includes("carrossel") || t.includes("carousel");
  if (isStatic || isCarousel) {
    const fn = isCarousel ? "auto-generate-carousel" : "auto-generate-post";
    supabase.functions
      .invoke(fn, { body: { demandId, source: "planned", minimalText: true } })
      .catch((err) => console.warn(`[approvePlanCard] auto-gen (${fn}) failed`, err));
  }

  return demandId;
}

/**
 * Move um card do plano para `rejected_plan` (para reavaliação futura).
 * `reason` (opcional) fica registrado em `_rejectReason` para enriquecer a reavaliação.
 */
export async function rejectPlanCard(params: {
  periodId: string;
  card: any;
  source: "default" | "ultra";
  indexInPlan: number;
  currentDefault: any[];
  currentUltra: any[];
  currentRejected: any[];
  reason?: string | null;
}) {
  const isDefault = params.source === "default";
  const plan = isDefault ? [...params.currentDefault] : [...params.currentUltra];
  if (params.indexInPlan < 0 || params.indexInPlan >= plan.length) return;

  const [removed] = plan.splice(params.indexInPlan, 1);
  const rejected = [...(params.currentRejected || [])];
  const reason = (params.reason ?? "").trim();
  rejected.push({
    ...removed,
    _originalSource: params.source,
    _rejectedAt: new Date().toISOString(),
    ...(reason ? { _rejectReason: reason } : {}),
  });

  const key = isDefault ? "default_plan" : "ultra_plan";
  const { error } = await supabase
    .from("period_plans")
    .update({
      [key]: plan as unknown as null,
      rejected_plan: rejected as unknown as null,
    } as any)
    .eq("id", params.periodId);

  if (error) throw error;
}

/**
 * Aplica um patch parcial em um item do plano (default_plan/ultra_plan),
 * preservando as demais chaves. Usa nomes canônicos em pt-BR.
 */
export async function updatePlanCard(params: {
  periodId: string;
  source: "default" | "ultra";
  indexInPlan: number;
  currentDefault: any[];
  currentUltra: any[];
  patch: {
    titulo?: string;
    tipo?: string;
    canal?: string;
    objetivo?: string;
    conteudo?: string;
    data_sugerida?: string;
  };
}) {
  const isDefault = params.source === "default";
  const plan = isDefault ? [...params.currentDefault] : [...params.currentUltra];
  if (params.indexInPlan < 0 || params.indexInPlan >= plan.length) return;

  const item = { ...plan[params.indexInPlan] };
  const p = params.patch;
  if (p.titulo !== undefined) {
    if ("titulo" in item || !("title" in item)) item.titulo = p.titulo;
    else item.title = p.titulo;
  }
  if (p.tipo !== undefined) {
    if ("tipo" in item || (!("tipo_conteudo" in item) && !("type" in item))) item.tipo = p.tipo;
    else if ("tipo_conteudo" in item) item.tipo_conteudo = p.tipo;
    else item.type = p.tipo;
  }
  if (p.canal !== undefined) {
    if ("canal" in item || !("channel" in item)) item.canal = p.canal;
    else item.channel = p.canal;
  }
  if (p.objetivo !== undefined) {
    if ("objetivo" in item || !("objective" in item)) item.objetivo = p.objetivo;
    else item.objective = p.objetivo;
  }
  if (p.conteudo !== undefined) {
    if ("conteudo" in item) item.conteudo = p.conteudo;
    else if ("descricao" in item) item.descricao = p.conteudo;
    else if ("description" in item) item.description = p.conteudo;
    else item.conteudo = p.conteudo;
  }
  if (p.data_sugerida !== undefined) {
    if ("data_sugerida" in item || (!("suggested_date" in item) && !("date" in item))) item.data_sugerida = p.data_sugerida;
    else if ("suggested_date" in item) item.suggested_date = p.data_sugerida;
    else item.date = p.data_sugerida;
  }
  plan[params.indexInPlan] = item;

  const key = isDefault ? "default_plan" : "ultra_plan";
  const { error } = await supabase
    .from("period_plans")
    .update({ [key]: plan as unknown as null } as any)
    .eq("id", params.periodId);

  if (error) throw error;
  return item;
}

