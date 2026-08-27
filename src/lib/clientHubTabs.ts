/**
 * NAVEGAÇÃO DO CLIENT HUB (fonte única).
 *
 * Expansão não é mais uma aba: o plano regional é lido dentro de Estratégia.
 * Links antigos continuam válidos e caem em Estratégia preservando `market`.
 */
export const HUB_TABS = [
  "estrategia",
  "midia-paga",
  "calendario",
  "demandas",
  "feed",
  "cuidados",
  "comercial",
] as const;

export type HubTab = (typeof HUB_TABS)[number];

export const HUB_TAB_LABELS: Record<HubTab, string> = {
  estrategia: "Estratégia",
  "midia-paga": "Mídia paga",
  calendario: "Calendário",
  demandas: "Demandas",
  feed: "Feed Simulado",
  cuidados: "Cuidados fundamentais",
  comercial: "Comercial",
};

const ALIASES: Record<string, HubTab> = {
  acquisition: "estrategia",
  aquisicao: "estrategia",
  expansion: "estrategia",
  expansao: "estrategia",
  strategy: "estrategia",
  "paid-media": "midia-paga",
  calendar: "calendario",
  demands: "demandas",
  safeguards: "cuidados",
  commercial: "comercial",
};

export function normalizeHubTab(tab: string | null | undefined): HubTab {
  const normalized = ALIASES[tab || ""] || (tab || "");
  return (HUB_TABS as readonly string[]).includes(normalized)
    ? (normalized as HubTab)
    : "estrategia";
}
