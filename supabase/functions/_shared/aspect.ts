// Shared aspect-ratio helpers — single source of truth for sizing across providers.
//
// Centralised so every edge function (carousel, standalone, auto, period) maps
// the user-facing ratio to the same provider parameters.

export type AspectRatio = "1:1" | "9:16" | "16:9" | "4:5" | "4:3" | "3:4";

/** Normalise free-form aspect strings to a canonical ratio. */
export function normalizeAspectRatio(input?: string | null): AspectRatio {
  const a = (input || "").toLowerCase();
  if (a.includes("9:16")) return "9:16";
  if (a.includes("16:9")) return "16:9";
  if (a.includes("4:5")) return "4:5";
  if (a.includes("3:4")) return "3:4";
  if (a.includes("4:3")) return "4:3";
  return "1:1";
}

/**
 * Map demand_type ("Reel", "Stories", "Capa", etc) to a canonical aspect.
 * Used by auto-generate-post and generate-post-image so that period plans pick
 * the right format from the card type without manual selection.
 */
export function aspectFromDemandType(demandType?: string | null): AspectRatio {
  const t = (demandType || "").toLowerCase();
  if (t.includes("reel") || t.includes("stories") || t.includes("story") || t.includes("video curto")) return "9:16";
  if (t.includes("cover") || t.includes("banner") || t.includes("capa")) return "16:9";
  return "1:1";
}

/**
 * gpt-image-2 accepts ANY size that satisfies (per OpenAI docs):
 *  - max edge ≤ 3840 px
 *  - both edges multiples of 16
 *  - long/short ratio ≤ 3:1
 *  - total pixels in [655_360, 8_294_400]
 *
 * We pick exact-aspect sizes inside that envelope.
 *  - 9:16 / 16:9 → 1152x2048 (= 16/9 exato; 1080x1920 não é múltiplo de 16)
 *  - 4:5 → 1024x1280 (exato)
 *  - 4:3 / 3:4 → 1360x1024 (1360 múltiplo de 16; razão 1.328 ≈ 4:3)
 */
export function openaiSizeForAspect(ratio: AspectRatio): "1024x1024" | "2048x1152" | "1152x2048" | "1024x1280" | "1280x1024" | "1024x1360" | "1360x1024" {
  switch (ratio) {
    case "9:16": return "1152x2048";
    case "16:9": return "2048x1152";
    case "4:5":  return "1024x1280";
    case "3:4":  return "1024x1360";
    case "4:3":  return "1360x1024";
    case "1:1":
    default:     return "1024x1024";
  }
}

/** Gemini Image accepts only this fixed list of aspect ratios. */
export function geminiAspectRatio(ratio: AspectRatio): "1:1" | "9:16" | "16:9" | "4:3" | "3:4" {
  switch (ratio) {
    case "9:16": return "9:16";
    case "16:9": return "16:9";
    case "4:3":  return "4:3";
    case "3:4":  return "3:4";
    // Gemini não tem 4:5 nativo — mapeia para o vertical mais próximo.
    case "4:5":  return "3:4";
    case "1:1":
    default:     return "1:1";
  }
}

/** Human-readable label for prompts (sem dimensões em pixels). */
export function aspectPromptLabel(ratio: AspectRatio): string {
  switch (ratio) {
    case "9:16": return "9:16 (vertical / Reels-Stories)";
    case "16:9": return "16:9 (paisagem)";
    case "4:5":  return "4:5 (vertical de feed)";
    case "3:4":  return "3:4 (vertical)";
    case "4:3":  return "4:3 (paisagem)";
    case "1:1":
    default:     return "1:1 (quadrado)";
  }
}
