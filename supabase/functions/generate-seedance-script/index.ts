// Generates a single multi-shot Seedance prompt using GPT-5.6 (Terra) via the Lovable AI Gateway.
// Seedance models understand cuts, camera moves, and shot timing inside ONE prompt — this endpoint
// turns a raw idea (or an existing scene description) into a production-grade multi-shot script that
// fits the chosen duration (5–10s for 1.x, 4–15s for v2).

import { createClient } from "npm:@supabase/supabase-js@2";
import { getSystemPrompt } from "../_shared/system-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL_ID = "openai/gpt-5.6-terra";

type Payload = {
  tenantId: string;
  clientId: string;
  idea: string;                    // raw user idea OR existing scene description
  durationSeconds: number;         // target clip duration
  model: "lite" | "pro" | "v2";
  ratio?: string;                  // 9:16, 16:9, 1:1, 4:5, 21:9, adaptive
  mascotSpeech?: string | null;
  pronunciationHints?: string | null;
  brandColors?: string[];
  brandTypography?: string | null;
  hasLogo?: boolean;
  logoStrategy?: "none" | "contextual" | "end_card";
  refsLegend?: string[];           // human labels for [Image 1], [Image 2]…
  clientNiche?: string | null;
  clientTone?: string | null;
};

const DEFAULT_SYSTEM = `You are a senior video director writing prompts for ByteDance Seedance.

Seedance models generate ONE continuous clip from a SINGLE prompt but understand explicit multi-shot direction: numbered shots, cut markers, and camera-move directives inside square brackets.

Your job: turn the user's raw idea into a production-ready multi-shot prompt in ENGLISH that fits EXACTLY the target duration and respects the brand.

Hard rules:
- Output ONLY the final prompt text (no preamble, no JSON, no code fences, no explanation).
- Structure:
  1. One-line audience/style/aspect header (target audience, mood, aspect ratio, photorealistic/animated).
  2. A sequence of CUE blocks that sum to the exact target duration. Example: "CUE 0–3s — Hook. [Medium shot, dolly in] …" then "CUE 3–7s — Development. [cut to] [Low-angle shot] …" then "CUE 7–10s — Payoff. [cut to] [Wide shot, slow pan right] …".
  3. Each CUE must name a shot type in [brackets] (Medium shot / Close-up / Low-angle / Wide / Over-the-shoulder), a camera move ([dolly in], [pan right], [tilt up], [static]), and a clear on-screen action.
  4. Use [cut to] between shots. Never fade or dissolve unless the idea explicitly calls for it.
- Length: 3 to 5 CUE blocks depending on duration. 4–6s → 2–3 CUEs. 7–10s → 3–4 CUEs. 11–15s → 4–5 CUEs.
- If image references are provided, refer to them as "[Image 1]", "[Image 2]" etc. using their given labels naturally inside the CUE actions.
- If mascot speech is provided, place the Portuguese line between double quotes inside the CUE where the character speaks; keep quotes verbatim.
- Brand colors apply ONLY to graphic overlays, logos, and typography — never tint real objects, skin, or environments.
- No text overlays unless the idea explicitly requests them.
- No forbidden wording: never write "real person", "real human", "real face", "actual person", "pessoa real". Refer to any person as "the character" or "the presenter".
- Keep the whole prompt under ~200 words.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    if (!body.idea || !body.tenantId || !body.clientId) {
      return new Response(
        JSON.stringify({ error: "idea, tenantId e clientId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const customSystem = await getSystemPrompt(supabase, body.tenantId, "seedance_multishot_script");
    const systemPrompt = customSystem?.trim() ? customSystem : DEFAULT_SYSTEM;

    const isV2 = body.model === "v2";
    const [minDur, maxDur] = isV2 ? [4, 15] : [5, 10];
    const targetDuration = Math.max(minDur, Math.min(maxDur, Math.round(body.durationSeconds ?? (isV2 ? 8 : 6))));

    const contextLines: string[] = [];
    contextLines.push(`Idea (Portuguese OK, translate to English in the final prompt):\n${body.idea.trim()}`);
    contextLines.push(`Target duration: EXACTLY ${targetDuration} seconds.`);
    contextLines.push(`Aspect ratio: ${body.ratio ?? "9:16"}.`);
    contextLines.push(`Seedance model: ${body.model} (${isV2 ? "supports omni-ref + audio, up to 15s" : "supports first/last frame, up to 10s"}).`);
    if (body.clientNiche) contextLines.push(`Client niche: ${body.clientNiche}.`);
    if (body.clientTone) contextLines.push(`Client tone of voice: ${body.clientTone}.`);
    if (body.brandColors?.length) contextLines.push(`Brand colors (graphic overlays only): ${body.brandColors.join(", ")}.`);
    if (body.brandTypography) contextLines.push(`Brand typography vibe: ${body.brandTypography}.`);
    if (body.hasLogo && body.logoStrategy && body.logoStrategy !== "none") {
      contextLines.push(
        body.logoStrategy === "end_card"
          ? "Logo strategy: reserve the final ~0.8s for a clean end card centering the brand logo on a solid background."
          : "Logo strategy: place the brand logo naturally inside the scene as a subtle contextual element — never as a floating watermark.",
      );
    }
    if (body.mascotSpeech?.trim()) {
      contextLines.push(`Mascot/character speaks in Brazilian Portuguese: "${body.mascotSpeech.trim()}"`);
    }
    if (body.refsLegend?.length) {
      const legend = body.refsLegend.map((l, i) => `[Image ${i + 1}] = ${l}`).join("; ");
      contextLines.push(`Image references available: ${legend}. Reference them by their [Image N] tag.`);
    }

    const gatewayResp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        reasoning_effort: "none",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextLines.join("\n\n") },
        ],
      }),
    });

    if (!gatewayResp.ok) {
      const errText = await gatewayResp.text();
      console.error(`Gateway error [${gatewayResp.status}]: ${errText.slice(0, 500)}`);
      if (gatewayResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições. Tente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (gatewayResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos Lovable AI esgotados. Recarregue em Settings → Plans & credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Erro AI Gateway ${gatewayResp.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const gatewayData = await gatewayResp.json();
    const prompt: string = gatewayData?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Modelo não retornou roteiro. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, prompt, durationSeconds: targetDuration, model: MODEL_ID }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-seedance-script error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
