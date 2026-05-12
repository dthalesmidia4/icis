// Unified image generation across providers (Google Gemini + OpenAI gpt-image-2).
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import {
  GOOGLE_API_BASE,
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
  OPENAI_IMAGES_URL,
  type ImageAiModel,
} from "./models.ts";
import type { InlineImage } from "./fetch-image.ts";

export type GenerateImageInput = {
  aiModel?: ImageAiModel | null;
  prompt: string;
  mascotInline?: InlineImage[];
  logoInline?: InlineImage | null;
  aspectLabel?: string;             // e.g. "1:1 (1024x1024)" or "1:1" / "9:16" / "16:9"
  googleApiKey?: string;            // required when provider=google
  openaiApiKey?: string;            // required when provider=openai
};

export type GenerateImageOk = {
  ok: true;
  imageBytes: Uint8Array;
  mimeType: string;
  ext: "png" | "jpg";
};

export type GenerateImageErr = {
  ok: false;
  error: string;
  status?: number;
  rateLimited?: boolean;
};

export type GenerateImageResult = GenerateImageOk | GenerateImageErr;

function resolveAspect(aspectLabel?: string): "1024x1024" | "1024x1536" | "1536x1024" {
  const a = (aspectLabel || "").toLowerCase();
  if (a.includes("9:16") || a.includes("4:5") || a.includes("1024x1536")) return "1024x1536";
  if (a.includes("16:9") || a.includes("1536x1024")) return "1536x1024";
  return "1024x1024";
}

export async function generateImageWithModel(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const aiModel: ImageAiModel = (input.aiModel && IMAGE_MODELS[input.aiModel])
    ? input.aiModel
    : DEFAULT_IMAGE_MODEL;
  const cfg = IMAGE_MODELS[aiModel];

  if (cfg.provider === "google") {
    if (!input.googleApiKey) {
      return { ok: false, error: "Chave Google AI Studio ausente." };
    }
    const url = `${GOOGLE_API_BASE}/models/${cfg.id}:generateContent?key=${input.googleApiKey}`;
    const parts: any[] = [{ text: input.prompt }];
    for (const m of input.mascotInline || []) parts.push({ inlineData: m });
    if (input.logoInline) parts.push({ inlineData: input.logoInline });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        error: errText || `HTTP ${response.status}`,
        status: response.status,
        rateLimited: response.status === 429,
      };
    }

    const data = await response.json();
    let imageBase64 = "";
    let mimeType = "image/png";
    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData) {
          imageBase64 = inlineData.data;
          mimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
          break;
        }
      }
      if (imageBase64) break;
    }
    if (!imageBase64) return { ok: false, error: "no_image_in_response" };
    const imageBytes = decodeBase64(imageBase64);
    const ext: "png" | "jpg" = mimeType.includes("jpeg") ? "jpg" : "png";
    return { ok: true, imageBytes, mimeType, ext };
  }

  // OpenAI gpt-image-2
  if (!input.openaiApiKey) {
    return { ok: false, error: "Chave OpenAI ausente." };
  }
  const size = resolveAspect(input.aspectLabel);
  const hasReferences = (input.mascotInline?.length || 0) > 0 || !!input.logoInline;
  const promptWithNote = hasReferences
    ? `${input.prompt}\n\nOBSERVAÇÃO: Imagens de referência (mascote/logo) não foram anexadas porque o modelo gpt-image-2 não suporta entradas de imagem em /v1/images/generations. Siga rigorosamente as descrições escritas acima.`
    : input.prompt;

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.id,
      prompt: promptWithNote,
      size,
      n: 1,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return {
      ok: false,
      error: errText || `HTTP ${response.status}`,
      status: response.status,
      rateLimited: response.status === 429,
    };
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, error: "no_image_in_response" };
  const imageBytes = decodeBase64(b64);
  return { ok: true, imageBytes, mimeType: "image/png", ext: "png" };
}
