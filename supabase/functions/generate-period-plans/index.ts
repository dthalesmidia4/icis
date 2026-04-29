import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  const startTime = Date.now();
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let periodPlanId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const body = await req.json();
    periodPlanId = body.periodPlanId;
    const tenantId = body.tenantId;
    const planType: 'default' | 'ultra' = body.planType || 'default';
    const customQuantity: number | undefined = typeof body.customQuantity === 'number' && body.customQuantity > 0
      ? Math.min(50, Math.floor(body.customQuantity))
      : undefined;
    // NEW: optional batch parameter to generate only a slice of the default plan.
    // Allows splitting a heavy default generation into multiple smaller calls
    // (e.g. one per format) so each fits comfortably inside the edge timeout.
    const batchType: string | undefined = typeof body.batchType === 'string' && body.batchType.trim()
      ? body.batchType.trim()
      : undefined;
    const batchQuantity: number | undefined = typeof body.batchQuantity === 'number' && body.batchQuantity > 0
      ? Math.min(20, Math.floor(body.batchQuantity))
      : undefined;
    const isFinalBatch: boolean = body.isFinalBatch === true;

    console.log('=== GENERATE-PERIOD-PLANS START ===');
    console.log('periodPlanId:', periodPlanId, '| planType:', planType, '| batchType:', batchType || '(full)', '| batchQuantity:', batchQuantity || '(default)');

    // Persist intent immediately so a draft is never left silently.
    // (best-effort: ignore errors here; main try/catch will set 'error' on failure)

    if (!periodPlanId || !tenantId) {
      throw new Error('periodPlanId e tenantId são obrigatórios');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch period plan data
    const { data: periodPlanData, error: periodError } = await supabase
      .from('period_plans')
      .select('*')
      .eq('id', periodPlanId)
      .single();

    if (periodError || !periodPlanData) {
      throw new Error('Plano de período não encontrado');
    }
    
    const periodPlan = periodPlanData as any;

    // Fetch company data
    const { data: companyData, error: companyError } = await supabase
      .from('tenant_companies')
      .select('*')
      .eq('id', periodPlan.company_id)
      .single();

    if (companyError || !companyData) {
      throw new Error('Empresa não encontrada');
    }
    
    const company = companyData as any;

    // Fetch strategy (truncated)
    let strategyText = '';
    if (periodPlan.strategy_id) {
      const { data: strategyData } = await supabase
        .from('strategies')
        .select('strategy_text')
        .eq('id', periodPlan.strategy_id)
        .single();
      if (strategyData) strategyText = (strategyData as any).strategy_text || '';
    } else {
      const { data: latestStrategyData } = await supabase
        .from('strategies')
        .select('strategy_text')
        .eq('company_id', periodPlan.company_id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestStrategyData) strategyText = (latestStrategyData as any).strategy_text || '';
    }

    // Fetch guide questions answers (compact)
    let questionsSnippet = '';
    const { data: questionSessionData } = await supabase
      .from('question_sessions')
      .select('questions, answers')
      .eq('company_id', periodPlan.company_id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (questionSessionData) {
      const qs = questionSessionData as any;
      if (qs.questions && qs.answers) {
        const questions = qs.questions as string[];
        const answers = qs.answers as Record<string, string>;
        questionsSnippet = questions.map((q: string, i: number) => {
          const answer = answers[i.toString()] || '';
          return answer ? `${q}: ${answer}` : '';
        }).filter(Boolean).join(' | ').substring(0, 600);
      }
    }

    // Fetch adaptive context
    const { data: adaptiveContextData } = await (supabase as any)
      .rpc('get_contextual_planning_input', {
        p_client_id: periodPlan.company_id,
        p_period_start: periodPlan.period_start,
        p_period_end: periodPlan.period_end
      });

    const ac = adaptiveContextData?.success ? adaptiveContextData : {
      calendar_events: [], successful_patterns: [], failed_patterns: [],
      recent_fingerprints: [], avoid_fingerprints: []
    };

    // Build compact context sections
    let calendarCtx = '';
    if (ac.calendar_events?.length > 0) {
      calendarCtx = '\nDatas comemorativas: ' + (ac.calendar_events as any[]).slice(0, 5)
        .map((e: any) => `${e.date}: ${e.name}`).join('; ');
    }

    let successCtx = '';
    if (ac.successful_patterns?.length > 0) {
      successCtx = '\nPadrões de sucesso: ' + (ac.successful_patterns as any[])
        .filter((p: any) => p.type !== 'fingerprint').slice(0, 5)
        .map((p: any) => `${p.value}(${p.success_rate}%)`).join(', ');
    }

    let avoidCtx = '';
    if (ac.failed_patterns?.length > 0) {
      avoidCtx = '\nEvitar: ' + (ac.failed_patterns as any[])
        .filter((p: any) => p.type !== 'fingerprint').slice(0, 5)
        .map((p: any) => p.value).join(', ');
    }

    let recentCtx = '';
    if (ac.recent_fingerprints?.length > 0) {
      recentCtx = '\nNão repetir: ' + (ac.recent_fingerprints as any[]).slice(0, 6)
        .map((f: any) => f.title).join('; ');
    }

    // Build COMPACT context
    const contentReqs = company.content_requirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (PRIORIDADE ALTA - SIGA OBRIGATORIAMENTE): ${company.content_requirements}`
      : '';

    const context = `Empresa: ${company.name} (${company.fantasy_name || ''}) | Setor: ${company.sector} | Porte: ${company.size}
Produtos: ${company.products_services}
Estratégia: ${strategyText.substring(0, 800) || 'Não definida'}
${questionsSnippet ? `Contexto: ${questionsSnippet}` : ''}
Período: ${periodPlan.period_title} (${periodPlan.period_start} a ${periodPlan.period_end})
Objetivo: ${periodPlan.objective}
Canal OBRIGATÓRIO: ${periodPlan.priority_channel}
Observações: ${periodPlan.observations || 'Nenhuma'}${contentReqs}${calendarCtx}${successCtx}${avoidCtx}${recentCtx}`;

    // Fetch ALL relevant prompts in parallel:
    // - generate_demandas_prompt: regras táticas para gerar a lista de demandas (obrigatório)
    // - generate_plan_prompt: diretrizes gerais do plano de marketing (opcional, contexto macro)
    // - advanced_planning_prompt: regras extras aplicadas apenas no plano "ultra" (opcional)
    const [demandasPromptRes, planPromptRes, advancedPromptRes] = await Promise.all([
      supabase
        .from('system_prompts')
        .select('prompt_content')
        .eq('tenant_id', tenantId)
        .eq('prompt_key', 'generate_demandas_prompt')
        .maybeSingle(),
      supabase
        .from('system_prompts')
        .select('prompt_content')
        .eq('tenant_id', tenantId)
        .eq('prompt_key', 'generate_plan_prompt')
        .maybeSingle(),
      supabase
        .from('system_prompts')
        .select('prompt_content')
        .eq('tenant_id', tenantId)
        .eq('prompt_key', 'advanced_planning_prompt')
        .maybeSingle(),
    ]);

    if (demandasPromptRes.error) throw new Error('Erro ao buscar prompt de demandas');
    const demandasPrompt = (demandasPromptRes.data as any)?.prompt_content;
    if (!demandasPrompt) {
      throw new Error('Prompt de demandas não configurado. Acesse /dev/prompts para configurar.');
    }

    const planPrompt = (planPromptRes.data as any)?.prompt_content?.trim() || '';
    const advancedPrompt = (advancedPromptRes.data as any)?.prompt_content?.trim() || '';

    // Compose final system prompt:
    //  1. Plano de marketing (visão estratégica geral) — sempre incluído quando existe
    //  2. Demandas (regras táticas) — sempre incluído
    //  3. Planejamento avançado — incluído APENAS no plano ultra
    const promptSections: string[] = [];
    if (planPrompt) {
      promptSections.push(`# DIRETRIZES GERAIS DE PLANO DE MARKETING\n${planPrompt}`);
    }
    promptSections.push(`# REGRAS DE GERAÇÃO DE DEMANDAS\n${demandasPrompt}`);
    if (planType === 'ultra' && advancedPrompt) {
      promptSections.push(`# REGRAS DE PLANEJAMENTO AVANÇADO (PLANO ULTRA)\n${advancedPrompt}`);
    }

    const systemPrompt = promptSections.join('\n\n---\n\n');

    console.log(`📋 Prompts carregados: demandas=✓, plano_marketing=${planPrompt ? '✓' : '✗'}, avançado=${advancedPrompt && planType === 'ultra' ? '✓' : '—'}`);

    // Fetch OpenAI API key
    const { data: apiKeyDataResult, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyError || !apiKeyDataResult) {
      throw new Error('OPENAI_API_KEY não configurada na tabela api_keys');
    }
    const apiKeyData = apiKeyDataResult as any;

    // JSON instruction - ALWAYS use fixed production line
    const planLabel = planType === 'ultra' ? 'ultra (ousado, criativo, inovador)' : 'normal (seguro, operacional)';
    
    // Production line: default 4 Post Estático, 2 Vídeos Curtos, 4 Carrossel (proporção 4:2:4)
    // Se customQuantity for fornecido, redistribui mantendo a mesma proporção (mínimo 1 por tipo).
    const baseLine = [
      { type: 'Post Estático', ratio: 4 },
      { type: 'Vídeos Curtos', ratio: 2 },
      { type: 'Carrossel', ratio: 4 },
    ];
    const baseTotal = 10;
    const targetTotal = customQuantity ?? baseTotal;
    
    let fixedProductionLine: { type: string; quantity: number }[];
    if (targetTotal === baseTotal) {
      fixedProductionLine = baseLine.map(b => ({ type: b.type, quantity: b.ratio }));
    } else {
      // Distribuição proporcional com arredondamento + ajuste no maior bucket
      const raw = baseLine.map(b => ({ type: b.type, quantity: Math.max(1, Math.round((b.ratio / baseTotal) * targetTotal)) }));
      let diff = targetTotal - raw.reduce((s, r) => s + r.quantity, 0);
      // Ajusta no maior item (Post Estático ou Carrossel) para bater o total exato
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
    
    let volumeInstruction = '';
    let demandLimit: number;

    if (planType === 'default') {
      if (batchType && batchQuantity) {
        // BATCH MODE: generate only this single format type
        demandLimit = batchQuantity;
        volumeInstruction = `
REGRA OBRIGATÓRIA DE VOLUME (LOTE ÚNICO):
Gere exatamente ${batchQuantity} demandas, TODAS do tipo "${batchType}".
O campo "tipo" de CADA demanda DEVE ser exatamente "${batchType}".
NÃO gere outros formatos.`;
      } else {
        demandLimit = fixedProductionLine.reduce((s, r) => s + r.quantity, 0);
        const distribution = fixedProductionLine.map(item => `${item.quantity} ${item.type}`).join(', ');
        volumeInstruction = `
REGRA OBRIGATÓRIA DE VOLUME:
Gere exatamente: ${distribution}.
Total: ${demandLimit} demandas. O campo "tipo" de cada demanda DEVE corresponder exatamente ao tipo definido.
NÃO gere formatos não listados. NÃO compense quantidade de um formato com outro.`;
      }
    } else {
      demandLimit = 3;
    }
    
    const jsonInstruction = `
Responda APENAS JSON. Canal: "${periodPlan.priority_channel}". Plano ${planLabel}.
IMPORTANTE: Gere exatamente ${demandLimit} demandas, nem mais nem menos.${volumeInstruction}

REGRA CRÍTICA DE DIVERSIDADE:
- Cada demanda DEVE ter um tema/assunto ÚNICO e DIFERENTE das demais.
- NUNCA repita o mesmo tema, conceito ou abordagem entre demandas diferentes.
- Títulos NÃO podem ser variações do mesmo assunto (ex: NÃO gere 2+ posts sobre "checklist", ou 2+ sobre "dicas", ou 2+ sobre o mesmo produto).
- Varie os formatos de abordagem: educativo, storytelling, bastidores, depoimento, tendência, humor, dados/estatísticas, antes/depois, tutorial, etc.
- Se o setor tem poucos temas, explore ângulos completamente diferentes para cada demanda.

Cada demanda: {"tipo":"...","titulo":"...","objetivo":"...","conteudo":"conteúdo markdown","instrucoes_de_producao":"...","cta_recomendado":"...","canal":"${periodPlan.priority_channel}","data_sugerida":"YYYY-MM-DD"}
Formato: {"plan":[...],"summary":"resumo curto"}`;
    console.log('Calling OpenAI for planType:', planType);
    
    // Adaptive timeout: small batches finish fast, give them less budget so the
    // edge function can return well within the 150s wall clock and the early
    // save always has time to persist.
    const isBatch = !!(batchType && batchQuantity);
    const timeoutMs = isBatch ? 80000 : 110000;
    const maxTokens = isBatch ? Math.min(3500, batchQuantity! * 700 + 800) : 6000;

    const abortController = new AbortController();
    const fetchTimeout = setTimeout(() => abortController.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKeyData.key_value}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            { role: 'developer', content: systemPrompt + jsonInstruction },
            { role: 'user', content: context }
          ],
          max_completion_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: abortController.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(fetchTimeout);
      if (fetchErr.name === 'AbortError') {
        console.error(`OpenAI fetch aborted after ${timeoutMs}ms timeout`);
        throw new Error('A geração demorou muito. Tente novamente com menos observações ou reduza a quantidade de conteúdos.');
      }
      throw fetchErr;
    }
    clearTimeout(fetchTimeout);

    const responseText = await response.text();
    console.log('OpenAI response status:', response.status);
    console.log('OpenAI response preview:', responseText.substring(0, 500));

    if (!response.ok) {
      if (response.status === 429) throw new Error('Rate limit excedido. Tente novamente.');
      if (response.status === 401) throw new Error('API Key inválida.');
      throw new Error(`OpenAI API error: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    let aiResponse;
    try {
      aiResponse = JSON.parse(responseText);
    } catch {
      throw new Error('Erro ao processar resposta da API OpenAI');
    }

    const finishReason = aiResponse.choices?.[0]?.finish_reason;
    const content = aiResponse.choices?.[0]?.message?.content;
    console.log('finish_reason:', finishReason, '| content length:', content?.length || 0);

    if (!content) {
      console.error('Full AI response:', JSON.stringify(aiResponse).substring(0, 1000));
      throw new Error(`Resposta vazia da IA (finish_reason: ${finishReason}). Tente novamente.`);
    }

    // Parse JSON response
    let parsed;
    try {
      let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*"plan"[\s\S]*\}/);
      if (jsonMatch) cleanContent = jsonMatch[0];
      parsed = JSON.parse(cleanContent);
    } catch {
      throw new Error('Resposta da IA não está em formato JSON válido.');
    }

    // Ensure correct channel
    const priorityChannel = periodPlan.priority_channel;
    const planDemands = (parsed.plan || []).map((d: any) => ({ ...d, canal: priorityChannel }));
    const summary = parsed.summary || '';

    console.log(`${planType} plan demands:`, planDemands.length);

    // Compute the merged default_plan when running in batch mode (append)
    const existingDefault = (periodPlan.default_plan && Array.isArray(periodPlan.default_plan))
      ? periodPlan.default_plan as any[]
      : [];
    const mergedDefault = (planType === 'default' && isBatch)
      ? [...existingDefault, ...planDemands]
      : planDemands;

    // EARLY SAVE: persist to DB immediately to avoid timeout killing the save
    {
      const earlySaveData: any = { updated_at: new Date().toISOString() };
      if (planType === 'default') {
        earlySaveData.default_plan = mergedDefault;
        if (isBatch && !isFinalBatch) {
          earlySaveData.status = 'generating_default';
        } else {
          earlySaveData.status = 'generating_ultra';
        }
      } else {
        earlySaveData.ultra_plan = planDemands;
        earlySaveData.status = 'generated';
        earlySaveData.default_plan = existingDefault;
        earlySaveData.final_plan = [...existingDefault, ...planDemands];
      }
      const { error: earlySaveErr } = await (supabase as any).from('period_plans').update(earlySaveData).eq('id', periodPlanId);
      if (earlySaveErr) {
        console.error('EARLY SAVE FAILED:', JSON.stringify(earlySaveErr));
      } else {
        console.log(`EARLY SAVE OK: ${planDemands.length} demands saved for ${planType}${isBatch ? ` (batch ${batchType}, total default=${mergedDefault.length})` : ''}`);
      }
    }

    if (planType === 'default') {
      const typeCounts: Record<string, number> = {};
      planDemands.forEach((d: any) => {
        const tipo = (d.tipo || '').trim();
        typeCounts[tipo] = (typeCounts[tipo] || 0) + 1;
      });
      console.log('[ProductionLine] Distribution (this batch):', JSON.stringify(typeCounts));
    }

    if (planDemands.length > 0) {
      const fingerprints = planDemands.map((demand: any) => ({
        tenant_id: tenantId,
        client_id: periodPlan.company_id,
        period_plan_id: periodPlanId,
        title: (demand.titulo || demand.title || 'Sem título').substring(0, 200),
        demand_type: demand.tipo || demand.demand_type || '',
        channel: demand.canal || demand.channel || priorityChannel,
        fingerprint: ''
      }));
      try {
        await (supabase as any).from('demand_fingerprints').insert(fingerprints);
      } catch (fpErr) {
        console.error('Fingerprint batch error:', fpErr);
      }
    }

    // Final consistency update (idempotent with early save)
    const updateData: any = { updated_at: new Date().toISOString() };
    if (planType === 'default') {
      updateData.default_plan = mergedDefault;
      if (isBatch && !isFinalBatch) {
        updateData.status = 'generating_default';
      } else if (periodPlan.ultra_plan && Array.isArray(periodPlan.ultra_plan) && periodPlan.ultra_plan.length > 0) {
        updateData.status = 'generated';
      } else {
        updateData.status = 'generating_ultra';
      }
    } else {
      updateData.ultra_plan = planDemands;
      updateData.default_plan = existingDefault;
      updateData.final_plan = [...existingDefault, ...planDemands];
      if (existingDefault.length > 0) {
        updateData.status = 'generated';
      } else {
        updateData.status = 'generating_default';
      }
    }

    const { error: updateError } = await (supabase as any).from('period_plans').update(updateData).eq('id', periodPlanId);
    if (updateError) {
      console.error('CRITICAL: Failed to save plan to DB:', JSON.stringify(updateError));
      // Don't throw - we still return the plan in the response so frontend can save it
    } else {
      console.log(`DB update successful for ${planType}. Fields: ${Object.keys(updateData).join(', ')}`);
    }

    console.log(`=== GENERATE-PERIOD-PLANS SUCCESS (${planType}) ===`);

    return new Response(JSON.stringify({
      success: true,
      planType,
      batchType: batchType || null,
      isFinalBatch,
      plan: planDemands,
      mergedDefaultPlan: planType === 'default' ? mergedDefault : undefined,
      summary,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== GENERATE-PERIOD-PLANS ERROR ===', error);

    if (periodPlanId && supabase) {
      try {
        // If we already saved some default demands, keep a recoverable status
        // (generating_default) instead of marking the whole period as 'error'.
        const { data: cur } = await (supabase as any)
          .from('period_plans')
          .select('default_plan')
          .eq('id', periodPlanId)
          .maybeSingle();
        const hasPartial = cur?.default_plan && Array.isArray(cur.default_plan) && cur.default_plan.length > 0;
        await (supabase as any)
          .from('period_plans')
          .update({ status: hasPartial ? 'generating_default' : 'error' })
          .eq('id', periodPlanId);
      } catch {
        // ignore
      }
    }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
