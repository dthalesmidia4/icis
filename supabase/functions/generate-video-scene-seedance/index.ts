import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSeedancePrompt, type SeedanceRef } from "../_shared/seedance-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

// Official BytePlus Model Ark IDs (region ap-southeast-1). Keep legacy `lite` alias for
// backwards-compat with old records; it now maps to `pro_fast` since Ark no longer offers
// a standalone 1.0 lite endpoint.
const MODEL_ID: Record<string, string> = {
  lite: "seedance-1-0-pro-fast-251015",
  pro: "seedance-1-0-pro-250528",
  pro_fast: "seedance-1-0-pro-fast-251015",
  v15_pro: "seedance-1-5-pro-251215",
  v2: "dreamina-seedance-2-0-260128",
  v2_fast: "dreamina-seedance-2-0-fast-260128",
  v2_mini: "dreamina-seedance-2-0-mini-260615",
};

export type SeedanceModelKey =
  | "lite"
  | "pro"
  | "pro_fast"
  | "v15_pro"
  | "v2"
  | "v2_fast"
  | "v2_mini";

function modelCapabilities(model: SeedanceModelKey) {
  if (model === "v2" || model === "v2_fast" || model === "v2_mini") {
    return { minDur: 4, maxDur: 15, defaultDur: 8, supportsAudio: true, supports1080p: model === "v2", maxRefs: 9 };
  }
  if (model === "v15_pro") {
    return { minDur: 3, maxDur: 12, defaultDur: 6, supportsAudio: true, supports1080p: true, maxRefs: 4 };
  }
  // pro / pro_fast / lite
  return { minDur: 5, maxDur: 10, defaultDur: 5, supportsAudio: false, supports1080p: true, maxRefs: 4 };
}

type Payload = {
  model?: SeedanceModelKey;
  prompt: string; // scene description
  // (fala PT-BR + grafia fonética já vivem dentro dos CUEs do prompt)
  ratio?: string; // 9:16 | 16:9 | 1:1 | 4:5 | adaptive
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  generateAudio?: boolean;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  mascotImageUrls?: string[];
  logoUrl?: string | null;
  logoStrategy?: "none" | "contextual" | "end_card";
  brandColors?: string[];
  brandTypography?: string | null;
  productImageUrls?: string[];
  realCharacterImageUrl?: string | null;
  voiceSampleUrl?: string | null;
  clientId: string;
  tenantId: string;
  sceneIndex?: number;
};

function normalizeRatio(r?: string): string {
  if (!r) return "adaptive";
  const ok = ["9:16", "16:9", "1:1", "4:5", "21:9", "adaptive"];
  return ok.includes(r) ? r : "adaptive";
}

