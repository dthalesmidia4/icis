/**
 * Modo da Visão Geral unificada (Escritório virtual × Visão operacional).
 * Preferência leve por usuário/tenant em localStorage — sem tabela nova.
 */
export type OverviewMode = "escritorio" | "operacional";

export const OVERVIEW_MODES: { id: OverviewMode; label: string }[] = [
  { id: "escritorio", label: "Escritório virtual" },
  { id: "operacional", label: "Visão geral" },
];

/** Padrão desta fase: protagonismo do ambiente gamificado. */
export const DEFAULT_OVERVIEW_MODE: OverviewMode = "escritorio";

export function isOverviewMode(value: unknown): value is OverviewMode {
  return value === "escritorio" || value === "operacional";
}

export function overviewModeStorageKey(
  userId: string | null | undefined,
  tenantId: string | null | undefined,
): string {
  return `icis:overview-mode:${userId || "anon"}:${tenantId || "no-tenant"}`;
}

export function readOverviewMode(
  userId: string | null | undefined,
  tenantId: string | null | undefined,
): OverviewMode | null {
  try {
    const raw = window.localStorage.getItem(overviewModeStorageKey(userId, tenantId));
    return isOverviewMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeOverviewMode(
  userId: string | null | undefined,
  tenantId: string | null | undefined,
  mode: OverviewMode,
): void {
  if (!isOverviewMode(mode)) return;
  try {
    window.localStorage.setItem(overviewModeStorageKey(userId, tenantId), mode);
  } catch {
    /* storage indisponível: modo segue apenas em memória */
  }
}
