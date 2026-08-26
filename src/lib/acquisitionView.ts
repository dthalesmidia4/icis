import { isAdEnabled } from "@/lib/adPlan";
import { STAGE_LABEL, type CommercialStage } from "@/lib/systemsClients";

/**
 * Helpers puros da visão de AQUISIÇÃO do Client Hub.
 *
 * A campanha (`marketing_campaigns`) é apenas CONTEXTO interno de atribuição
 * Mídia ↔ Comercial. A janela operacional real é sempre o `period_plan`.
 * Nada aqui cria ou administra campanha.
 */

export interface PaidMediaDemandLike {
  classifications?: string[] | null;
  ad_plan?: Record<string, any> | null;
}

export interface PaidMediaSummary {
  /** Verba do período como texto (`A definir` permanece literal). */
  budgetLabel: string | null;
  /** Verba cadastrada com valor concreto (diferente de "A definir"). */
  hasConcreteBudget: boolean;
  /** Conteúdos marcados como anúncio (classification) ou com ad_plan ligado. */
  adMarkedCount: number;
  /** Conteúdos com ad_plan explicitamente habilitado. */
  adPlanEnabledCount: number;
  /** Existe alguma sinalização real de mídia paga no período. */
  hasPaidMedia: boolean;
}

const isUndefinedBudget = (value: string) =>
  /^a\s*definir$/i.test(value.trim()) || /^a\s*combinar$/i.test(value.trim());

export function isAdMarkedDemand(demand: PaidMediaDemandLike): boolean {
  const classifications = (demand.classifications || []).map((c) => String(c).toLowerCase().trim());
  if (classifications.includes("anuncio") || classifications.includes("anúncio")) return true;
  return isAdEnabled(demand.ad_plan);
}

export function summarizePaidMedia(params: {
  demands: PaidMediaDemandLike[];
  paidTrafficBudget?: string | null;
  budget?: string | null;
}): PaidMediaSummary {
  const raw = (params.paidTrafficBudget || params.budget || "").trim();
  const budgetLabel = raw ? raw : null;
  const hasConcreteBudget = !!raw && !isUndefinedBudget(raw);
  const demands = params.demands || [];
  const adMarkedCount = demands.filter(isAdMarkedDemand).length;
  const adPlanEnabledCount = demands.filter((d) => isAdEnabled(d.ad_plan)).length;
  return {
    budgetLabel,
    hasConcreteBudget,
    adMarkedCount,
    adPlanEnabledCount,
    hasPaidMedia: !!budgetLabel || adMarkedCount > 0,
  };
}

/** Etapas comerciais exibidas na visão de Aquisição (ordem real do app). */
export const ACQUISITION_STAGES: CommercialStage[] = [
  "mapeado",
  "contato",
  "demonstracao",
  "avaliacao",
  "negociacao",
  "ganho",
  "perdido",
];

export interface AcquisitionCommercialRow {
  lifecycle?: string | null;
  commercial_stage?: string | null;
}

export interface AcquisitionCommercialSummary {
  total: number;
  customers: number;
  stages: { stage: CommercialStage; label: string; count: number }[];
}

/** Contagens compactas — apenas oportunidades REALMENTE atribuídas à campanha. */
export function summarizeAcquisitionCommercial(
  rows: AcquisitionCommercialRow[],
): AcquisitionCommercialSummary {
  const list = rows || [];
  return {
    total: list.length,
    customers: list.filter((r) => r.lifecycle === "customer").length,
    stages: ACQUISITION_STAGES.map((stage) => ({
      stage,
      label: STAGE_LABEL[stage],
      count: list.filter((r) => r.commercial_stage === stage).length,
    })),
  };
}

/** Janela operacional legível — sempre do period_plan, nunca da campanha. */
export function formatPeriodWindow(start?: string | null, end?: string | null): string {
  const fmt = (v: string) => {
    const [y, m, d] = v.slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : v;
  };
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `A partir de ${fmt(start)}`;
  if (end) return `Até ${fmt(end)}`;
  return "Janela não definida";
}
