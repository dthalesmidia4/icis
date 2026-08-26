import { supabase } from "@/integrations/supabase/client";

/**
 * MÍDIA PAGA EXECUTÁVEL (`paid_media_activations`).
 *
 * Uma DEMANDA é uma peça de conteúdo única. Rodar a mesma peça em outra praça
 * NUNCA duplica a demanda: cria-se outra ativação, com verba, período e
 * plataforma próprios. `demands.ad_plan` continua sendo apenas o briefing
 * criativo da peça — a fonte de verdade de onde/quando/quanto roda é esta tabela.
 */

export type PaidMediaStatus = "planned" | "running" | "paused" | "completed" | "cancelled";

export const PAID_MEDIA_STATUS_LABEL: Record<PaidMediaStatus, string> = {
  planned: "Planejada",
  running: "Rodando",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const PAID_MEDIA_STATUS_OPTIONS: { value: PaidMediaStatus; label: string }[] = (
  Object.keys(PAID_MEDIA_STATUS_LABEL) as PaidMediaStatus[]
).map((value) => ({ value, label: PAID_MEDIA_STATUS_LABEL[value] }));

export const PAID_MEDIA_PLATFORM_OPTIONS = [
  "Meta",
  "Instagram",
  "Facebook",
  "Google",
  "YouTube",
  "TikTok",
  "WhatsApp",
] as const;

export interface PaidMediaActivation {
  id: string;
  tenant_id: string;
  company_id: string;
  campaign_id: string;
  demand_id: string;
  platform: string;
  status: PaidMediaStatus;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  objective: string | null;
  audience: string | null;
  cta: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function paidMediaStatusLabel(status?: string | null): string {
  if (!status) return "—";
  return PAID_MEDIA_STATUS_LABEL[status as PaidMediaStatus] || status;
}

export function isActivationCancelled(status?: string | null): boolean {
  return status === "cancelled";
}

export interface PaidMediaActivationInput {
  id?: string;
  tenantId: string;
  companyId: string;
  campaignId: string;
  demandId: string;
  platform?: string | null;
  status?: PaidMediaStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: string | number | null;
  objective?: string | null;
  audience?: string | null;
  cta?: string | null;
  notes?: string | null;
}

/** Converte texto brasileiro ("1.500,50") em number; vazio → null. */
export function parseBudget(value?: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Validação pura da ativação — usada pela UI e pelos testes. */
export function validateActivationInput(
  input: Partial<PaidMediaActivationInput>,
): string | null {
  if (!input.demandId) return "Selecione o conteúdo que vai rodar.";
  if (!input.campaignId) return "Selecione a praça da ativação.";
  if (input.status && !PAID_MEDIA_STATUS_OPTIONS.some((o) => o.value === input.status)) {
    return "Status de ativação inválido.";
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    return "A data final deve ser posterior à data inicial.";
  }
  const budget = parseBudget(input.budget);
  if (budget !== null && budget < 0) return "A verba não pode ser negativa.";
  return null;
}

export interface PaidMediaSummaryTotals {
  total: number;
  running: number;
  planned: number;
  completed: number;
  cancelled: number;
  /** Verba somada das ativações não canceladas com valor definido. */
  budgetTotal: number;
  /** Quantas ativações não canceladas estão sem verba definida. */
  budgetUndefinedCount: number;
  /** Conteúdos distintos com pelo menos uma ativação não cancelada. */
  demandsActivated: number;
}

export function summarizePaidMediaActivations(
  rows: Pick<PaidMediaActivation, "status" | "budget" | "demand_id">[],
): PaidMediaSummaryTotals {
  const list = rows || [];
  const live = list.filter((r) => !isActivationCancelled(r.status));
  const by = (status: PaidMediaStatus) => list.filter((r) => r.status === status).length;
  return {
    total: list.length,
    running: by("running"),
    planned: by("planned"),
    completed: by("completed"),
    cancelled: by("cancelled"),
    budgetTotal: live.reduce((sum, r) => sum + (r.budget ?? 0), 0),
    budgetUndefinedCount: live.filter((r) => r.budget === null || r.budget === undefined).length,
    demandsActivated: new Set(live.map((r) => r.demand_id)).size,
  };
}

/** Verba formatada em BRL; `A definir` quando nada foi informado. */
export function formatActivationBudget(value?: number | null): string {
  if (value === null || value === undefined) return "A definir";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const normalize = (row: any): PaidMediaActivation => ({
  ...row,
  status: (row?.status || "planned") as PaidMediaStatus,
  platform: row?.platform || "Meta",
});

export async function loadPaidMediaActivations(
  tenantId: string,
  companyId: string,
  options?: { campaignId?: string | null; demandIds?: string[] | null },
): Promise<PaidMediaActivation[]> {
  let query = supabase
    .from("paid_media_activations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("company_id", companyId)
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (options?.campaignId) query = query.eq("campaign_id", options.campaignId);
  if (options?.demandIds && options.demandIds.length > 0) {
    query = query.in("demand_id", options.demandIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalize);
}

export async function savePaidMediaActivation(
  input: PaidMediaActivationInput,
): Promise<{ success: boolean; message?: string; id?: string }> {
  const invalid = validateActivationInput(input);
  if (invalid) return { success: false, message: invalid };

  const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
  const row = {
    tenant_id: input.tenantId,
    company_id: input.companyId,
    campaign_id: input.campaignId,
    demand_id: input.demandId,
    platform: clean(input.platform) || "Meta",
    status: input.status || "planned",
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    budget: parseBudget(input.budget),
    objective: clean(input.objective),
    audience: clean(input.audience),
    cta: clean(input.cta),
    notes: clean(input.notes),
  };

  if (input.id) {
    const { error } = await supabase
      .from("paid_media_activations")
      .update(row)
      .eq("id", input.id);
    if (error) return { success: false, message: error.message };
    return { success: true, id: input.id };
  }

  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("paid_media_activations")
    .insert({ ...row, created_by: auth?.user?.id ?? null })
    .select("id")
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  return { success: true, id: data?.id };
}

/** Cancelar NUNCA apaga: a ativação vira histórico com status `cancelled`. */
export async function cancelPaidMediaActivation(
  id: string,
): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase
    .from("paid_media_activations")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
