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
import {
  researchUltraTrends,
  formatResearchForPrompt,
  type UltraResearchResult,
} from "../_shared/ultra-trend-research.ts";

const RESEARCH_TTL_MS = 24 * 60 * 60 * 1000;

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
- homenagem genérica de data comemorativa ("Feliz Dia dos Pais, uma homenagem a todos os pais" e afins);
- repetição (tema, gancho, estrutura, narrativa, promessa ou ângulo) de qualquer item do PLANO NORMAL abaixo.

# USO DO CALENDÁRIO NA ULTRA
- Datas de ALTA prioridade (na seção "DATAS E OPORTUNIDADES DO PERÍODO") são oportunidade criativa, não obrigação.
- Se usar uma data forte, transforme-a em ideia própria do cliente: conceito de campanha, narrativa emocional específica, ângulo incomum, bastidor estratégico, manifesto curto, conteúdo assinatura, contraponto ao óbvio.
- PROIBIDO Ultra genérica de data (ex.: "post de homenagem", "carrossel com fotos de pais", "vídeo emocional sobre o amor de pai").
- Datas IGNORADAS não podem virar Ultra.

# PROCESSO CRIATIVO INTERNO OBRIGATÓRIO (executar em silêncio antes do JSON)
Para CADA Ultra, siga estas 4 etapas antes de escrever o item final:
1) IDEIA BRUTA: liste mentalmente 3 ângulos possíveis a partir da estratégia + anamnese + período.
2) CORTE DE GENERICIDADE: elimine ângulos que serviriam para qualquer cliente do mesmo segmento, que dependem de frase pronta, ou que só existem por causa de data comemorativa sem ângulo próprio.
3) ESCOLHA DO CONCEITO: escolha o ângulo mais específico para: estratégia deste cliente, anamnese (Q&A), público, momento do período, budget e canal prioritário.
4) TRANSFORME EM DEMANDA: só então monte o JSON.

# FILTRO ANTI-GENERICIDADE (auto-validação antes de incluir cada Ultra)
Antes de aceitar uma Ultra, responda internamente:
- Essa ideia poderia ser usada por qualquer cliente do mesmo segmento? Se sim, DESCARTE.
- O título parece frase pronta? Se sim, reescreva ou DESCARTE.
- A peça depende de uma data genérica sem ângulo próprio? Se sim, DESCARTE.
- O conceito está ligado a uma evidência REAL da estratégia/anamnese? Se não, DESCARTE.
- Existe diferença clara em relação às demandas normais listadas abaixo? Se não, DESCARTE.
- Existe motivo REAL para essa ideia ser Ultra (não só uma normal maquiada)? Se não, DESCARTE.
Se qualquer resposta for ruim, gere outra ideia — não entregue.`;

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

    // === OpenAI key (needed for research + generation) ===
    const { data: apiKeyRes, error: apiKeyErr } = await supabase.from("api_keys").select("key_value").eq("key_name", "OPENAI_API_KEY").single();
    if (apiKeyErr || !apiKeyRes) throw new Error("OPENAI_API_KEY não configurada");
    const apiKey = (apiKeyRes as any).key_value as string;

    // === Ultra trend research (with 24h cache in form_draft.ultra_research) ===
    const formDraft: Record<string, any> = (periodPlan.form_draft && typeof periodPlan.form_draft === "object")
      ? { ...(periodPlan.form_draft as Record<string, any>) }
      : {};
    const cached = formDraft.ultra_research as UltraResearchResult | undefined;
    const cachedFresh = cached?.generated_at
      && (Date.now() - new Date(cached.generated_at).getTime()) < RESEARCH_TTL_MS;
    const refreshResearch = body.refreshResearch === true;

    let research: UltraResearchResult;
    if (cached && cachedFresh && !refreshResearch) {
      console.log(`[ultra] reusing cached research (mode=${cached.research_mode}, trends=${cached.relevant_trends?.length || 0})`);
      research = cached;
    } else {
      // Top calendar events (rank kept high by adaptive layer)
      const highDates = Array.isArray(ctx.adaptive?.calendar_events)
        ? (ctx.adaptive.calendar_events as any[])
            .filter((e: any) => (Number(e.priority) || 0) >= 70)
            .slice(0, 4)
            .map((e: any) => ({ date: String(e.date), name: String(e.name || "") }))
        : [];
      // Anamnese snippets from question_session answers
      const anamneseSnippets: string[] = [];
      if (ctx.questionSession) {
        const answers = ((ctx.questionSession as any).answers || {}) as Record<string, any>;
        for (const [k, v] of Object.entries(answers)) {
          const s = String(v || "").trim();
          if (s && s.length > 40) anamneseSnippets.push(s);
          if (anamneseSnippets.length >= 4) break;
        }
      }
      research = await researchUltraTrends({
        openaiApiKey: apiKey,
        company,
        periodPlan,
        strategySnippet: ctx.strategyText?.slice(0, 800) || "",
        topAnamneseSnippets: anamneseSnippets,
        highPriorityDates: highDates,
      });
      console.log(`[ultra] research mode=${research.research_mode} trends=${research.relevant_trends.length}${research.error ? ` err=${research.error}` : ""}`);

      // MERGE-safe cache write — never clobber existing form_draft keys
      formDraft.ultra_research = research;
      try {
        await (supabase as any).from("period_plans")
          .update({ form_draft: formDraft })
          .eq("id", periodPlanId);
      } catch (e) {
        console.warn("[ultra] failed to persist research cache:", e);
      }
    }

    // Inject research section into system prompt (before anti-repetition already pushed)
    promptSections.push(formatResearchForPrompt(research));

    const systemPrompt = promptSections.join("\n\n---\n\n");

    const jsonInstruction = `\n\nResponda APENAS JSON válido, sem markdown. Canal OBRIGATÓRIO em toda demanda: "${periodPlan.priority_channel}".
