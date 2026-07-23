// Central catalog for Seedance model keys used across the ClientHub video flow.
// Model IDs mirror BytePlus Model Ark (region ap-southeast-1). Keep `lite` for legacy
// records only; the selector no longer offers it.

export type SeedanceModelKey =
  | "lite"
  | "pro"
  | "pro_fast"
  | "v15_pro"
  | "v2"
  | "v2_fast"
  | "v2_mini";

export type SeedanceModelCaps = {
  minDur: number;
  maxDur: number;
  defaultDur: number;
  supportsAudio: boolean;
  supports1080p: boolean;
  label: string;
  hint: string;
};

export const SEEDANCE_MODEL_OPTIONS: Array<{ value: SeedanceModelKey } & SeedanceModelCaps> = [
  {
    value: "v15_pro",
    label: "Seedance 1.5 Pro (recomendado · áudio nativo)",
    hint: "Melhor custo-benefício com voz sincronizada. 3–12s.",
    minDur: 3, maxDur: 12, defaultDur: 6, supportsAudio: true, supports1080p: true,
  },
  {
    value: "v2",
    label: "Dreamina Seedance 2.0 (top qualidade)",
    hint: "Multi-ref (até 9) + áudio. 4–15s. Mais caro.",
    minDur: 4, maxDur: 15, defaultDur: 8, supportsAudio: true, supports1080p: true,
  },
  {
    value: "v2_fast",
    label: "Dreamina 2.0 Fast (rápido · sem 1080p)",
    hint: "Versão econômica do 2.0. Máx 720p, com áudio.",
    minDur: 4, maxDur: 15, defaultDur: 6, supportsAudio: true, supports1080p: false,
  },
  {
    value: "v2_mini",
    label: "Dreamina 2.0 Mini (barato · sem 1080p)",
    hint: "Ideal para rascunhos rápidos. Máx 720p.",
    minDur: 4, maxDur: 15, defaultDur: 5, supportsAudio: true, supports1080p: false,
  },
  {
    value: "pro",
    label: "Seedance 1.0 Pro (clássico · sem áudio)",
    hint: "Estável, sem voz. 5–10s.",
    minDur: 5, maxDur: 10, defaultDur: 5, supportsAudio: false, supports1080p: true,
  },
  {
    value: "pro_fast",
    label: "Seedance 1.0 Pro Fast (econômico · sem áudio)",
    hint: "Versão barata do 1.0 Pro. 5–10s.",
    minDur: 5, maxDur: 10, defaultDur: 5, supportsAudio: false, supports1080p: true,
  },
];

export function seedanceCaps(model: SeedanceModelKey | undefined | null): SeedanceModelCaps {
  const key = (model ?? "v15_pro") as SeedanceModelKey;
  const found = SEEDANCE_MODEL_OPTIONS.find((o) => o.value === key);
  if (found) return found;
  // legacy `lite` fallback
  return {
    minDur: 5, maxDur: 10, defaultDur: 5, supportsAudio: false, supports1080p: true,
    label: "Seedance (legacy)", hint: "",
  };
}
