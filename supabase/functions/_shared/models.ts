// Single source of truth for AI models used across edge functions.
// Rule: same task = same model + same prompt (avulso vs período).
export const MODELS = {
  // Google AI Studio direct API
  IMAGE: "gemini-3-pro-image-preview",
  VIDEO: "veo-3.1-generate-preview",

  // OpenAI direct API
  // Conteúdo final visível ao cliente (roteiros, planejamento, copy de carrossel, storyboard)
  TEXT_PLANNING: "gpt-5-mini",
  // Tarefas internas (reavaliação, supervisão de equipe, anamnese, desafios)
  TEXT_LIGHT: "gpt-4o-mini",
} as const;

export const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