Gere EXATAMENTE ${customQuantity} demandas ULTRA. Cada uma DEVE atender à Definição de Demanda Ultra acima, passar pelo FILTRO ANTI-GENERICIDADE e contrastar com o Plano Normal. Antes de escrever cada item, execute mentalmente as 4 etapas do PROCESSO CRIATIVO INTERNO.

REGRAS DE PREENCHIMENTO DOS CAMPOS EXTRAS (rejeite genericidade):
- "conceito_ultra": explique a IDEIA criativa central de forma específica para ESTE cliente. PROIBIDO frases vagas ("campanha emocional de Dia dos Pais", "post institucional forte"). Deve descrever o ângulo, a promessa e o porquê é específico.
- "por_que_e_ultra": explique por que essa ideia SUPERA uma demanda normal, citando qual critério da Definição de Demanda Ultra ela atende (ex.: "ângulo incomum + bastidor estratégico").
- "evidencias_usadas": array com evidências CONCRETAS e nomeadas. PROIBIDO valores genéricos como ["estratégia", "anamnese"]. Use itens como: "Planejamento: período focado em relacionamento", "Anamnese Q12: dor de tempo do público", "Diretriz: pilar 'bastidores'", "Estratégia: posicionamento acolhedor".
- "anti_repeticao": compare EXPLICITAMENTE com o Plano Normal listado abaixo. Diga em 1-2 frases o que esta Ultra faz que nenhum item normal faz (tema, gancho, estrutura, narrativa ou promessa).
- "tendencia_usada": nome curto da tendência da seção "TENDÊNCIAS E OPORTUNIDADES DO NICHO" que inspirou esta Ultra. Use "" se nenhuma tendência do bloco foi realmente usada — não invente.
- "insight_de_pesquisa": em 1 frase, o insight ESPECÍFICO que virou ideia (não repita o texto da tendência). PROIBIDO frase genérica como "vídeos curtos performam bem".
- "fonte_ou_contexto": tipo de fonte/contexto observado na pesquisa (ex.: "discussões recentes no nicho", "reportagens do setor 2026"). Vazio se não aplicável.
- "por_que_e_relevante_para_o_cliente": amarre a tendência a uma dor/objeção/posicionamento REAIS deste cliente. Se não conseguir amarrar, não use a tendência.

REGRA DURA sobre tendência: PROIBIDO Ultra do tipo "vídeo curto porque vídeo curto está em alta". A tendência é matéria-prima estratégica, nunca conteúdo final. Se não conseguir transformar em ideia própria do cliente ancorada em evidência real, deixe "tendencia_usada" vazio e justifique a Ultra pelo raciocínio interno.

