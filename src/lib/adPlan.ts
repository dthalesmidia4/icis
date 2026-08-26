/**
 * ad_plan (JSONB da demanda) — formato canônico.
 *
 * ad_plan descreve a MÍDIA PAGA da própria peça. Ele NÃO é o vínculo de
 * campanha: quem costura Mídia e Comercial é `period_plans.campaign_id`.
 *
 * Shape canônico para novos writes:
 * {
 *   "enabled": true, "platform": "Meta", "objective": "...", "audience": "...",
 *   "location": "...", "budget": 0, "start_date": "YYYY-MM-DD",
 *   "end_date": "YYYY-MM-DD", "cta": "...", "notes": "..."
 * }
 *
 * Legado é lido sem perda: `boost` → `enabled`, `territory` → `location`,
 * `period` → janela textual. Qualquer chave desconhecida é preservada.
 */

export interface AdPlanShape {
  /** Switch de mídia paga da peça. */
  enabled?: boolean;
  platform?: string;
  objective?: string;
  audience?: string;
  location?: string;
  budget?: number | null;
  start_date?: string;
  end_date?: string;
  cta?: string;
  notes?: string;
  [key: string]: unknown;
}

/** Plataformas usuais (livre para digitar outras). */
export const AD_PLAN_PLATFORMS = ["Meta", "Google", "TikTok", "LinkedIn"] as const;

/** Chaves de texto canônicas, na ordem de exibição. */
export const AD_PLAN_TEXT_KEYS = [
  "platform",
  "objective",
  "audience",
  "location",
  "cta",
  "notes",
] as const;

export type AdPlanTextKey = (typeof AD_PLAN_TEXT_KEYS)[number];

/** Converte texto ("R$ 1.500,50") ou número em number; vazio → null. */
export function parseAdBudget(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const asDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
};

/** Verdadeiro só quando a mídia paga está explicitamente ligada. */
export function isAdEnabled(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  const flag = raw.enabled !== undefined ? raw.enabled : raw.boost;
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "string") {
    return ["true", "sim", "1", "yes"].includes(flag.trim().toLowerCase());
  }
  return false;
}

/** Normaliza o JSONB para o shape canônico, preservando chaves desconhecidas. */
export function normalizeAdPlan(value: unknown): AdPlanShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false };
  const raw = value as Record<string, unknown>;
  const out: AdPlanShape = { ...raw };
  delete out.boost;
  out.enabled = isAdEnabled(raw);

  // Legado: territory era o campo de região.
  if (out.location === undefined && raw.territory !== undefined) out.location = raw.territory as any;
  AD_PLAN_TEXT_KEYS.forEach((key) => {
    const v = out[key];
    if (v === null || v === undefined || v === "") {
      delete out[key];
      return;
    }
    out[key] = typeof v === "string" ? v : String(v);
  });

  const budget = parseAdBudget(raw.budget);
  if (budget === null) delete out.budget;
  else out.budget = budget;

  const start = asDate(raw.start_date);
  const end = asDate(raw.end_date);
  if (start) out.start_date = start;
  else delete out.start_date;
  if (end) out.end_date = end;
  else delete out.end_date;

  return out;
}

/** Liga/desliga a mídia paga sem apagar o resto do plano. */
export function setAdPlanEnabled(value: unknown, enabled: boolean): AdPlanShape {
  return { ...normalizeAdPlan(value), enabled };
}

/** O editor de anúncio é operacional apenas na área de Mídia. */
export function canEditAdPlan(workArea?: string | null): boolean {
  return (workArea ?? "midia") === "midia";
}

const fmtMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

/** Resumo curto para chips/listas. */
export function adPlanSummary(value: unknown): string {
  const plan = normalizeAdPlan(value);
  const parts: string[] = [];
  if (plan.enabled) parts.push("Mídia paga");
  if (plan.platform) parts.push(String(plan.platform));
  if (typeof plan.budget === "number") parts.push(fmtMoney(plan.budget));
  if (plan.location) parts.push(String(plan.location));
  return parts.join(" · ");
}
