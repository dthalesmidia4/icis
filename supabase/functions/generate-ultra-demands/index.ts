// Generate Ultra demands for a period plan.
// Split from the legacy generate-period-plans function. This function is the
// creative counterpart of `generate-normal-demands`:
//   - reads default_plan from the DB to build an ANTI-REPETITION block
//   - uses medium reasoning + a dedicated Ultra-only prompt
//   - always requests the extended JSON fields
//     (conceito_ultra, por_que_e_ultra, evidencias_usadas, anti_repeticao)
//
// Request body:  { periodPlanId, tenantId, customQuantity? }
// Response:     { success, planType:'ultra', plan, summary }

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPlanningContext, summarizeDefaultPlanForUltra } from "../_shared/planning-context.ts";
import { requireTenantAndPlanAccess } from "../_shared/require-tenant-auth.ts";

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
    const customQuantity: number = typeof body.customQuantity === "number" && body.customQuantity > 0
      ? Math.min(10, Math.floor(body.customQuantity))
      : 3;

    console.log("=== GENERATE-ULTRA-DEMANDS START ===", { periodPlanId, tenantId });

    if (!periodPlanId || !tenantId) throw new Error("periodPlanId e tenantId são obrigatórios");

    const auth = await requireTenantAndPlanAccess(req, tenantId, periodPlanId);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    supabase = auth.admin;

    const ctx = await buildPlanningContext(supabase, periodPlanId, tenantId);
    const { company, periodPlan, contextText } = ctx;

    // Load system prompts (advanced_planning_prompt reforça criatividade)
    const [demandasRes, planRes, advancedRes] = await Promise.all([
      supabase.from("system_prompts").select("prompt_content").eq("tenant_id", tenantId).eq("prompt_key", "generate_demandas_prompt").maybeSingle(),
      supabase.from("system_prompts").select("prompt_content").eq("tenant_id", tenantId).eq("prompt_key", "generate_plan_prompt").maybeSingle(),
      supabase.from("system_prompts").select("prompt_content").eq("tenant_id", tenantId).eq("prompt_key", "advanced_planning_prompt").maybeSingle(),
    ]);
    const demandasPrompt = (demandasRes.data as any)?.prompt_content;
    if (!demandasPrompt) throw new Error("Prompt de demandas não configurado. Acesse /dev/prompts.");
    const planPrompt = (planRes.data as any)?.prompt_content?.trim() || "";
    const advancedPrompt = (advancedRes.data as any)?.prompt_content?.trim() || "";

    // Anti-repetition block from the CURRENT default_plan saved in DB
    const defaultPlanArr = Array.isArray(periodPlan.default_plan) ? periodPlan.default_plan as any[] : [];
    if (defaultPlanArr.length === 0 && body.allowWithoutNormal !== true) {
      console.warn("[ultra] default_plan vazio — bloqueando geração para preservar anti-repetição");
      return new Response(JSON.stringify({
        success: false,
        code: "missing_default_plan",
        error: "Gere primeiro as Demandas Normais para que as Demandas Ultra possam evitar repetição e criar ideias mais fortes.",
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const antiRepetitionBlock = summarizeDefaultPlanForUltra(defaultPlanArr);

    const ultraDefinition = `# DEFINIÇÃO DE DEMANDA ULTRA (LEIA COM ATENÇÃO)
Demanda Ultra é uma demanda de maior impacto criativo e estratégico. Ela precisa ter PELO MENOS UMA destas características:
- ângulo incomum, mas coerente com posicionamento;
- conceito de campanha ou narrativa forte;
- formato mais memorável;
- uso inteligente de dor, objeção, oportunidade, bastidor ou tendência;
- potencial claro de diferenciação vs concorrentes;
- ideia que um concorrente genérico dificilmente faria;
- execução viável para a equipe e o budget informado.

Demanda Ultra NÃO PODE ser:
- uma demanda normal com título mais chamativo;
- uma demanda normal com texto mais emocional;
- uma demanda normal com CTA mais forte;
- uma ideia inviável, cara ou fora do budget;
- uma ideia fora do posicionamento da marca;
- repetição (tema, gancho, estrutura, narrativa, promessa ou ângulo) de qualquer item do PLANO NORMAL abaixo.`;

    const antiRepetitionSection = `# NÃO REPETIR / CONTRASTAR COM O PLANO NORMAL
Estas são as demandas NORMAIS já geradas para este mesmo período. Sua Ultra DEVE contrastar com elas em tema, gancho, estrutura, narrativa, promessa e ângulo. Se uma ideia sua for uma variação disfarçada de qualquer item abaixo, DESCARTE e proponha outra.

${antiRepetitionBlock}`;

    const brand = truncate(company.fantasy_name || company.name, 80);

    const PROMPT_LIMIT = 8000;
    const safeTruncate = (label: string, content: string, limit = PROMPT_LIMIT) => {
      if (!content) return "";
      if (content.length <= limit) return content;
      console.warn(`[ultra] Prompt customizado "${label}" foi truncado de ${content.length} para ${limit} caracteres.`);
      return truncate(content, limit);
    };

    const promptSections: string[] = [];
    if (planPrompt) promptSections.push(`# DIRETRIZES GERAIS DE PLANO DE MARKETING\n${safeTruncate("generate_plan_prompt", planPrompt)}`);
    promptSections.push(ultraDefinition);
    if (advancedPrompt) promptSections.push(`# REGRAS DE PLANEJAMENTO AVANÇADO\n${safeTruncate("advanced_planning_prompt", advancedPrompt)}`);
    promptSections.push(`# REGRAS TÁTICAS DE GERAÇÃO (aplicam-se também à Ultra)\n${safeTruncate("generate_demandas_prompt", demandasPrompt)}`);
    promptSections.push(antiRepetitionSection);

    const systemPrompt = promptSections.join("\n\n---\n\n");

    const jsonInstruction = `\n\nResponda APENAS JSON válido, sem markdown. Canal OBRIGATÓRIO em toda demanda: "${periodPlan.priority_channel}".
Gere EXATAMENTE ${customQuantity} demandas ULTRA. Cada uma DEVE atender à Definição de Demanda Ultra acima e DEVE contrastar com o Plano Normal.

REGRA CRÍTICA DE EVIDÊNCIA: em "evidencias_usadas", cite quais partes da Estratégia, Anamnese ou Diretrizes justificam a ideia (ex.: "estratégia: posicionamento premium", "anamnese: Q12 dor de tempo", "diretrizes: pilar 'bastidores'"). Ideias sem evidência devem ser descartadas.

Cada item DEVE ter EXATAMENTE este formato:
{
  "tipo": "Post Estático | Vídeos Curtos | Carrossel",
  "type_key": "criativo_estatico|carrossel|video_captado|video_gerado|null",
  "titulo": "<título criativo curto, SEM nome da marca>",
  "objetivo": "...",
  "conteudo": "conteúdo em markdown",
  "instrucoes_de_producao": "...",
  "legenda": "sugestão de legenda pronta para publicar",
  "cta_recomendado": "...",
  "canal": "${periodPlan.priority_channel}",
  "data_sugerida": "YYYY-MM-DD",
  "conceito_ultra": "qual é a ideia central criativa",
  "por_que_e_ultra": "por que essa ideia é mais forte que uma demanda normal (cite o critério da Definição de Demanda Ultra atendido)",
  "evidencias_usadas": ["estratégia: ...", "anamnese: ...", "diretrizes: ..."],
  "anti_repeticao": "explique como esta ideia difere de todos os itens do Plano Normal listados"
}

REGRA de type_key: "criativo_estatico" (post/story estático), "carrossel" (múltiplos slides), "video_captado" (exige gravação real), "video_gerado" (100% IA/motion/stock), null se incerto. NUNCA use tipos compostos.
REGRA de TÍTULO: PROIBIDO incluir o nome da empresa/marca ("${brand}"), abreviações ou variações no título. O nome do cliente já aparece em um badge acima do título no card — repeti-lo cria duplicidade visual. O "titulo" deve ser APENAS o gancho criativo do conteúdo, sem prefixos como "${brand} –", "${brand} -" ou "${brand}:".

Formato final: {"plan":[...${customQuantity} itens...],"summary":"resumo do racional Ultra"}`;

    // OpenAI key
    const { data: apiKeyRes, error: apiKeyErr } = await supabase.from("api_keys").select("key_value").eq("key_name", "OPENAI_API_KEY").single();
    if (apiKeyErr || !apiKeyRes) throw new Error("OPENAI_API_KEY não configurada");
    const apiKey = (apiKeyRes as any).key_value;

    const timeoutMs = 130000;
    const maxTokens = 14000;

    let parsed: any = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const attemptTokens = Math.min(18000, Math.round(maxTokens * (1 + 0.4 * (attempt - 1))));
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
            reasoning_effort: "medium",
            max_completion_tokens: attemptTokens,
            response_format: { type: "json_object" },
          }),
          signal: abort.signal,
        });
      } catch (e: any) {
        clearTimeout(timer);
        lastErr = e?.name === "AbortError" ? `timeout ${timeoutMs}ms` : (e?.message || "fetch error");
        console.error(`[ultra ${attempt}/3] ${lastErr}`);
        if (attempt === 3) break;
        continue;
      }
      clearTimeout(timer);
      const responseText = await response.text();
      if (!response.ok) {
        lastErr = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
        console.error(`[ultra ${attempt}/3] ${lastErr}`);
        if (response.status === 401) break;
        continue;
      }
      let aiResp: any;
      try { aiResp = JSON.parse(responseText); } catch { lastErr = "invalid envelope"; continue; }
      const content = extractContent(aiResp);
      const finishReason = aiResp.choices?.[0]?.finish_reason;
      console.log(`[ultra ${attempt}/3] finish=${finishReason} len=${content?.length || 0}`);
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
      console.error(`[ultra] all attempts failed: ${lastErr}`);
      return new Response(JSON.stringify({
        success: false, partial: true, planType: "ultra", plan: [],
        error: `IA não retornou conteúdo Ultra após 3 tentativas (${lastErr}).`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const priorityChannel = periodPlan.priority_channel;
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

    const ultraDemands = (parsed.plan || []).map((d: any) => {
      const tipo = d.tipo || d.demand_type || "";
      const type_key = coerceKey(d.type_key) ?? normalizeKey(tipo);
      // preserve extended fields verbatim
      return {
        ...d,
        canal: priorityChannel,
        tipo,
        type_key,
        conceito_ultra: d.conceito_ultra ?? "",
        por_que_e_ultra: d.por_que_e_ultra ?? "",
        evidencias_usadas: Array.isArray(d.evidencias_usadas) ? d.evidencias_usadas : [],
        anti_repeticao: d.anti_repeticao ?? "",
      };
    });
    const summary = parsed.summary || "";

    // Persist — never touch default_plan; recompute final_plan
    const existingDefault = Array.isArray(periodPlan.default_plan) ? periodPlan.default_plan as any[] : [];
    const saveData: any = {
      updated_at: new Date().toISOString(),
      ultra_plan: ultraDemands,
      final_plan: [...existingDefault, ...ultraDemands],
      status: "generated",
    };
    const { error: saveErr } = await (supabase as any).from("period_plans").update(saveData).eq("id", periodPlanId);
    if (saveErr) console.error("SAVE FAILED:", JSON.stringify(saveErr));

    if (ultraDemands.length > 0) {
      const fps = ultraDemands.map((d: any) => ({
        tenant_id: tenantId, client_id: periodPlan.company_id, period_plan_id: periodPlanId,
        title: (d.titulo || d.title || "Sem título").substring(0, 200),
        demand_type: d.tipo || "",
        channel: d.canal || priorityChannel, fingerprint: "",
      }));
      try { await (supabase as any).from("demand_fingerprints").insert(fps); } catch (e) { console.error("fp err", e); }
    }

    console.log("=== GENERATE-ULTRA-DEMANDS OK ===", ultraDemands.length);
    return new Response(JSON.stringify({
      success: true, planType: "ultra", plan: ultraDemands, summary,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("=== GENERATE-ULTRA-DEMANDS ERROR ===", error);
    if (periodPlanId && supabase) {
      try { await (supabase as any).from("period_plans").update({ status: "draft" }).eq("id", periodPlanId); } catch {}
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
