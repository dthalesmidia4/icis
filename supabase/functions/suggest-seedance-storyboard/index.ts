// Analyzes a raw video idea and decides how many Seedance clips to generate.
// Seedance produces ONE continuous clip per prompt but understands multi-shot direction
// (CUE blocks + [cut to] + shot types), so most ideas fit into a single clip. This planner
// biases hard toward fewer clips because Seedance minutes are expensive.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getSystemPrompt } from "../_shared/system-prompts.ts";
import { formatSeedanceScript } from "../_shared/format-seedance-script.ts";

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
  clientNiche?: string | null;
  hasLogo?: boolean;
  brandColors?: string[];
};

type Clip = {
  title_pt: string;
  description_en: string;
  target_duration_seconds: number;
  mascot_speech_pt?: string;
};

type PlannerResult = {
  suggested_clip_count: number;
  reasoning: string;
  clips: Clip[];
};

// The planner runs before the user picks a Seedance model, so we plan against the
// WIDEST supported range (Seedance 2.0 = 4–15s). The scene editor lets the user
// pick a narrower model afterward and re-clamp per clip if needed.
const PLANNER_MIN = 4;
const PLANNER_MAX = 15;

const DEFAULT_SYSTEM = `You are a Seedance production planner.

Seedance generates ONE continuous clip per prompt but natively understands multi-shot direction: numbered CUE blocks, [cut to] markers, and [Medium shot]/[Wide]/[Close-up]/[dolly in]/[pan]/etc. cues embedded inside a single prompt. A single clip already carries multiple shots (up to ~5 CUEs), so MOST ideas fit into ONE clip with several shots inside.

Seedance is expensive. Bias hard toward FEWER clips. Only split into 2+ clips when the narrative genuinely cannot fit inside a single ${PLANNER_MAX}-second clip. Never produce more than 5 clips.

You decide the duration of each clip:
- Each clip's "target_duration_seconds" MUST be an integer between ${PLANNER_MIN} and ${PLANNER_MAX}.
- Pick the duration based on how much action the clip actually needs — do NOT default to the same number for every clip.
- Rough pacing guide: 4–5s → 2 CUEs, 6–8s → 2–3 CUEs, 9–12s → 3–4 CUEs, 13–15s → 4–5 CUEs.
- Distribute the clip's CUE blocks so their internal time ranges sum to EXACTLY the target_duration_seconds you chose.

Formatting for readability (CRITICAL):
- Inside description_en, separate CUE blocks with a REAL line break ("\\n\\n"), never inline them into a single paragraph.
- When a CUE contains a Portuguese spoken line, place it on its OWN line inside that CUE, prefixed with 'Portuguese spoken dialogue: "…"' and terminated with a line break — the quotes stay verbatim.
- Keep sentences short. Prefer newlines over long comma-separated runs.

Portuguese speech + phonetic spelling (CRITICAL for correct pronunciation):
- Decide autonomously whether each clip has a spoken line. Purely visual clips (product shot, ambient scene, transformation, abstract concept) can have ZERO dialogue.
- When a clip DOES have a spoken PT-BR line, write it inside quotes on its own line inside the CUE where it occurs. Inside those quotes ONLY, rewrite brand or proper names using their Brazilian-Portuguese phonetic spelling so a TTS engine pronounces them correctly (examples: SmartVety → "SmartVéti", Nike → "Náiki", Google → "Gugou", Google Ads → "Gugou Édis").
- NEVER change the brand's written spelling anywhere else in the description — visual/on-screen text, product labels, logos and CUE directions keep the original spelling. The phonetic rewrite lives ONLY inside the quoted spoken line.
- Always ALSO copy the exact quoted spoken line(s) verbatim (already phonetic) into "mascot_speech_pt", joining multiple lines with "\\n" in the order they appear. Leave "mascot_speech_pt" as "" only when the clip is fully silent/visual.
- Speech pacing target ~2.5 Portuguese words per second per CUE.

Rules:
- Return ONLY a valid JSON object with this exact shape (no code fences, no prose, no trailing commas):
{
  "suggested_clip_count": integer 1 to 5,
  "reasoning": "one sentence in Brazilian Portuguese explaining why this many clips and this pacing.",
  "clips": [
    {
      "title_pt": "short Portuguese label, 3–6 words",
      "description_en": "the full multi-shot prompt in English with CUE 0–Xs blocks separated by real line breaks, [shot type] + [cut to] markers, ready to send to Seedance verbatim",
      "target_duration_seconds": integer between ${PLANNER_MIN} and ${PLANNER_MAX},
      "mascot_speech_pt": "PT-BR line(s) spoken on-camera (join multiple lines with \\n), or empty string if the clip is purely visual"
    }
  ]
}
- "clips" length MUST equal "suggested_clip_count".
- Brand colors apply ONLY to graphic overlays, logos, and typography — never tint real objects, skin, or environments.
- No forbidden wording anywhere: never write "real person", "real human", "real face", "actual person", "pessoa real". Use "the character" / "the presenter".`;


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

function clampDuration(target: number): number {
  const n = Math.round(Number(target));
  if (!Number.isFinite(n)) return 8;
  return Math.max(PLANNER_MIN, Math.min(PLANNER_MAX, n));
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

    const ctx: string[] = [];
    ctx.push(`Idea (Portuguese OK, translate to English in each clip's description_en):\n${body.idea.trim()}`);
    ctx.push(`Aspect ratio: ${body.ratio ?? "9:16"}.`);
    ctx.push(`Allowed clip duration range: ${PLANNER_MIN}–${PLANNER_MAX} seconds. YOU pick the right duration per clip based on the idea.`);
    if (body.clientNiche) ctx.push(`Client niche: ${body.clientNiche}.`);
    if (body.brandColors?.length) ctx.push(`Brand colors (graphic overlays only): ${body.brandColors.join(", ")}.`);
    ctx.push(`Return the JSON object. Remember: prefer 1 clip; only split when truly necessary; write mascot_speech_pt ONLY when the idea calls for a character speaking on-camera.`);

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
      return new Response(
        JSON.stringify({
          success: true,
          fallback: true,
          suggested_clip_count: 1,
          reasoning: "Não consegui analisar a ideia com precisão — sugerindo 1 clipe único como padrão seguro.",
          clips: [{
            title_pt: "Clipe único",
            description_en: body.idea.trim(),
            target_duration_seconds: 8,
            mascot_speech_pt: "",
          }],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Server clamps duration to the planner range; leaves AI's per-clip choice intact otherwise.
    const cappedCount = Math.max(1, Math.min(5, Math.floor(parsed.suggested_clip_count)));
    const clips: Clip[] = parsed.clips.slice(0, cappedCount).map((c, i) => ({
      title_pt: (c?.title_pt || `Clipe ${i + 1}`).toString().slice(0, 80),
      description_en: formatSeedanceScript((c?.description_en || body.idea.trim()).toString()),
      target_duration_seconds: clampDuration(Number(c?.target_duration_seconds)),
      mascot_speech_pt: typeof c?.mascot_speech_pt === "string" ? c.mascot_speech_pt.trim() : "",
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
