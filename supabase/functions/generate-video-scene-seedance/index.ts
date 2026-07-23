import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSeedancePrompt, type SeedanceRef } from "../_shared/seedance-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

const MODEL_ID: Record<string, string> = {
  lite: "seedance-1.0-lite",
  pro: "seedance-1-0-pro-250528",
  v2: "dreamina-seedance-2-0-260128",
};

type Payload = {
  model?: "lite" | "pro" | "v2";
  prompt: string; // scene description
  mascotSpeech?: string | null;
  ratio?: string; // 9:16 | 16:9 | 1:1 | 4:5 | adaptive
  duration?: number; // 2-12
  resolution?: "480p" | "720p" | "1080p";
  generateAudio?: boolean;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  mascotImageUrls?: string[];
  logoUrl?: string | null;
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

    const modelKey = body.model ?? "pro";
    const modelId = MODEL_ID[modelKey] ?? MODEL_ID.pro;
    const isV2 = modelKey === "v2";

    // Build ordered image references — order MUST match [Image N] labels in prompt.
    const refs: SeedanceRef[] = [];
    if (body.firstFrameUrl) refs.push({ kind: "first_frame", url: body.firstFrameUrl });
    if (body.lastFrameUrl) refs.push({ kind: "last_frame", url: body.lastFrameUrl });
    for (const u of (body.mascotImageUrls ?? []).slice(0, 4)) refs.push({ kind: "mascot", url: u });
    if (body.logoUrl) refs.push({ kind: "logo", url: body.logoUrl });
    for (const u of (body.productImageUrls ?? []).slice(0, 3)) refs.push({ kind: "product", url: u });
    if (body.realCharacterImageUrl) refs.push({ kind: "character", url: body.realCharacterImageUrl });

    // Seedance 1.x pro/lite: hard-limit 2 images (first + last). v2 accepts up to 9.
    const maxRefs = isV2 ? 9 : 4;
    const trimmedRefs = refs.slice(0, maxRefs);

    const prompt = buildSeedancePrompt({
      sceneDescription: body.prompt,
      mascotSpeech: body.mascotSpeech ?? null,
      brandColors: body.brandColors ?? [],
      brandTypography: body.brandTypography ?? null,
      refs: trimmedRefs,
    });

    const content: any[] = [{ type: "text", text: prompt }];
    for (const r of trimmedRefs) {
      content.push({ type: "image_url", image_url: { url: r.url } });
    }
    if (isV2 && body.voiceSampleUrl) {
      content.push({ type: "audio_url", audio_url: { url: body.voiceSampleUrl } });
    }

    const requestBody: Record<string, any> = {
      model: modelId,
      content,
      ratio: normalizeRatio(body.ratio),
      duration: Math.max(2, Math.min(12, body.duration ?? 5)),
      resolution: body.resolution ?? "1080p",
      watermark: false,
    };
    if (isV2) requestBody.generate_audio = !!body.generateAudio;

    console.log("Seedance create task", {
      modelId,
      refs: trimmedRefs.length,
      ratio: requestBody.ratio,
      duration: requestBody.duration,
      resolution: requestBody.resolution,
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
