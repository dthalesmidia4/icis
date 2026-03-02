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

    console.log('=== GENERATE-PERIOD-PLANS START ===');
    console.log('periodPlanId:', periodPlanId, '| planType:', planType);

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
    const context = `Empresa: ${company.name} (${company.fantasy_name || ''}) | Setor: ${company.sector} | Porte: ${company.size}
Produtos: ${company.products_services}
Estratégia: ${strategyText.substring(0, 800) || 'Não definida'}
${questionsSnippet ? `Contexto: ${questionsSnippet}` : ''}
Período: ${periodPlan.period_title} (${periodPlan.period_start} a ${periodPlan.period_end})
Objetivo: ${periodPlan.objective}
Canal OBRIGATÓRIO: ${periodPlan.priority_channel}
Observações: ${periodPlan.observations || 'Nenhuma'}${calendarCtx}${successCtx}${avoidCtx}${recentCtx}`;

    // Fetch custom prompt - truncate to save tokens
    const { data: customPromptData, error: promptError } = await supabase
      .from('system_prompts')
      .select('prompt_content')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'generate_demandas_prompt')
      .maybeSingle();

    if (promptError) throw new Error('Erro ao buscar prompt');
    const customPrompt = customPromptData as any;
    if (!customPrompt?.prompt_content) {
      throw new Error('Prompt de demandas não configurado. Acesse /dev/prompts para configurar.');
    }

    const systemPrompt = customPrompt.prompt_content;

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
    
    // Fixed production line: 4 Post Estático, 2 Vídeos Curtos, 4 Carrossel
    const fixedProductionLine = [
      { type: 'Post Estático', quantity: 4 },
      { type: 'Vídeos Curtos', quantity: 2 },
      { type: 'Carrossel', quantity: 4 },
    ];
    
    let volumeInstruction = '';
    let demandLimit: number;
    
    if (planType === 'default') {
      demandLimit = 10;
      const distribution = fixedProductionLine.map(item => `${item.quantity} ${item.type}`).join(', ');
      volumeInstruction = `
REGRA OBRIGATÓRIA DE VOLUME:
Gere exatamente: ${distribution}.
Total: ${demandLimit} demandas. O campo "tipo" de cada demanda DEVE corresponder exatamente ao tipo definido.
NÃO gere formatos não listados. NÃO compense quantidade de um formato com outro.`;
    } else {
      demandLimit = 3;
    }
    
    const jsonInstruction = `
Responda APENAS JSON. Canal: "${periodPlan.priority_channel}". Plano ${planLabel}.
IMPORTANTE: Gere exatamente ${demandLimit} demandas, nem mais nem menos.${volumeInstruction}
Cada demanda: {"tipo":"...","titulo":"...","objetivo":"...","conteudo":"conteúdo markdown","instrucoes_de_producao":"...","cta_recomendado":"...","canal":"${periodPlan.priority_channel}","data_sugerida":"YYYY-MM-DD"}
Formato: {"plan":[...],"summary":"resumo curto"}`;
    console.log('Calling OpenAI for planType:', planType);
    
    // AbortController with 115s timeout to guarantee time for early save before 150s wall clock
    const abortController = new AbortController();
    const fetchTimeout = setTimeout(() => abortController.abort(), 115000);
    
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKeyData.key_value}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: [
            { role: 'developer', content: systemPrompt + jsonInstruction },
            { role: 'user', content: context }
          ],
          max_completion_tokens: 10000,
          response_format: { type: 'json_object' },
        }),
        signal: abortController.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(fetchTimeout);
      if (fetchErr.name === 'AbortError') {
        console.error('OpenAI fetch aborted after 115s timeout');
        throw new Error('A geração demorou muito. Tente novamente com menos observações.');
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

    // EARLY SAVE: persist to DB immediately to avoid timeout killing the save
    {
      const earlySaveData: any = { updated_at: new Date().toISOString() };
      if (planType === 'default') {
        earlySaveData.default_plan = planDemands;
        earlySaveData.status = 'generating_ultra';
      } else {
        earlySaveData.ultra_plan = planDemands;
        earlySaveData.status = 'generated';
        // Also set final_plan for ultra
        const currentDefault = periodPlan.default_plan && Array.isArray(periodPlan.default_plan) ? periodPlan.default_plan : [];
        earlySaveData.final_plan = [...currentDefault, ...planDemands];
      }
      const { error: earlySaveErr } = await (supabase as any).from('period_plans').update(earlySaveData).eq('id', periodPlanId);
      if (earlySaveErr) {
        console.error('EARLY SAVE FAILED:', JSON.stringify(earlySaveErr));
      } else {
        console.log(`EARLY SAVE OK: ${planDemands.length} demands saved for ${planType}`);
      }
    }

    // Validate production line compliance (log only, no retry to save time)
    if (planType === 'default') {
      const typeCounts: Record<string, number> = {};
      planDemands.forEach((d: any) => {
        const tipo = (d.tipo || '').trim();
        typeCounts[tipo] = (typeCounts[tipo] || 0) + 1;
      });
      console.log('[ProductionLine] Distribution:', JSON.stringify(typeCounts));
    }

    // Batch insert fingerprints
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

    // Update the specific plan field
    const updateData: any = { updated_at: new Date().toISOString() };
    if (planType === 'default') {
      updateData.default_plan = planDemands;
      // Check if ultra already exists to set status
      const currentPlan = periodPlan;
      if (currentPlan.ultra_plan && Array.isArray(currentPlan.ultra_plan) && currentPlan.ultra_plan.length > 0) {
        updateData.status = 'generated';
      } else {
        updateData.status = 'generating_ultra';
      }
    } else {
      updateData.ultra_plan = planDemands;
      // Check if default already exists
      const currentPlan = periodPlan;
      if (currentPlan.default_plan && Array.isArray(currentPlan.default_plan) && currentPlan.default_plan.length > 0) {
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
      plan: planDemands,
      summary,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== GENERATE-PERIOD-PLANS ERROR ===', error);

    if (periodPlanId && supabase) {
      try {
        await (supabase as any)
          .from('period_plans')
          .update({ status: 'error' })
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
