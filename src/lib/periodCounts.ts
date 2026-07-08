import { supabase } from "@/integrations/supabase/client";

export interface CurrentPeriodInfo {
  id: string;
  period_title: string | null;
  period_start: string | null;
  period_end: string | null;
  default_plan: any[];
  ultra_plan: any[];
  rejected_plan: any[];
  operational_status: string | null;
}

/**
 * Retorna o período "atual" do cliente: aquele com operational_status = 'em_andamento'.
 * Se não houver período em andamento, retorna null (sem fallback para períodos anteriores).
 * A regra de escopo dos contadores é: sempre e somente o período atual do cliente atual.
 */
export async function getCurrentPeriodForClient(params: {
  tenantId: string;
  clientId: string;
}): Promise<CurrentPeriodInfo | null> {
  const { tenantId, clientId } = params;
  if (!tenantId || !clientId) return null;

  const { data, error } = await supabase
    .from("period_plans")
    .select(
      "id, period_title, period_start, period_end, default_plan, ultra_plan, rejected_plan, operational_status"
    )
    .eq("company_id", clientId)
    .eq("tenant_id", tenantId)
    .eq("operational_status", "em_andamento")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    period_title: (data as any).period_title ?? null,
    period_start: (data as any).period_start ?? null,
    period_end: (data as any).period_end ?? null,
    default_plan: Array.isArray((data as any).default_plan) ? (data as any).default_plan : [],
    ultra_plan: Array.isArray((data as any).ultra_plan) ? (data as any).ultra_plan : [],
    rejected_plan: Array.isArray((data as any).rejected_plan) ? (data as any).rejected_plan : [],
    operational_status: (data as any).operational_status ?? null,
  };
}

export interface PeriodDemandReviewCounts {
  periodPlanId: string | null;
  pendingApprovalCount: number;
  rejectedCount: number;
  totalReviewCount: number;
}

/**
 * Fonte única da verdade para os contadores:
 *  - Avaliar Demandas  = pendingApprovalCount + rejectedCount
 *  - Aprovar Demandas  = pendingApprovalCount
 *  - Demandas Reprovadas = rejectedCount
 *
 * Escopo: SEMPRE cliente atual + período atual (em_andamento).
 * Considera cards normais (default_plan) e ultra (ultra_plan).
 * Não conta cards já transformados em demanda (título presente em demands do mesmo period_plan_id).
 */
export async function getPeriodDemandReviewCounts(params: {
  tenantId: string;
  clientId: string;
  periodPlanId?: string | null;
}): Promise<PeriodDemandReviewCounts> {
  const empty: PeriodDemandReviewCounts = {
    periodPlanId: null,
    pendingApprovalCount: 0,
    rejectedCount: 0,
    totalReviewCount: 0,
  };
  const { tenantId, clientId } = params;
  if (!tenantId || !clientId) return empty;

  let period: CurrentPeriodInfo | null = null;

  if (params.periodPlanId) {
    const { data } = await supabase
      .from("period_plans")
      .select(
        "id, period_title, period_start, period_end, default_plan, ultra_plan, rejected_plan, operational_status"
      )
      .eq("id", params.periodPlanId)
      .eq("company_id", clientId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data) {
      period = {
        id: data.id,
        period_title: (data as any).period_title ?? null,
        period_start: (data as any).period_start ?? null,
        period_end: (data as any).period_end ?? null,
        default_plan: Array.isArray((data as any).default_plan) ? (data as any).default_plan : [],
        ultra_plan: Array.isArray((data as any).ultra_plan) ? (data as any).ultra_plan : [],
        rejected_plan: Array.isArray((data as any).rejected_plan) ? (data as any).rejected_plan : [],
        operational_status: (data as any).operational_status ?? null,
      };
    }
  } else {
    period = await getCurrentPeriodForClient({ tenantId, clientId });
  }

  if (!period) return empty;

  const { data: existingDemands } = await supabase
    .from("demands")
    .select("title")
    .eq("period_plan_id", period.id)
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId);

  const savedTitles = new Set(
    (existingDemands || []).map((d: any) => (d?.title || "").trim()).filter(Boolean)
  );

  const allPlanCards = [...period.default_plan, ...period.ultra_plan];
  const pendingApprovalCount = allPlanCards.filter((c: any) => {
    const title = (c?.titulo || c?.title || "").trim();
    if (!title) return true;
    return !savedTitles.has(title);
  }).length;

  const rejectedCount = period.rejected_plan.length;

  return {
    periodPlanId: period.id,
    pendingApprovalCount,
    rejectedCount,
    totalReviewCount: pendingApprovalCount + rejectedCount,
  };
}
