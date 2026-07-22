// Single source of truth for AI models used across edge functions.
// Rule: same task = same model + same prompt (avulso vs período).

export type ImageAiModel = "nanobanana3" | "nanobanana25" | "gpt2";

export const IMAGE_MODELS: Record<
  ImageAiModel,
  { provider: "google" | "openai"; id: string; label: string }
> = {
  nanobanana3:  { provider: "google", id: "gemini-3-pro-image-preview",     label: "Nanobanana 3 (Pro)" },
  nanobanana25: { provider: "google", id: "gemini-2.5-flash-image-preview", label: "Nanobanana 2.5 (Flash)" },
  gpt2:         { provider: "openai", id: "gpt-image-2",                    label: "GPT Image 2" },
};

export const DEFAULT_IMAGE_MODEL: ImageAiModel = "gpt2";

export const MODELS = {
  // Default image model (kept for backward compatibility with callers using MODELS.IMAGE)
  IMAGE: IMAGE_MODELS[DEFAULT_IMAGE_MODEL].id,
  VIDEO: "veo-3.1-generate-preview",

  // OpenAI direct API
  TEXT_PLANNING: "gpt-5-mini",
  TEXT_LIGHT: "gpt-4o-mini",
} as const;

export const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
export const OPENAI_IMAGES_EDIT_URL = "https://api.openai.com/v1/images/edits";
