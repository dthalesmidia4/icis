/**
 * ZONA ESPACIAL DO COLABORADOR no Escritório (`/escritorio`).
 *
 * Resolver PURO: converte presença + card corrente na zona física onde o
 * personagem aparece. Existe exatamente UMA zona por colaborador — é isso que
 * garante um único personagem na cena (nunca mesa + café ao mesmo tempo).
 *
 * Semântica deliberada: `aguardando_cliente` é estado do CARD, não da pessoa.
 * Quem tem card aguardando retorno continua na mesa (ou onde estiver
 * trabalhando); os cards aguardando aparecem na Sala de espera.
 */
import type { PresenceState } from "@/lib/officePresence";
import { isCoffeeEligible } from "@/lib/officePresence";

export type OfficeZone = "desk" | "planning" | "review" | "coffee" | "off_shift";

/** Funções que representam fisicamente a mesa de Revisão/Qualidade. */
export const REVIEW_FUNCTION_KEYS = [
  "revisar",
  "revisar_roteiro",
  "revisar_captacao",
  "revisar_publicacao",
  "testar",
] as const;

/** Função que representa fisicamente o quadro de Planejamento. */
export const PLANNING_FUNCTION_KEYS = ["planejar"] as const;

const REVIEW_SET = new Set<string>(REVIEW_FUNCTION_KEYS);
const PLANNING_SET = new Set<string>(PLANNING_FUNCTION_KEYS);

/** Texto comparável: sem acento, minúsculo, sem separadores. */
export function normalizeStageText(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export interface ZoneCard {
  functionKey?: string | null;
  /** Nome da coluna do pipeline (fallback quando não há função). */
  statusName?: string | null;
  /** Etapa exibida (fallback final). */
  stageLabel?: string | null;
}

export function isPlanningCard(card?: ZoneCard | null): boolean {
  if (!card) return false;
  if (card.functionKey && PLANNING_SET.has(card.functionKey)) return true;
  if (card.functionKey) return false; // função explícita não-planejar decide
  const text = normalizeStageText(card.statusName || card.stageLabel);
  return text === "planejamento" || text === "planejar";
}

export function isReviewCard(card?: ZoneCard | null): boolean {
  return !!card?.functionKey && REVIEW_SET.has(card.functionKey);
}

export interface ResolveZoneInput {
  state: PresenceState;
  current?: ZoneCard | null;
}

/**
 * Ordem canônica: fora do expediente → café → planejamento/revisão → mesa.
 * Nunca inventa reunião (não existe fonte operacional confiável hoje).
 */
export function resolveOfficeZone({ state, current }: ResolveZoneInput): OfficeZone {
  if (state === "off_shift") return "off_shift";
  if (isCoffeeEligible(state)) return "coffee";
  if (state === "working_now" && current) {
    if (isPlanningCard(current)) return "planning";
    if (isReviewCard(current)) return "review";
    return "desk";
  }
  return "desk";
}

/** A pessoa aparece na sala? `off_shift` some da cena. */
export const zoneIsVisible = (zone: OfficeZone) => zone !== "off_shift";

/** Postura física esperada em cada zona. */
export function zonePosture(zone: OfficeZone): "seated" | "standing" {
  return zone === "desk" ? "seated" : "standing";
}

/** Quantos lugares físicos cada zona coletiva oferece (anchors distintos). */
export const ZONE_SEATS: Record<Exclude<OfficeZone, "desk" | "off_shift">, number> = {
  planning: 3,
  review: 2,
  coffee: 3,
};

/**
 * Chave do anchor DOM onde o personagem deve ficar. Índice estável evita duas
 * pessoas sobrepostas no mesmo lugar da zona.
 */
export function anchorKeyFor(zone: OfficeZone, userId: string, indexInZone: number): string | null {
  if (zone === "off_shift") return null;
  if (zone === "desk") return `desk:${userId}`;
  const seats = ZONE_SEATS[zone];
  return `${zone}:${indexInZone % seats}`;
}
