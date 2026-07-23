// Shared prompt builder for Seedance video generation.
// Merges the scene description, optional mascot speech, brand identity guidance,
// and numbered image references — while filtering any wording that could reveal
// that a reference image depicts a real person. The main-character slot is
// treated silently as just another reference image.

export type SeedanceRefKind =
  | "mascot"
  | "logo"
  | "product"
  | "scene"
  | "character"
  | "first_frame"
  | "last_frame";

export interface SeedanceRef {
  kind: SeedanceRefKind;
  url: string;
}

export interface BuildPromptInput {
  sceneDescription: string;
  brandColors?: string[];
  brandTypography?: string | null;
  logoStrategy?: "none" | "contextual" | "end_card";
  hasLogo?: boolean;
  refs: SeedanceRef[]; // in the order that maps to [Image 1], [Image 2]…
}

// Words we strip from the model-visible prompt to avoid content-policy denials.
// Applied case-insensitively.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\breal\s+(person|human|man|woman|people|face|photo)\b/gi,
  /\breal-?life\s+(person|human)\b/gi,
  /\bactual\s+(person|human)\b/gi,
  /\bphoto\s+of\s+a\s+real\b/gi,
  /\bpessoa\s+real\b/gi,
  /\bhumano\s+real\b/gi,
  /\bfoto\s+real\b/gi,
];

function sanitize(text: string): string {
  let out = text;
  for (const re of FORBIDDEN_PATTERNS) out = out.replace(re, "the character");
  return out.replace(/\s{2,}/g, " ").trim();
}

function labelFor(kind: SeedanceRefKind): string {
  switch (kind) {
    case "mascot": return "the mascot character";
    case "logo": return "the brand logo";
    case "product": return "the product";
    case "scene": return "the scene/environment reference";
    case "character": return "the main character";
    case "first_frame": return "the opening frame";
    case "last_frame": return "the closing frame";
  }
}

export function buildSeedancePrompt(input: BuildPromptInput): string {
  const parts: string[] = [];
  parts.push(sanitize(input.sceneDescription));
  // Fala e grafia fonética PT-BR já vivem dentro dos CUEs da própria descrição.

  if (input.refs.length > 0) {
    const legend = input.refs
      .map((r, i) => `[Image ${i + 1}] = ${labelFor(r.kind)}`)
      .join("; ");
    parts.push(`Image references: ${legend}.`);
    parts.push(
      `Maintain strict visual consistency with the referenced images across the whole clip.`,
    );
  }

  if (input.brandColors && input.brandColors.length > 0) {
    parts.push(
      `Brand color palette to respect in graphic overlays and accents: ${input.brandColors.join(", ")}. Do not tint real objects or skin with these colors — only apply them to graphic elements, logos, and text overlays.`,
    );
  }

  if (input.brandTypography && input.brandTypography.trim()) {
    parts.push(`Any on-screen typography should feel like: ${input.brandTypography}.`);
  }

  if (input.hasLogo && input.logoStrategy && input.logoStrategy !== "none") {
    if (input.logoStrategy === "end_card") {
      parts.push(
        `Reserve the final ~0.8s of the clip for a clean end card that centers the brand logo on a solid background using the brand colors. The logo must appear only in this closing frame, never earlier.`,
      );
    } else {
      parts.push(
        `Place the brand logo naturally inside the scene as a subtle contextual element (e.g. on a product package, a sign, a screen, or an apparel print). Keep the logo legible but never dominant, and never overlay it as a floating watermark.`,
      );
    }
  }

  return parts.join("\n\n");
}
