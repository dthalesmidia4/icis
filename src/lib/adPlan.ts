/**
 * ad_plan (JSONB da demanda) — formato canônico.
 *
 * O campo já existia livre. Aqui padronizamos as chaves conhecidas SEM perder
 * nada do que já estava salvo: qualquer chave extra é preservada.
 *
 * Regra operacional: "Impulsionar" (boost) é o switch que marca a peça como
 * mídia paga. Ele só faz sentido em demandas de work_area = "midia".
 */

export interface AdPlanShape {
  /** Switch de impulsionamento (mídia paga). */
  boost?: boolean;
  objective?: string;
  budget?: string;
  period?: string;
  /** Território/região do anúncio (ex.: "Ribeirão Preto + 30km"). */
  territory?: string;
  audience?: string;
  /** Vínculo opcional com a campanha de marketing. */
  campaign_id?: string | null;
  notes?: string;
  [key: string]: unknown;
}

/** Chaves de texto padronizadas, na ordem de exibição. */
export const AD_PLAN_TEXT_KEYS = [
  "objective",
  "budget",
  "period",
  "territory",
  "audience",
  "notes",
] as const;

export type AdPlanTextKey = (typeof AD_PLAN_TEXT_KEYS)[number];

/** Normaliza o JSONB preservando chaves desconhecidas. */
export function normalizeAdPlan(value: unknown): AdPlanShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { boost: false };
  const raw = value as Record<string, unknown>;
  const out: AdPlanShape = { ...raw };
  out.boost = isBoosted(raw);
  AD_PLAN_TEXT_KEYS.forEach((key) => {
    const v = raw[key];
    if (v === null || v === undefined) {
      delete out[key];
      return;
    }
    out[key] = typeof v === "string" ? v : String(v);
  });
  if (typeof raw.campaign_id === "string" && raw.campaign_id.trim()) {
    out.campaign_id = raw.campaign_id;
  } else if ("campaign_id" in raw) {
    out.campaign_id = null;
  }
  return out;
}

/** Verdadeiro só quando o boost está explicitamente ligado. */
export function isBoosted(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const raw = (value as Record<string, unknown>).boost;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return ["true", "sim", "1", "yes"].includes(raw.trim().toLowerCase());
  return false;
}

/** Liga/desliga o boost sem apagar o resto do plano. */
export function setAdPlanBoost(value: unknown, boost: boolean): AdPlanShape {
  return { ...normalizeAdPlan(value), boost };
}

/** Vincula (ou desvincula) a campanha sem apagar o resto do plano. */
export function setAdPlanCampaign(value: unknown, campaignId: string | null): AdPlanShape {
  const next = normalizeAdPlan(value);
  next.campaign_id = campaignId && campaignId.trim() ? campaignId : null;
  return next;
}

/** O editor de anúncio é operacional apenas na área de Mídia. */
export function canEditAdPlan(workArea?: string | null): boolean {
  return (workArea ?? "midia") === "midia";
}

/** Resumo curto para chips/listas. */
export function adPlanSummary(value: unknown): string {
  const plan = normalizeAdPlan(value);
  const parts: string[] = [];
  if (plan.boost) parts.push("Impulsionar");
  if (plan.budget) parts.push(String(plan.budget));
  if (plan.territory) parts.push(String(plan.territory));
  return parts.join(" · ");
}
