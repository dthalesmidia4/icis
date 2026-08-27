import { supabase } from "@/integrations/supabase/client";

/**
 * EDIÇÃO DO CICLO EDITORIAL ATUAL (period_plans).
 *
 * O ciclo é uma JANELA EDITORIAL: título, início, fim, objetivo e verba geral de
 * tráfego pago. Editar o ciclo NUNCA:
 *  - recria o period_plan;
 *  - regenera demandas;
 *  - altera `final_plan` / `default_plan` / `ultra_plan`;
 *  - move `publish_date` de nenhuma demanda.
 *
 * Praça/cidade não pertencem a este modal — a operação regional vive em
 * `marketing_campaigns` (aba Expansão).
 */

export interface CycleEditInput {
  title?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  objective?: string | null;
  paidTrafficBudget?: string | null;
}

/** Validação pura: título obrigatório e fim >= início. */
export function validateCycleInput(input: CycleEditInput): string | null {
  if (!input.title || !String(input.title).trim()) return "Informe o título do ciclo.";
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return "O fim do ciclo deve ser posterior ao início.";
  }
  return null;
}

/** Colunas que a edição do ciclo pode tocar — nada além disto. */
export const CYCLE_EDITABLE_COLUMNS = [
  "period_title",
  "period_start",
  "period_end",
  "objective",
  "paid_traffic_budget",
] as const;

export function buildCycleUpdate(input: CycleEditInput): Record<string, unknown> {
  const clean = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : null);
  return {
    period_title: String(input.title).trim(),
    period_start: input.startDate || null,
    period_end: input.endDate || null,
    objective: clean(input.objective),
    paid_traffic_budget: clean(input.paidTrafficBudget),
  };
}

/**
 * Conteúdos que ficariam FORA da nova janela. Serve apenas para SINALIZAR:
 * nada é movido silenciosamente.
 */
export function demandsOutsideCycleWindow(
  demands: { id: string; title: string; publish_date: string | null }[],
  startDate?: string | null,
  endDate?: string | null,
): { id: string; title: string; publish_date: string | null }[] {
  if (!startDate && !endDate) return [];
  return (demands || []).filter((d) => {
    const date = (d.publish_date || "").slice(0, 10);
    if (!date) return false;
    if (startDate && date < startDate) return true;
    if (endDate && date > endDate) return true;
    return false;
  });
}

export async function saveCycleEdit(
  periodId: string,
  input: CycleEditInput,
): Promise<{ success: boolean; message?: string }> {
  const invalid = validateCycleInput(input);
  if (invalid) return { success: false, message: invalid };
  const { error } = await (supabase as any)
    .from("period_plans")
    .update(buildCycleUpdate(input))
    .eq("id", periodId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
