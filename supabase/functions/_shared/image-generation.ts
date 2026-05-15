// Unified image generation across providers (Google Gemini + OpenAI gpt-image-2).
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import {
  GOOGLE_API_BASE,
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
  OPENAI_IMAGES_URL,
  OPENAI_IMAGES_EDIT_URL,
  type ImageAiModel,
} from "./models.ts";
import type { InlineImage } from "./fetch-image.ts";
import {
  geminiAspectRatio,
  normalizeAspectRatio,
  openaiSizeForAspect,
} from "./aspect.ts";

export type GenerateImageInput = {
  aiModel?: ImageAiModel | null;
  prompt: string;
  mascotInline?: InlineImage[];
  logoInline?: InlineImage | null;
  aspectLabel?: string;             // e.g. "1:1", "9:16", "16:9", "4:5"
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

export async function generateImageWithModel(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const aiModel: ImageAiModel = (input.aiModel && IMAGE_MODELS[input.aiModel])
    ? input.aiModel
    : DEFAULT_IMAGE_MODEL;
  const cfg = IMAGE_MODELS[aiModel];
  const ratio = normalizeAspectRatio(input.aspectLabel);

  if (cfg.provider === "google") {
    if (!input.googleApiKey) {
      return { ok: false, error: "Chave Google AI Studio ausente." };
    }
    const url = `${GOOGLE_API_BASE}/models/${cfg.id}:generateContent?key=${input.googleApiKey}`;
    const parts: any[] = [{ text: input.prompt }];
    for (const m of input.mascotInline || []) parts.push({ inlineData: m });
    if (input.logoInline) parts.push({ inlineData: input.logoInline });

    const geminiAspect = geminiAspectRatio(ratio);
    console.log(
      `[image-gen] provider=google model=${cfg.id} requestedAspect=${ratio} effectiveAspect=${geminiAspect}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: { aspectRatio: geminiAspect },
        },
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
  const size = openaiSizeForAspect(ratio);
  console.log(
    `[image-gen] provider=openai model=${cfg.id} requestedAspect=${ratio} effectiveSize=${size}`,
  );
  const mascots = input.mascotInline || [];
  const hasReferences = mascots.length > 0 || !!input.logoInline;

  // When references exist, use /v1/images/edits (multipart) which DOES accept image inputs.
  // Otherwise, fall back to the text-only /v1/images/generations endpoint.
  let endpoint: string;
  let requestInit: RequestInit;

  if (hasReferences) {
    const form = new FormData();
    form.append("model", cfg.id);
    form.append("size", size);
    form.append("n", "1");

    // Numbered reference list helps the model preserve identity (mascote) and reuse the logo.
    const refDescriptions: string[] = [];
    let idx = 1;
    for (const m of mascots) {
      const bytes = decodeBase64(m.data);
      const blob = new Blob([bytes], { type: m.mimeType || "image/png" });
      form.append("image[]", new File([blob], `mascot_${idx}.png`, { type: blob.type }));
      refDescriptions.push(
        `Imagem ${idx}: MASCOTE/PERSONAGEM oficial — preserve EXATAMENTE rosto, idade, gênero, etnia, cabelo, roupa, proporções e estilo de ilustração. Não recrie um personagem novo.`,
      );
      idx++;
    }
    if (input.logoInline) {
      const bytes = decodeBase64(input.logoInline.data);
      const blob = new Blob([bytes], { type: input.logoInline.mimeType || "image/png" });
      form.append("image[]", new File([blob], `logo.png`, { type: blob.type }));
      refDescriptions.push(
        `Imagem ${idx}: LOGO oficial da marca — use EXATAMENTE como fornecida, sem redesenhar, alterar cores, tipografia ou proporções.`,
      );
      idx++;
    }

    const promptWithRefs =
      `${input.prompt}\n\nREFERÊNCIAS VISUAIS ANEXADAS (use-as como fonte de verdade):\n` +
      refDescriptions.map((d) => `- ${d}`).join("\n");
    form.append("prompt", promptWithRefs);

    endpoint = OPENAI_IMAGES_EDIT_URL;
    requestInit = {
      method: "POST",
      headers: { Authorization: `Bearer ${input.openaiApiKey}` },
      body: form,
    };
  } else {
    endpoint = OPENAI_IMAGES_URL;
    requestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.id,
        prompt: input.prompt,
        size,
        n: 1,
      }),
    };
  }

  // Retry on transient upstream failures (502/503/504 + network errors).
  // OpenAI's image endpoint occasionally returns Cloudflare 502 after long
  // processing; a short retry cycle recovers most of these cases.
  const TRANSIENT_STATUSES = new Set([502, 503, 504, 520, 521, 522, 524]);
  const MAX_ATTEMPTS = 3;
  let lastError = "";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, requestInit);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      lastStatus = undefined;
      console.warn(`[gpt-image-2] network error attempt ${attempt}/${MAX_ATTEMPTS}: ${lastError}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      return { ok: false, error: `Falha de rede ao chamar OpenAI: ${lastError}` };
    }

    if (response.ok) {
      const data = await response.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) return { ok: false, error: "no_image_in_response" };
      const imageBytes = decodeBase64(b64);
      return { ok: true, imageBytes, mimeType: "image/png", ext: "png" };
    }

    const errText = await response.text();
    lastError = errText || `HTTP ${response.status}`;
    lastStatus = response.status;

    const isTransient = TRANSIENT_STATUSES.has(response.status);
    console.warn(
      `[gpt-image-2] HTTP ${response.status} attempt ${attempt}/${MAX_ATTEMPTS}${isTransient ? " (transient, will retry)" : ""}`,
    );

    if (!isTransient || attempt === MAX_ATTEMPTS) {
      const friendly = isTransient
        ? "O provedor de imagem (OpenAI) está temporariamente indisponível (HTTP " +
          response.status +
          "). Tente novamente em instantes ou selecione outro modelo."
        : lastError;
      return {
        ok: false,
        error: friendly,
        status: response.status,
        rateLimited: response.status === 429,
      };
    }

    // Exponential-ish backoff: 1.5s, 3s
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }

  return { ok: false, error: lastError || "Falha desconhecida na OpenAI", status: lastStatus };
}
