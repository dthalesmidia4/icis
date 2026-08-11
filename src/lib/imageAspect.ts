/**
 * Proporção de arte — fonte única de verdade no frontend.
 *
 * Padrão do sistema para peças sociais estáticas e carrosséis: 4:5 (feed vertical).
 * A escolha explícita da interface é AUTORITATIVA e prevalece sobre dimensões
 * legadas citadas em textos de instruções antigos (ex.: "1080x1080").
 */

export type ImageAspectRatio = "4:5" | "1:1" | "9:16" | "16:9" | "3:4" | "4:3";

export const IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = ["4:5", "1:1", "9:16", "16:9", "3:4", "4:3"];

export const IMAGE_ASPECT_OPTIONS: { value: ImageAspectRatio; label: string }[] = [
  { value: "4:5", label: "4:5 — Feed vertical (padrão)" },
  { value: "1:1", label: "1:1 — Quadrado" },
  { value: "9:16", label: "9:16 — Stories / Reels" },
  { value: "16:9", label: "16:9 — Horizontal" },
  { value: "3:4", label: "3:4 — Vertical" },
  { value: "4:3", label: "4:3 — Horizontal" },
];

export const DEFAULT_SOCIAL_ASPECT: ImageAspectRatio = "4:5";

const ASPECT_SET = new Set<string>(IMAGE_ASPECT_RATIOS);

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return typeof value === "string" && ASPECT_SET.has(value);
}

/** Tipos de demanda que são peças de imagem com proporção configurável. */
export function isAspectConfigurableType(demandTypeKey?: string | null, demandType?: string | null): boolean {
  const key = (demandTypeKey || "").toLowerCase();
  if (key === "criativo_estatico" || key === "carrossel") return true;
  if (key) return false;
  const t = (demandType || "").toLowerCase();
  return t.includes("post") || t.includes("estátic") || t.includes("estatic") ||
    t.includes("carrossel") || t.includes("carousel");
}

/**
 * Resolve a proporção atual de um card de planejamento (JSON) ou de uma demand.
 * Ordem: aspect_ratio → image_aspect_ratio (legado/futuro) → default por tipo.
 */
export function resolveCardAspect(
  card: any,
  opts?: { demandTypeKey?: string | null; demandType?: string | null },
): ImageAspectRatio {
  const explicit = card?.aspect_ratio ?? card?.image_aspect_ratio;
  if (isImageAspectRatio(explicit)) return explicit;

  const key = opts?.demandTypeKey ?? card?.demand_type_key ?? card?.type_key ?? null;
  const type = opts?.demandType ?? card?.tipo ?? card?.tipo_conteudo ?? card?.type ?? card?.demand_type ?? null;

  if (isAspectConfigurableType(key, type)) return DEFAULT_SOCIAL_ASPECT;
  const t = (type || "").toLowerCase();
  if (t.includes("reel") || t.includes("stories") || t.includes("story")) return "9:16";
  return DEFAULT_SOCIAL_ASPECT;
}
