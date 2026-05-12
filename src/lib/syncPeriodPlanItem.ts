import { supabase } from "@/integrations/supabase/client";

/**
 * Mantém os snapshots em period_plans (default_plan / ultra_plan / final_plan)
 * sincronizados com a fonte de verdade (tabela demands), para que a edição
 * de "Conteúdo", "Instruções de Produção" e "CTA Recomendado" no Kanban
 * Central também reflita no Histórico de Períodos.
 *
 * O JSON do período usa as chaves canônicas:
 *   - conteudo
 *   - instrucoes_de_producao
 *   - cta_recomendado
 *   - objetivo
 *   - titulo
 *
 * A correspondência entre o item do JSON e a demanda é feita por título
 * (que é como as demandas são originalmente criadas a partir do plano).
 */

const splitInstructionsAndCTA = (raw: string | null | undefined): { instr: string; cta: string } => {
  if (!raw) return { instr: "", cta: "" };
  const idx = raw.search(/(?:<p>\s*)?CTA:\s*/i);
  if (idx === -1) return { instr: raw, cta: "" };
  const instr = raw.slice(0, idx).replace(/<p>\s*<\/p>\s*$/i, "").trim();
  const cta = raw
    .slice(idx)
    .replace(/^[\s\S]*?CTA:\s*/i, "")
    .replace(/<\/?p[^>]*>/gi, " ")
    .replace(/<br\s*\/?>(\s)*/gi, "\n")
    .trim();
  return { instr, cta };
};

const stripHtml = (raw: string | null | undefined): string => {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>(\s)*/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
};

export interface DemandSnapshot {
  title?: string | null;
  objective?: string | null;
  description?: string | null;
  instructions?: string | null;
}

/**
 * Atualiza, dentro do JSON do período, o item cujo título bate com o da
 * demanda. Mexe somente nos campos textuais; nunca altera datas ou estrutura.
 */
export async function syncPeriodPlanSnapshot(
  periodPlanId: string | null | undefined,
  demand: DemandSnapshot
): Promise<void> {
  if (!periodPlanId || !demand?.title) return;

  try {
    const { data, error } = await supabase
      .from("period_plans")
      .select("id, default_plan, ultra_plan, final_plan, rejected_plan")
      .eq("id", periodPlanId)
      .maybeSingle();

    if (error || !data) return;

    const { instr, cta } = splitInstructionsAndCTA(demand.instructions);
    const conteudo = stripHtml(demand.description);
    const instrucoes = stripHtml(instr);
    const ctaText = stripHtml(cta);
    const objetivo = stripHtml(demand.objective);
    const targetTitle = (demand.title || "").trim();

    const updateItem = (item: any): any => {
      const itemTitle = ((item?.titulo ?? item?.title) || "").toString().trim();
      if (!itemTitle || itemTitle !== targetTitle) return item;
      const next = { ...item };
      // Conteúdo
      if ("conteudo" in next || conteudo) next.conteudo = conteudo;
      // Instruções de produção
      if ("instrucoes_de_producao" in next || instrucoes) next.instrucoes_de_producao = instrucoes;
      // CTA recomendado
      if ("cta_recomendado" in next || ctaText) next.cta_recomendado = ctaText;
      // Objetivo
      if ("objetivo" in next || objetivo) next.objetivo = objetivo;
      return next;
    };

    const updatePlan = (plan: any): { changed: boolean; value: any[] } => {
      if (!Array.isArray(plan)) return { changed: false, value: [] };
      let changed = false;
      const next = plan.map((item) => {
        const updated = updateItem(item);
        if (updated !== item) changed = true;
        return updated;
      });
      return { changed, value: next };
    };

    const updates: Record<string, any> = {};
    const dp = updatePlan((data as any).default_plan);
    if (dp.changed) updates.default_plan = dp.value;
    const up = updatePlan((data as any).ultra_plan);
    if (up.changed) updates.ultra_plan = up.value;
    const fp = updatePlan((data as any).final_plan);
    if (fp.changed) updates.final_plan = fp.value;

    if (Object.keys(updates).length === 0) return;

    await supabase.from("period_plans").update(updates).eq("id", periodPlanId);
  } catch (err) {
    console.warn("[syncPeriodPlanSnapshot] failed:", err);
  }
}
