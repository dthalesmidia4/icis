/**
 * Escopo de acesso do Financeiro (espelho da RPC `public.finance_access_scope`).
 *
 * - `full`  -> Financeiro completo (resumo, contas, cartões, orçamento, ajustes)
 * - `tools` -> SOMENTE `Assinaturas e ferramentas`
 * - `none`  -> sem acesso
 *
 * Esconder view não é segurança: a RLS continua a autoridade final. Aqui só
 * garantimos que nenhuma consulta/render de dado proibido chegue a acontecer.
 */

export type FinanceScope = "full" | "tools" | "none";

/** Domínios do Financeiro — a URL manda, mas o escopo filtra. */
export type FinanceView =
  | "overview"
  | "composition"
  | "accounts"
  | "cards"
  | "subscriptions"
  | "settings";

export const FINANCE_VIEWS: FinanceView[] = [
  "overview",
  "composition",
  "accounts",
  "cards",
  "subscriptions",
  "settings",
];

/** Views liberadas para quem só pode gerenciar assinaturas/ferramentas. */
export const TOOLS_SCOPE_VIEWS: FinanceView[] = ["subscriptions"];

/** Fail closed: qualquer payload inesperado vira `none`. */
export function parseFinanceScope(data: unknown): FinanceScope {
  const value = typeof data === "string" ? data.trim() : "";
  if (value === "full" || value === "tools") return value;
  return "none";
}

export interface FinanceScopeFlags {
  scope: FinanceScope;
  canAccessFinance: boolean;
  canAccessFullFinance: boolean;
  canAccessTools: boolean;
}

export function financeScopeFlags(scope: FinanceScope): FinanceScopeFlags {
  return {
    scope,
    canAccessFinance: scope !== "none",
    canAccessFullFinance: scope === "full",
    canAccessTools: scope === "full" || scope === "tools",
  };
}

export function isFinanceViewAllowed(scope: FinanceScope, view: FinanceView): boolean {
  if (scope === "full") return true;
  if (scope === "tools") return TOOLS_SCOPE_VIEWS.includes(view);
  return false;
}

/**
 * View efetiva: normaliza o parâmetro da URL e, no escopo `tools`, substitui
 * qualquer view proibida por `subscriptions` (nunca monta a área bloqueada).
 */
export function resolveFinanceView(scope: FinanceScope, requested: string | null): FinanceView {
  const candidate = FINANCE_VIEWS.includes(requested as FinanceView)
    ? (requested as FinanceView)
    : "overview";
  if (isFinanceViewAllowed(scope, candidate)) return candidate;
  return scope === "tools" ? "subscriptions" : "overview";
}

/** Centros de custo permitidos no cadastro conforme o escopo. */
export function allowedCostCentersForScope(scope: FinanceScope): string[] {
  const all = ["midia", "sistemas", "administrativo", "compartilhado"];
  return scope === "tools" ? all.filter((c) => c !== "administrativo") : all;
}

/** Tipos de cadastro permitidos conforme o escopo. */
export function allowedKindsForScope(scope: FinanceScope): string[] {
  if (scope === "tools") return ["tool", "package", "included_resource"];
  return ["expense", "tool", "package", "card", "included_resource"];
}

export function isKindAllowedForScope(scope: FinanceScope, kind: string): boolean {
  return allowedKindsForScope(scope).includes(kind);
}