Cada item DEVE ter EXATAMENTE este formato:
{
  "tipo": "Post Estático | Vídeos Curtos | Carrossel",
  "type_key": "criativo_estatico|carrossel|video_captado|video_gerado|null",
  "titulo": "<título criativo curto, SEM nome da marca, SEM frase pronta>",
  "objetivo": "...",
  "conteudo": "conteúdo em markdown",
  "instrucoes_de_producao": "...",
  "legenda": "sugestão de legenda pronta para publicar",
  "cta_recomendado": "...",
  "canal": "${periodPlan.priority_channel}",
  "data_sugerida": "YYYY-MM-DD",
  "conceito_ultra": "descrição específica do ângulo criativo — nada de frase genérica",
  "por_que_e_ultra": "critério da Definição de Ultra atendido + comparação com uma normal equivalente",
  "evidencias_usadas": ["Planejamento: ...", "Anamnese Q?: ...", "Diretriz: ...", "Estratégia: ..."],
  "anti_repeticao": "o que esta Ultra faz que nenhum item do Plano Normal faz — cite qual item e qual diferença",
  "tendencia_usada": "",
  "insight_de_pesquisa": "",
  "fonte_ou_contexto": "",
  "por_que_e_relevante_para_o_cliente": ""
}

REGRA de type_key: "criativo_estatico" (post/story estático), "carrossel" (múltiplos slides), "video_captado" (exige gravação real), "video_gerado" (100% IA/motion/stock), null se incerto. NUNCA use tipos compostos.
REGRA de TÍTULO: PROIBIDO incluir o nome da empresa/marca ("${brand}"), abreviações ou variações no título. O nome do cliente já aparece em um badge acima do título no card — repeti-lo cria duplicidade visual. O "titulo" deve ser APENAS o gancho criativo do conteúdo, sem prefixos como "${brand} –", "${brand} -" ou "${brand}:".
REGRA de TÍTULO — SEM PREFIXO DE TIPO: também é PROIBIDO iniciar o "titulo" com o tipo/formato ("Post Estático", "Post", "Carrossel", "Carrossel (N slides)", "Vídeo", "Video", "Vídeos Curtos", "Reels", "Story", "Stories", "Criativo estático", "Criativo", "Educação rápida", "Tutorial") seguido de "-", "–", "—", ":" ou "|". O tipo já é exibido em coluna/chip separada no card. Exemplos: RUIM: "Post Estático — beneficios do plano" · "Carrossel: crie um post cirúrgico". BOM: "Benefícios do plano em 3 pontos" · "Crie um post cirúrgico em 5 passos".

Formato final: {"plan":[...${customQuantity} itens...],"summary":"resumo do racional Ultra"}`;


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

    const stripBrandPrefix = (t: string): string => {
      if (!t) return t;
      const brandRaw = (company.fantasy_name || company.name || "").trim();
      if (!brandRaw) return t.trim();
      const esc = brandRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^\\s*${esc}\\s*[\\-\\u2013\\u2014:|]\\s*`, "i");
      return t.replace(re, "").trim();
    };

    const stripTypePrefix = (t: string): string => {
      if (!t) return t;
      const typeAlt = "Post\\s*Est[aá]tico|Post|Carrossel(?:\\s*\\(\\s*\\d+\\s*slides?\\s*\\))?|V[ií]deos?\\s*Curtos|V[ií]deo|Reels?|Stor(?:y|ies)|Criativo\\s*est[aá]tico|Criativo|Educa[cç][aã]o\\s*r[aá]pida|Tutorial";
      const re = new RegExp(`^\\s*(?:${typeAlt})\\s*[\\-\\u2013\\u2014:|]\\s*`, "i");
      let prev = t.trim();
      for (let i = 0; i < 3; i++) {
        const next = prev.replace(re, "").trim();
        if (next === prev || next.length < 3) break;
        prev = next;
      }
      return prev;
    };

    const ultraDemands = (parsed.plan || []).map((d: any) => {
      const tipo = d.tipo || d.demand_type || "";
      const type_key = coerceKey(d.type_key) ?? normalizeKey(tipo);
      const titulo = stripTypePrefix(stripBrandPrefix(String(d.titulo || d.title || "")));
      // preserve extended fields verbatim
      return {
        ...d,
        titulo,
        canal: priorityChannel,
        tipo,
        type_key,
        conceito_ultra: d.conceito_ultra ?? "",
        por_que_e_ultra: d.por_que_e_ultra ?? "",
        evidencias_usadas: Array.isArray(d.evidencias_usadas) ? d.evidencias_usadas : [],
        anti_repeticao: d.anti_repeticao ?? "",
        tendencia_usada: d.tendencia_usada ?? "",
        insight_de_pesquisa: d.insight_de_pesquisa ?? "",
        fonte_ou_contexto: d.fonte_ou_contexto ?? "",
        por_que_e_relevante_para_o_cliente: d.por_que_e_relevante_para_o_cliente ?? "",
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
      research: { mode: research.research_mode, trend_count: research.relevant_trends.length },
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