async function pollTask(taskId: string, apiKey: string): Promise<any> {
  const maxAttempts = 60; // ~10 min at 10s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const resp = await fetch(`${ARK_BASE}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error(`Poll error (${i + 1}) status=${resp.status}: ${t.slice(0, 300)}`);
      continue;
    }
    const data = await resp.json();
    const status = data?.status;
    console.log(`Poll ${i + 1}: status=${status}`);
    if (status === "succeeded") return data;
    if (status === "failed" || status === "cancelled") {
      throw new Error(`Task ${status}: ${JSON.stringify(data?.error ?? data).slice(0, 400)}`);
    }
  }
  throw new Error("Seedance task timed out after ~10 minutes");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    const { clientId, tenantId, sceneIndex = 0 } = body;

    if (!body.prompt || !clientId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "prompt, clientId e tenantId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("SEEDANCE_ARK_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "SEEDANCE_ARK_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const modelKey: SeedanceModelKey = (body.model as SeedanceModelKey) ?? "v15_pro";
    const modelId = MODEL_ID[modelKey] ?? MODEL_ID.v15_pro;
    const caps = modelCapabilities(modelKey);

    // Build ordered image references — order MUST match [Image N] labels in prompt.
    const refs: SeedanceRef[] = [];
    if (body.firstFrameUrl) refs.push({ kind: "first_frame", url: body.firstFrameUrl });
    if (body.lastFrameUrl) refs.push({ kind: "last_frame", url: body.lastFrameUrl });
    for (const u of (body.mascotImageUrls ?? []).slice(0, 4)) refs.push({ kind: "mascot", url: u });
    if (body.logoUrl) refs.push({ kind: "logo", url: body.logoUrl });
    for (const u of (body.productImageUrls ?? []).slice(0, 3)) refs.push({ kind: "product", url: u });
    if (body.realCharacterImageUrl) refs.push({ kind: "character", url: body.realCharacterImageUrl });

    const trimmedRefs = refs.slice(0, caps.maxRefs);

    const prompt = buildSeedancePrompt({
      sceneDescription: body.prompt,
      brandColors: body.brandColors ?? [],
      brandTypography: body.brandTypography ?? null,
      logoStrategy: body.logoStrategy ?? "none",
      hasLogo: !!body.logoUrl,
      refs: trimmedRefs,
    });

    const content: any[] = [{ type: "text", text: prompt }];
    for (const r of trimmedRefs) {
      content.push({ type: "image_url", image_url: { url: r.url } });
    }
    if (caps.supportsAudio && body.voiceSampleUrl) {
      content.push({ type: "audio_url", audio_url: { url: body.voiceSampleUrl } });
    }

    const clampedDuration = Math.max(caps.minDur, Math.min(caps.maxDur, body.duration ?? caps.defaultDur));

    // v2_fast / v2_mini do not support 1080p — force 720p to avoid provider 400s.
    let resolution: "480p" | "720p" | "1080p" = body.resolution ?? "1080p";
    if (!caps.supports1080p && resolution === "1080p") resolution = "720p";

    const requestBody: Record<string, any> = {
      model: modelId,
      content,
      ratio: normalizeRatio(body.ratio),
      duration: clampedDuration,
      resolution,
      watermark: false,
    };
    if (caps.supportsAudio) requestBody.generate_audio = !!body.generateAudio;

    console.log("Seedance create task", {
      modelKey,
      modelId,
      refs: trimmedRefs.length,
      ratio: requestBody.ratio,
      duration: requestBody.duration,
      resolution: requestBody.resolution,
      audio: requestBody.generate_audio ?? false,
    });

    const createResp = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      console.error(`Seedance create failed [${createResp.status}]:`, errText.slice(0, 500));
      if (createResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Sem saldo na conta BytePlus/Seedance. Recarregue e tente novamente." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (createResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Aguarde alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (createResp.status === 401 || createResp.status === 403) {
        return new Response(
          JSON.stringify({ error: "Chave SEEDANCE_ARK_API_KEY inválida ou sem permissão." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Erro Seedance ${createResp.status}: ${errText.slice(0, 300)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const createData = await createResp.json();
    const taskId = createData?.id;
    if (!taskId) {
      console.error("Missing task id:", JSON.stringify(createData).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Resposta inesperada da API Seedance." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Seedance task started:", taskId);
    const result = await pollTask(taskId, apiKey);

    const videoUrl: string | undefined =
      result?.content?.video_url ??
      result?.content?.videos?.[0]?.url ??
      result?.result?.video_url;

    if (!videoUrl) {
      console.error("No video url in result:", JSON.stringify(result).slice(0, 600));
      return new Response(
        JSON.stringify({ error: "Seedance não retornou URL de vídeo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Download the video and re-upload to our storage (Seedance URLs expire).
    const dl = await fetch(videoUrl);
    if (!dl.ok) {
      return new Response(
        JSON.stringify({ error: "Falha ao baixar vídeo gerado pelo Seedance." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const bytes = new Uint8Array(await dl.arrayBuffer());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const filePath = `video-scenes-seedance/${clientId}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("card-attachments")
      .upload(filePath, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) {
      console.error("Storage upload error:", upErr);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar vídeo no storage." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: pub } = supabase.storage.from("card-attachments").getPublicUrl(filePath);
    console.log("Seedance video ready:", pub.publicUrl);

    return new Response(
      JSON.stringify({ success: true, videoUrl: pub.publicUrl, sceneIndex, model: modelId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-video-scene-seedance error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
