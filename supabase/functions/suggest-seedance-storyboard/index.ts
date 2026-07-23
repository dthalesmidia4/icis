// Analyzes a raw video idea and decides how many Seedance clips to generate.
// Seedance produces ONE continuous clip per prompt but understands multi-shot direction
// (CUE blocks + [cut to] + shot types), so most ideas fit into a single clip. This planner
// biases hard toward fewer clips because Seedance minutes are expensive.

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
  idea: string;
  ratio?: string;
  model?: "lite" | "pro" | "v2";
  clientNiche?: string | null;
  mascotSpeech?: string | null;
  hasLogo?: boolean;
  logoStrategy?: "none" | "contextual" | "end_card";
  brandColors?: string[];
};

type Clip = {
  title_pt: string;
  description_en: string;
  target_duration_seconds: number;
};

type PlannerResult = {
  suggested_clip_count: number;
  reasoning: string;
  clips: Clip[];
};

const DEFAULT_SYSTEM = `You are a Seedance production planner.

Seedance generates ONE continuous clip per prompt but natively understands multi-shot direction: numbered CUE blocks, [cut to] markers, and [Medium shot]/[Wide]/[Close-up]/[dolly in]/[pan]/etc. cues embedded inside a single prompt. Because a single clip already carries multiple shots (up to ~5 CUEs), MOST ideas — hooks, tutorials, short ads, product beats — fit into ONE single clip with several shots inside.

Seedance is expensive. Bias hard toward FEWER clips. Prefer packing more CUEs into fewer clips over splitting the story into multiple clips. Only split into 2+ clips when the narrative genuinely cannot fit inside the model's max duration (5–10s for lite/pro, 4–15s for v2). Never produce more than 5 clips.

Rules:
- Return ONLY a valid JSON object with this exact shape (no code fences, no prose, no trailing commas):
{
  "suggested_clip_count": integer 1 to 5,
  "reasoning": "one sentence in Brazilian Portuguese explaining why this many clips and how many shots each carries.",
  "clips": [
    {
      "title_pt": "short Portuguese label, 3–6 words",
      "description_en": "the full multi-shot prompt in English with CUE 0–Xs blocks + [shot type] + [cut to] markers, ready to send to Seedance verbatim",
      "target_duration_seconds": integer within the model's allowed range
    }
  ]
}
- "clips" length MUST equal "suggested_clip_count".
- Each clip's target_duration_seconds MUST fit the given model.
- description_en MUST contain between 2 and 5 CUE blocks whose durations sum to target_duration_seconds. Aim for 3–5 CUEs when the clip is 8s or longer. Example: "CUE 0–3s — Hook. [Medium shot, dolly in] The character enters the room. [cut to] CUE 3–7s — Development. [Low-angle] …".
- No forbidden wording anywhere: never write "real person", "real human", "real face", "actual person", "pessoa real". Use "the character" / "the presenter".
- Brand colors apply ONLY to graphic overlays, logos, and typography — never tint real objects, skin, or environments.`;

function extractJson(text: string): PlannerResult | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (
      typeof parsed?.suggested_clip_count === "number" &&
      Array.isArray(parsed?.clips) &&
      parsed.clips.length > 0
    ) {
      return parsed as PlannerResult;
    }
  } catch (_) { /* fall through */ }
  return null;
}

function clampDuration(model: "lite" | "pro" | "v2", target: number): number {
  const [min, max] = model === "v2" ? [4, 15] : [5, 10];
  return Math.max(min, Math.min(max, Math.round(target)));
}

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
    const customSystem = await getSystemPrompt(supabase, body.tenantId, "seedance_storyboard_planner");
    const systemPrompt = customSystem?.trim() ? customSystem : DEFAULT_SYSTEM;

    const model = body.model ?? "pro";
    const [minDur, maxDur] = model === "v2" ? [4, 15] : [5, 10];

    const ctx: string[] = [];
    ctx.push(`Idea (Portuguese OK, translate to English in each clip's description_en):\n${body.idea.trim()}`);
    ctx.push(`Aspect ratio: ${body.ratio ?? "9:16"}.`);
    ctx.push(`Seedance model: ${model}. Allowed clip duration: ${minDur}–${maxDur} seconds.`);
    if (body.clientNiche) ctx.push(`Client niche: ${body.clientNiche}.`);
    if (body.brandColors?.length) ctx.push(`Brand colors (graphic overlays only): ${body.brandColors.join(", ")}.`);
    if (body.mascotSpeech?.trim()) ctx.push(`Mascot speaks in Brazilian Portuguese: "${body.mascotSpeech.trim()}"`);
    if (body.hasLogo && body.logoStrategy && body.logoStrategy !== "none") {
      ctx.push(
        body.logoStrategy === "end_card"
          ? "Logo strategy: reserve the final ~0.8s of the LAST clip for a clean end card centering the brand logo."
          : "Logo strategy: place the brand logo naturally inside the scene as a subtle contextual element.",
      );
    }
    ctx.push(`Return the JSON object. Remember: prefer 1 clip; only split when truly necessary.`);

    const gatewayResp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ctx.join("\n\n") },
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
    const raw: string = gatewayData?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(raw);

    // Fallback: return one clip that just carries the raw idea. Never crash the UI.
    if (!parsed) {
      const fallbackDur = clampDuration(model, model === "v2" ? 10 : 8);
      return new Response(
        JSON.stringify({
          success: true,
          fallback: true,
          suggested_clip_count: 1,
          reasoning: "Não consegui analisar a ideia com precisão — sugerindo 1 clipe único como padrão seguro.",
          clips: [{
            title_pt: "Clipe único",
            description_en: body.idea.trim(),
            target_duration_seconds: fallbackDur,
          }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Enforce hard limits.
    const cappedCount = Math.max(1, Math.min(5, Math.floor(parsed.suggested_clip_count)));
    const clips: Clip[] = parsed.clips.slice(0, cappedCount).map((c, i) => ({
      title_pt: (c?.title_pt || `Clipe ${i + 1}`).toString().slice(0, 80),
      description_en: (c?.description_en || body.idea.trim()).toString(),
      target_duration_seconds: clampDuration(model, Number(c?.target_duration_seconds) || (model === "v2" ? 10 : 8)),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        suggested_clip_count: clips.length,
        reasoning: (parsed.reasoning || "").toString().slice(0, 500),
        clips,
        model: MODEL_ID,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("suggest-seedance-storyboard error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
