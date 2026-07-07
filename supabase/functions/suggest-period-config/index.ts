import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OBJETIVO_OPCOES = [
  "Gerar vendas",
  "Atrair leads",
  "Lançar produto",
  "Crescer seguidores",
  "Educar o mercado",
];

const CHANNEL_IDS = ["instagram", "facebook", "tiktok", "youtube", "linkedin"];

const NAMED_ANAMNESE_KEYS = [
  "tone_of_voice",
  "content_pillars",
  "preferred_ctas",
  "forbidden_words",
  "active_channels",
  "offer_and_ticket",
  "main_competitors",
];

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const evidencias: string[] = [];
  try {
    const { companyId, tenantId, todayISO } = await req.json();
    if (!companyId || !tenantId) {
      return new Response(JSON.stringify({ error: "companyId e tenantId são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    console.log("[suggest-period-config] input", { companyId, tenantId });

    // ---------- 1) Dados do cliente ----------
    const [
      companyRes,
      strategyRes,
      questionRes,
      socialRes,
      periodsRes,
    ] = await Promise.all([
      supabase.from("tenant_companies").select("id, name, industry, target_audience, differentials, market_context, mission, vision, values, main_products").eq("id", companyId).maybeSingle(),
      supabase.from("strategies").select("strategy_text, status, updated_at").eq("company_id", companyId).eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("question_sessions").select("questions, answers, updated_at").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("client_social_accounts").select("platform, is_active, username").eq("company_id", companyId),
      supabase.from("period_plans").select("period_title, period_start, period_end, priority_channel, production_line, observations, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
    ]);

    const company = companyRes.data;
    const strategy = strategyRes.data;
    const qs = questionRes.data as any;
    const social = socialRes.data || [];
    const periods = periodsRes.data || [];

    if (company) evidencias.push(`Cliente: ${company.name || companyId}${company.industry ? ` (${company.industry})` : ""}`);
    if (strategy?.strategy_text) evidencias.push(`Estratégia ativa (${strategy.strategy_text.length} chars, atualizada ${strategy.updated_at?.slice(0, 10)})`);
    else evidencias.push("SEM estratégia registrada");

    const questions: string[] = Array.isArray(qs?.questions) ? qs.questions : [];
    const answers: Record<string, any> = qs?.answers && typeof qs.answers === "object" ? qs.answers : {};
    const numericAnswered = Object.keys(answers).filter(k => /^question_\d+$/.test(k) && String(answers[k] || "").trim()).length;
    const namedAnswered = NAMED_ANAMNESE_KEYS.filter(k => String(answers[k] || "").trim());
    if (numericAnswered > 0 || namedAnswered.length > 0) {
      evidencias.push(`Anamnese: ${numericAnswered} perguntas indexadas + ${namedAnswered.length}/${NAMED_ANAMNESE_KEYS.length} campos nomeados (${namedAnswered.join(", ") || "nenhum"})`);
    } else {
      evidencias.push("SEM anamnese preenchida");
    }

    const activeSocial = social.filter((s: any) => s.is_active).map((s: any) => s.platform);
    if (activeSocial.length) evidencias.push(`Canais conectados ativos: ${activeSocial.join(", ")}`);

    if (periods.length) evidencias.push(`Últimos ${periods.length} planejamentos analisados (mais recente: "${periods[0].period_title}" ${periods[0].period_start}→${periods[0].period_end})`);
    else evidencias.push("Primeiro planejamento do cliente (sem histórico)");

    // Contextual planning input (calendar + patterns) — janela 30d a partir de hoje
    const today = todayISO ? new Date(todayISO) : new Date();
    const start = today.toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: ctx } = await supabase.rpc("get_contextual_planning_input", {
      p_client_id: companyId,
      p_period_start: start,
      p_period_end: end,
    });
    if (ctx?.success) {
      const cal = Array.isArray(ctx.calendar_events) ? ctx.calendar_events.length : 0;
      const succ = Array.isArray(ctx.successful_patterns) ? ctx.successful_patterns.length : 0;
      const fail = Array.isArray(ctx.failed_patterns) ? ctx.failed_patterns.length : 0;
      evidencias.push(`Contexto próximos 30d: ${cal} datas comemorativas, ${succ} padrões de sucesso, ${fail} padrões problemáticos`);
    }

    // Determinar confidence
    const hasStrategy = !!strategy?.strategy_text;
    const totalAnamnese = numericAnswered + namedAnswered.length;
    let confidence: "alta" | "media" | "baixa" = "baixa";
    const alertas: string[] = [];
    if (hasStrategy && totalAnamnese >= 10) confidence = "alta";
    else if (hasStrategy || totalAnamnese >= 5) confidence = "media";
    if (!hasStrategy) alertas.push("Cliente não possui estratégia geral registrada — sugestão baseada apenas em anamnese e histórico.");
    if (totalAnamnese < 5) alertas.push("Anamnese pouco preenchida — sugestão pode ser genérica. Recomende preencher a anamnese estratégica.");
    if (!periods.length) alertas.push("Primeiro planejamento — sem histórico de cadência para calibrar quantidade.");
    if (!activeSocial.length) alertas.push("Nenhum canal social conectado — canais sugeridos baseados na anamnese/estratégia.");

    // ---------- 2) Montar contexto para IA ----------
    const anamneseBlock: string[] = [];
    if (questions.length) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const a = String(answers[`question_${i}`] || "").trim();
        if (q && a) anamneseBlock.push(`Q${i + 1}. ${q}\nR: ${truncate(a, 400)}`);
      }
    } else {
      for (const k of Object.keys(answers).filter(k => /^question_\d+$/.test(k))) {
        const a = String(answers[k] || "").trim();
        if (a) anamneseBlock.push(`${k}: ${truncate(a, 400)}`);
      }
    }

    const diretrizesBlock: string[] = [];
    for (const k of NAMED_ANAMNESE_KEYS) {
      const v = String(answers[k] || "").trim();
      if (v) diretrizesBlock.push(`- ${k}: ${truncate(v, 300)}`);
    }

    const historyBlock = periods.map((p: any, i: number) => {
      const pl = Array.isArray(p.production_line) ? p.production_line.map((x: any) => `${x.type}:${x.quantity}`).join(",") : "";
      return `#${i + 1} "${p.period_title}" ${p.period_start}→${p.period_end} canal=${p.priority_channel || "-"} mix=${pl || "-"}`;
    }).join("\n");

    const contextText = `
CLIENTE: ${company?.name || "(sem nome)"} | Setor: ${company?.industry || "-"}
PÚBLICO-ALVO: ${truncate(company?.target_audience, 300) || "-"}
DIFERENCIAIS: ${truncate(company?.differentials, 300) || "-"}
PRODUTOS PRINCIPAIS: ${truncate(company?.main_products, 300) || "-"}

CANAIS CONECTADOS ATIVOS: ${activeSocial.join(", ") || "(nenhum)"}

=== ESTRATÉGIA GERAL ===
${hasStrategy ? truncate(strategy!.strategy_text, 3500) : "(sem estratégia registrada)"}

=== DIRETRIZES ESTRATÉGICAS (campos nomeados da anamnese) ===
${diretrizesBlock.join("\n") || "(nenhum)"}

=== RESPOSTAS DA ANAMNESE ESTRATÉGICA ===
${anamneseBlock.length ? anamneseBlock.slice(0, 40).join("\n\n") : "(anamnese vazia)"}

=== HISTÓRICO DE PLANEJAMENTOS (mais recente primeiro) ===
${historyBlock || "(sem histórico)"}

=== CONTEXTO DOS PRÓXIMOS 30 DIAS ===
Datas comemorativas: ${JSON.stringify(ctx?.calendar_events?.slice?.(0, 8) || [])}
Padrões de sucesso: ${JSON.stringify(ctx?.successful_patterns?.slice?.(0, 8) || [])}
Padrões problemáticos: ${JSON.stringify(ctx?.failed_patterns?.slice?.(0, 5) || [])}
Tipos de conteúdo campeões: ${JSON.stringify(ctx?.top_demand_types?.slice?.(0, 5) || [])}
`.trim();

    // ---------- 3) Chamar IA ----------
    const { data: apiKey } = await supabase.from("api_keys").select("key_value").eq("key_name", "OPENAI_API_KEY").single();
    if (!apiKey?.key_value) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada em Dev → APIs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um estrategista sênior de marketing digital. Sua tarefa é sugerir a CONFIGURAÇÃO INICIAL de um novo período de planejamento para este cliente específico, usando SEM EXCEÇÃO os dados fornecidos (estratégia, anamnese, diretrizes, histórico e canais).

REGRAS DURAS:
- NUNCA devolva sugestões genéricas. Cada campo deve refletir explicitamente algo da estratégia OU anamnese OU histórico OU contexto do cliente.
- Se um dado não existir, deixe o campo como string vazia (nunca invente).
- period_days entre 15 e 45. Preferir 30 dias salvo se histórico mostrar cadência diferente.
- quantidade_conteudos entre 4 e 40, calibrada por: disponibilidade de vídeo/materiais informada na anamnese, cadência dos últimos períodos, canais ativos.
- selected_channels: escolher entre ${JSON.stringify(CHANNEL_IDS)} priorizando canais conectados ativos e canais mencionados em active_channels/estratégia.
- objetivos_selecionados: escolher 1 a 3 opções EXATAS entre ${JSON.stringify(OBJETIVO_OPCOES)}. Use objetivo_outro só se nenhuma opção couber.
- disponibilidade_video/tem_materiais_novos: usar 'sim'|'nao'|'talvez' baseando na anamnese. Se anamnese não diz nada, use 'talvez' para vídeo e 'nao' para materiais.
- tem_promocao/tem_data_comemorativa/tem_novidade: 'sim' apenas se houver evidência clara nos dados; caso contrário 'nao'.
- Preencher justificativa curta em cada bloco textual (porque_objetivo, produto_foco, como_comprar) com base na estratégia/anamnese — cite o motivo.
- Responder EXCLUSIVAMENTE com JSON válido no schema abaixo, sem texto extra.`;

    const jsonSchema = {
      period_title: "string (ex.: Ciclo Outubro 2026 — Vendas)",
      period_days: "number 15-45",
      selected_channels: "string[] entre instagram/facebook/tiktok/youtube/linkedin",
      objetivos_selecionados: "string[] entre as opções exatas",
      objetivo_outro: "string",
      meta_numerica: "string",
      porque_objetivo: "string",
      produto_foco: "string",
      tem_promocao: "'sim'|'nao'",
      promocao_descricao: "string",
      como_comprar: "string",
      tem_data_comemorativa: "'sim'|'nao'",
      data_comemorativa_descricao: "string",
      tem_novidade: "'sim'|'nao'",
      novidade_descricao: "string",
      disponibilidade_video: "'sim'|'nao'|'talvez'",
      tem_materiais_novos: "'sim'|'nao'",
      materiais_novos_descricao: "string",
      quantidade_conteudos: "number 4-40",
      observations: "string (dicas adicionais para o operador)",
      budget: "string (opcional)",
      justificativa_geral: "string curta (1-3 linhas explicando a lógica geral da sugestão)",
    };

    const userPrompt = `${contextText}

Devolva JSON obedecendo EXATAMENTE este schema (chaves e tipos):
${JSON.stringify(jsonSchema, null, 2)}`;

    console.log("[suggest-period-config] calling OpenAI, context length:", contextText.length);

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.key_value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2500,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("[suggest-period-config] OpenAI error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: `Erro OpenAI ${aiRes.status}`, detail: txt }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content?.trim() || "{}";
    let sugestao: any;
    try {
      sugestao = JSON.parse(raw);
    } catch (e) {
      console.error("[suggest-period-config] JSON parse fail:", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "IA devolveu JSON inválido", raw: raw.slice(0, 800) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitizar canais e objetivos
    if (Array.isArray(sugestao.selected_channels)) {
      sugestao.selected_channels = sugestao.selected_channels.map((c: string) => String(c).toLowerCase()).filter((c: string) => CHANNEL_IDS.includes(c));
    } else sugestao.selected_channels = [];
    if (Array.isArray(sugestao.objetivos_selecionados)) {
      sugestao.objetivos_selecionados = sugestao.objetivos_selecionados.filter((o: string) => OBJETIVO_OPCOES.includes(o));
    } else sugestao.objetivos_selecionados = [];

    // Calcular start/end
    const startDate = today.toISOString().slice(0, 10);
    const days = Math.max(7, Math.min(90, Number(sugestao.period_days) || 30));
    const endDate = new Date(today.getTime() + (days - 1) * 86400000).toISOString().slice(0, 10);

    const response = {
      success: true,
      confidence,
      alertas,
      evidencias_usadas: evidencias,
      justificativa_geral: sugestao.justificativa_geral || "",
      sugestao: {
        ...sugestao,
        period_days: days,
        period_start: startDate,
        period_end: endDate,
      },
    };

    console.log("[suggest-period-config] OK", { confidence, evidencias: evidencias.length });
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[suggest-period-config] fatal", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido", evidencias_usadas: evidencias }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
