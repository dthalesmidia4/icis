// Generate Normal (default) demands for a period plan.
// Split from the legacy generate-period-plans function so the "normal" and
// "ultra" flows can evolve independently. This function focuses on consistent,
// executable, operational demands aligned to the production line and strategy.
//
// Request body:
//   { periodPlanId, tenantId, customQuantity?, batchType?, batchQuantity?, isFinalBatch? }
// Response mirrors the legacy shape so existing callers keep working:
//   { success, planType:'default', plan, mergedDefaultPlan, summary, batchType, isFinalBatch }

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPlanningContext } from "../_shared/planning-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const truncate = (v: unknown, n: number) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return !s ? "" : s.length <= n ? s : `${s.slice(0, n - 1).trim()}…`;
};

const extractContent = (aiResp: any) => {
  const raw = aiResp?.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw.map((p: any) => typeof p === "string" ? p : p?.text || "").join("").trim();
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let periodPlanId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const body = await req.json();
    periodPlanId = body.periodPlanId;
    const tenantId = body.tenantId;
    const customQuantity: number | undefined = typeof body.customQuantity === "number" && body.customQuantity > 0
      ? Math.min(50, Math.floor(body.customQuantity)) : undefined;
    const batchType: string | undefined = typeof body.batchType === "string" && body.batchType.trim() ? body.batchType.trim() : undefined;
    const batchQuantity: number | undefined = typeof body.batchQuantity === "number" && body.batchQuantity > 0
      ? Math.min(20, Math.floor(body.batchQuantity)) : undefined;
    const isFinalBatch: boolean = body.isFinalBatch === true;

    console.log("=== GENERATE-NORMAL-DEMANDS START ===", { periodPlanId, batchType: batchType || "(full)", batchQuantity });

    if (!periodPlanId || !tenantId) throw new Error("periodPlanId e tenantId são obrigatórios");

    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const ctx = await buildPlanningContext(supabase, periodPlanId, tenantId);
    const { company, periodPlan, contextText } = ctx;

    // Load system prompts
    const [demandasRes, planRes] = await Promise.all([
      supabase.from("system_prompts").select("prompt_content").eq("tenant_id", tenantId).eq("prompt_key", "generate_demandas_prompt").maybeSingle(),
      supabase.from("system_prompts").select("prompt_content").eq("tenant_id", tenantId).eq("prompt_key", "generate_plan_prompt").maybeSingle(),
    ]);
    const demandasPrompt = (demandasRes.data as any)?.prompt_content;
    if (!demandasPrompt) throw new Error("Prompt de demandas não configurado. Acesse /dev/prompts.");
    const planPrompt = (planRes.data as any)?.prompt_content?.trim() || "";

    // Production line
    const baseLine = [
      { type: "Post Estático", ratio: 4 },
      { type: "Vídeos Curtos", ratio: 2 },
      { type: "Carrossel", ratio: 4 },
    ];
    const targetTotal = customQuantity ?? 10;
    let fixedProductionLine: { type: string; quantity: number }[];
    if (targetTotal === 10) {
      fixedProductionLine = baseLine.map(b => ({ type: b.type, quantity: b.ratio }));
    } else {
      const raw = baseLine.map(b => ({ type: b.type, quantity: Math.max(1, Math.round((b.ratio / 10) * targetTotal)) }));
      let diff = targetTotal - raw.reduce((s, r) => s + r.quantity, 0);
      while (diff !== 0) {
        const idx = diff > 0
          ? raw.indexOf(raw.reduce((a, b) => (a.quantity >= b.quantity ? a : b)))
          : raw.indexOf(raw.reduce((a, b) => (a.quantity <= b.quantity ? a : b)));
        raw[idx].quantity += diff > 0 ? 1 : -1;
        if (raw[idx].quantity < 1) raw[idx].quantity = 1;
        diff = targetTotal - raw.reduce((s, r) => s + r.quantity, 0);
        if (raw.every(r => r.quantity <= 1) && diff < 0) break;
      }
      fixedProductionLine = raw;
    }

    let volumeInstruction = "";
    let demandLimit: number;
    if (batchType && batchQuantity) {
      demandLimit = batchQuantity;
      volumeInstruction = `\nREGRA OBRIGATÓRIA DE VOLUME (LOTE ÚNICO): Gere exatamente ${batchQuantity} demandas, TODAS do tipo "${batchType}". O campo "tipo" DEVE ser exatamente "${batchType}".`;
    } else {
      demandLimit = fixedProductionLine.reduce((s, r) => s + r.quantity, 0);
      const distribution = fixedProductionLine.map(item => `${item.quantity} ${item.type}`).join(", ");
      volumeInstruction = `\nREGRA OBRIGATÓRIA DE VOLUME: Gere exatamente: ${distribution}. Total: ${demandLimit}.`;
    }

    const normalDefinition = `# DEFINIÇÃO DE DEMANDA NORMAL
Demanda Normal é uma demanda estratégica, consistente, executável e alinhada ao planejamento do período. Serve para manter presença, educação, autoridade, relacionamento, posicionamento ou conversão quando permitido. Deve ser bem feita, mas NÃO precisa ser uma campanha especial ou uma ideia de alto impacto.
Regras: obedecer linha de produção; obedecer canal prioritário; obedecer restrições; evitar repetição; ser clara para a equipe produzir; preservar tom de voz e estratégia definidos nas Diretrizes; não exagerar criatividade se isso fugir do planejamento.`;

    const promptSections: string[] = [];
    if (planPrompt) promptSections.push(`# DIRETRIZES GERAIS DE PLANO DE MARKETING\n${truncate(planPrompt, 2200)}`);
    promptSections.push(normalDefinition);
    promptSections.push(`# REGRAS TÁTICAS DE GERAÇÃO DE DEMANDAS\n${truncate(demandasPrompt, 2500)}`);

    const brand = truncate(company.fantasy_name || company.name, 80);
    const jsonInstruction = `\n\nResponda APENAS JSON válido, sem markdown. Canal: "${periodPlan.priority_channel}". Plano NORMAL.
IMPORTANTE: Gere exatamente ${demandLimit} demandas.${volumeInstruction}

REGRA CRÍTICA DE DIVERSIDADE: cada demanda com tema/ângulo ÚNICO; nunca repita tema, conceito, gancho ou abordagem. Varie: educativo, storytelling, bastidores, depoimento, tendência, humor, dados, antes/depois, tutorial.

Cada demanda: {"tipo":"...","type_key":"criativo_estatico|carrossel|video_captado|video_gerado|null","titulo":"${brand} – <título>","objetivo":"...","conteudo":"...","instrucoes_de_producao":"...","cta_recomendado":"...","canal":"${periodPlan.priority_channel}","data_sugerida":"YYYY-MM-DD"}

type_key: "criativo_estatico" post/imagem/story estático; "carrossel" carrossel; "video_captado" exige gravação real; "video_gerado" 100% IA/motion/stock; null se incerto. NUNCA compor tipos ("Post + Stories" → null).

TÍTULO: DEVE começar com "${brand} – " (nome, espaço, en-dash "–", espaço) seguido do título criativo. Nunca omita a marca. Nunca use "-" simples.

Formato: {"plan":[...],"summary":"resumo curto do racional"}`;

    const systemPrompt = promptSections.join("\n\n---\n\n");

    // OpenAI key
    const { data: apiKeyRes, error: apiKeyErr } = await supabase.from("api_keys").select("key_value").eq("key_name", "OPENAI_API_KEY").single();
    if (apiKeyErr || !apiKeyRes) throw new Error("OPENAI_API_KEY não configurada");
    const apiKey = (apiKeyRes as any).key_value;

    const isBatch = !!(batchType && batchQuantity);
    const timeoutMs = isBatch ? 80000 : 110000;
    const maxTokens = isBatch ? Math.min(8000, batchQuantity! * 1200 + 3500) : 12000;

    let parsed: any = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const attemptTokens = Math.min(16000, Math.round(maxTokens * (1 + 0.5 * (attempt - 1))));
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-5-mini",
            messages: [
              { role: "developer", content: systemPrompt + jsonInstruction },
              { role: "user", content: contextText },
            ],
            reasoning_effort: "low",
            max_completion_tokens: attemptTokens,
            response_format: { type: "json_object" },
          }),
          signal: abort.signal,
        });
      } catch (e: any) {
        clearTimeout(timer);
        lastErr = e?.name === "AbortError" ? `timeout ${timeoutMs}ms` : (e?.message || "fetch error");
        console.error(`[normal ${attempt}/3] ${lastErr}`);
        if (attempt === 3) break;
        continue;
      }
      clearTimeout(timer);
      const responseText = await response.text();
      if (!response.ok) {
        lastErr = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
        console.error(`[normal ${attempt}/3] ${lastErr}`);
        if (response.status === 401) break;
        continue;
      }
      let aiResp: any;
      try { aiResp = JSON.parse(responseText); } catch { lastErr = "invalid envelope"; continue; }
      const content = extractContent(aiResp);
      const finishReason = aiResp.choices?.[0]?.finish_reason;
      console.log(`[normal ${attempt}/3] finish=${finishReason} len=${content?.length || 0}`);
      if (!content) { lastErr = `empty (${finishReason})`; continue; }
      try {
        let clean = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const m = clean.match(/\{[\s\S]*"plan"[\s\S]*\}/);
        if (m) clean = m[0];
        parsed = JSON.parse(clean);
        break;
      } catch (e: any) { lastErr = `parse: ${e?.message}`; if (attempt === 3) break; }
    }

    if (!parsed) {
      console.error(`[normal] all attempts failed: ${lastErr}`);
      return new Response(JSON.stringify({
        success: false, partial: true, planType: "default", batchType: batchType || null,
        batchQuantity: batchQuantity || null, isFinalBatch, plan: [],
        error: `IA não retornou conteúdo após 3 tentativas (${lastErr}).`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const priorityChannel = periodPlan.priority_channel;
    const BATCH_TO_KEY: Record<string, string | null> = {
      "Post Estático": "criativo_estatico",
      "Post estático": "criativo_estatico",
      "Carrossel": "carrossel",
      "Vídeos Curtos": null,
    };
    const OFFICIAL = new Set(["criativo_estatico", "carrossel", "video_captado", "video_gerado"]);
    const coerceKey = (v: any) => typeof v === "string" && OFFICIAL.has(v.trim()) ? v.trim() : null;
    const normalizeKey = (text: any) => {
      if (!text || typeof text !== "string") return null;
      const l = text.trim().toLowerCase();
      if (!l || l.includes("+")) return null;
      if (l.includes("carrossel") || l.includes("carousel")) return "carrossel";
      if (l.includes("captad")) return "video_captado";
      if ((l.includes("gerad") || l.includes("gerar")) && (l.includes("vídeo") || l.includes("video"))) return "video_gerado";
      if (/(\bv[ií]deo\b|\breels?\b|\btiktok\b|v[ií]deos?\s+curtos)/.test(l)) return null;
      if (/(est[aá]t|\bpost\b|stor(y|ies))/.test(l)) return "criativo_estatico";
      return null;
    };

    const planDemands = (parsed.plan || []).map((d: any) => {
      const tipo = batchType ? batchType : (d.tipo || d.demand_type || "");
      const forcedKey = batchType && Object.prototype.hasOwnProperty.call(BATCH_TO_KEY, batchType) ? BATCH_TO_KEY[batchType] : null;
      const type_key = forcedKey ?? coerceKey(d.type_key) ?? normalizeKey(tipo);
      return { ...d, canal: priorityChannel, tipo, type_key };
    });
    const summary = parsed.summary || "";

    // Persist
    const existingDefault = Array.isArray(periodPlan.default_plan) ? periodPlan.default_plan as any[] : [];
    const mergedDefault = isBatch ? [...existingDefault, ...planDemands] : planDemands;

    const saveData: any = {
      updated_at: new Date().toISOString(),
      default_plan: mergedDefault,
      status: (Array.isArray(periodPlan.ultra_plan) && periodPlan.ultra_plan.length > 0) ? "generated" : "draft",
      normal_summary: summary || (periodPlan as any).normal_summary || "",
    };
    const { error: saveErr } = await (supabase as any).from("period_plans").update(saveData).eq("id", periodPlanId);
    if (saveErr) console.error("SAVE FAILED:", JSON.stringify(saveErr));

    if (planDemands.length > 0) {
      const fps = planDemands.map((d: any) => ({
        tenant_id: tenantId, client_id: periodPlan.company_id, period_plan_id: periodPlanId,
        title: (d.titulo || d.title || "Sem título").substring(0, 200),
        demand_type: d.tipo || d.demand_type || "",
        channel: d.canal || priorityChannel, fingerprint: "",
      }));
      try { await (supabase as any).from("demand_fingerprints").insert(fps); } catch (e) { console.error("fp err", e); }
    }

    console.log("=== GENERATE-NORMAL-DEMANDS OK ===", planDemands.length);
    return new Response(JSON.stringify({
      success: true, planType: "default", batchType: batchType || null, isFinalBatch,
      plan: planDemands, mergedDefaultPlan: mergedDefault, summary,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("=== GENERATE-NORMAL-DEMANDS ERROR ===", error);
    if (periodPlanId && supabase) {
      try { await (supabase as any).from("period_plans").update({ status: "draft" }).eq("id", periodPlanId); } catch {}
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
