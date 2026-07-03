import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const truncateText = (value: unknown, maxLength: number) => {
  const normalized = typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const extractMessageContent = (aiResponse: any) => {
  const rawContent = aiResponse?.choices?.[0]?.message?.content;

  if (typeof rawContent === 'string') return rawContent.trim();

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part: any) => typeof part === 'string' ? part : part?.text || '')
      .join('')
      .trim();
  }

  return '';
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

    // NOTE: status enum is restricted to draft/generated/mode_selected/completed.
    // We keep the plan as 'draft' during generation and only switch to 'generated'
    // once the relevant slice of the plan was persisted.

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

    const compactStrategy = truncateText(strategyText, 420) || 'Não definida';
    const compactQuestions = truncateText(questionsSnippet, 320);
    const compactObservations = truncateText(periodPlan.observations, 420) || 'Nenhuma';
    const compactProducts = truncateText(company.products_services, 260) || 'Não informado';
    const compactContentReqs = contentReqs ? `\nExigências: ${truncateText(company.content_requirements, 320)}` : '';

    const context = `Empresa: ${truncateText(company.name, 120)} (${truncateText(company.fantasy_name || '', 120)}) | Setor: ${truncateText(company.sector, 120)} | Porte: ${truncateText(company.size, 80)}
Produtos: ${compactProducts}
Estratégia: ${compactStrategy}
${compactQuestions ? `Contexto: ${compactQuestions}` : ''}
Período: ${truncateText(periodPlan.period_title, 120)} (${periodPlan.period_start} a ${periodPlan.period_end})
Objetivo: ${truncateText(periodPlan.objective, 180)}
Canal OBRIGATÓRIO: ${truncateText(periodPlan.priority_channel, 120)}
Observações: ${compactObservations}${compactContentReqs}${truncateText(calendarCtx, 220)}${truncateText(successCtx, 220)}${truncateText(avoidCtx, 220)}${truncateText(recentCtx, 240)}`;

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

    const systemPrompt = promptSections
      .map(section => truncateText(section, 2200))
      .join('\n\n---\n\n');

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
Responda APENAS JSON válido, sem markdown, sem comentários e sem texto fora do objeto. Canal: "${periodPlan.priority_channel}". Plano ${planLabel}.
IMPORTANTE: Gere exatamente ${demandLimit} demandas, nem mais nem menos.${volumeInstruction}

REGRA CRÍTICA DE DIVERSIDADE:
- Cada demanda DEVE ter um tema/assunto ÚNICO e DIFERENTE das demais.
- NUNCA repita o mesmo tema, conceito ou abordagem entre demandas diferentes.
- Títulos NÃO podem ser variações do mesmo assunto (ex: NÃO gere 2+ posts sobre "checklist", ou 2+ sobre "dicas", ou 2+ sobre o mesmo produto).
- Varie os formatos de abordagem: educativo, storytelling, bastidores, depoimento, tendência, humor, dados/estatísticas, antes/depois, tutorial, etc.
- Se o setor tem poucos temas, explore ângulos completamente diferentes para cada demanda.

Cada demanda: {"tipo":"...","type_key":"criativo_estatico|carrossel|video_captado|video_gerado|null","titulo":"${truncateText(company.fantasy_name || company.name, 80)} – <título do post>","objetivo":"...","conteudo":"conteúdo markdown","instrucoes_de_producao":"...","cta_recomendado":"...","canal":"${periodPlan.priority_channel}","data_sugerida":"YYYY-MM-DD"}

REGRA OBRIGATÓRIA DE type_key (chave técnica do fluxo):
- "criativo_estatico" para post/imagem única/story estático.
- "carrossel" para carrossel de slides.
- "video_captado" quando o vídeo exigir GRAVAÇÃO REAL (pessoa, local, produto, depoimento, bastidor com câmera).
- "video_gerado" quando o vídeo puder ser 100% IA/animação/motion/stock, SEM captação.
- null quando você NÃO tiver certeza. NUNCA invente. Prefira null a errar.
- NUNCA use conteúdo composto (ex: "Post + Stories"); se o formato for misto, use null.

REGRA OBRIGATÓRIA DE TÍTULO:
- O campo "titulo" DEVE SEMPRE começar com "${truncateText(company.fantasy_name || company.name, 80)} – " (nome da marca, espaço, en-dash "–", espaço), seguido pelo título criativo do post.
- Exemplo correto: "${truncateText(company.fantasy_name || company.name, 80)} – Cuidados simples que preservam o valor do seu seminovo".
- NUNCA omita o nome da marca. NUNCA use "-" simples no lugar de "–". NUNCA use outro separador.

Formato: {"plan":[...],"summary":"resumo curto"}
Se faltar espaço, reduza o tamanho do campo "conteudo" antes de omitir itens do JSON.`;
    console.log('Calling OpenAI for planType:', planType);
    
    // Adaptive timeout: small batches finish fast, give them less budget so the
    // edge function can return well within the 150s wall clock and the early
    // save always has time to persist.
    const isBatch = !!(batchType && batchQuantity);
    const timeoutMs = isBatch ? 80000 : 110000;
    // gpt-5-mini consumes a large slice of max_completion_tokens on internal
    // reasoning. Give the model enough headroom so the JSON content is never
    // truncated to an empty string (finish_reason=length).
    const maxTokens = isBatch ? Math.min(8000, batchQuantity! * 1200 + 3500) : 12000;

    // Retry loop: gpt-5-mini sometimes burns all completion tokens on internal
    // reasoning and returns empty content. Retry up to 3x with bigger budget.
    let parsed: any = null;
    let lastErr = '';
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const attemptTokens = Math.min(16000, Math.round(maxTokens * (1 + 0.5 * (attempt - 1))));
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
            reasoning_effort: 'low',
            max_completion_tokens: attemptTokens,
            response_format: { type: 'json_object' },
          }),
          signal: abortController.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(fetchTimeout);
        lastErr = fetchErr?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (fetchErr?.message || 'fetch error');
        console.error(`[attempt ${attempt}/${attempts}] OpenAI fetch failed: ${lastErr}`);
        if (attempt === attempts) break;
        continue;
      }
      clearTimeout(fetchTimeout);

      const responseText = await response.text();
      console.log(`[attempt ${attempt}/${attempts}] OpenAI status:`, response.status);

      if (!response.ok) {
        lastErr = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
        console.error(`[attempt ${attempt}/${attempts}] ${lastErr}`);
        if (response.status === 401) break;
        if (attempt === attempts) break;
        continue;
      }

      let aiResponse: any;
      try { aiResponse = JSON.parse(responseText); } catch { lastErr = 'invalid JSON envelope'; continue; }
      const finishReason = aiResponse.choices?.[0]?.finish_reason;
      const content = extractMessageContent(aiResponse);
      console.log(`[attempt ${attempt}/${attempts}] finish_reason: ${finishReason} | content length: ${content?.length || 0}`);

      if (!content) {
        lastErr = `empty content (finish_reason: ${finishReason})`;
        if (attempt === attempts) break;
        continue;
      }

      try {
        let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleanContent.match(/\{[\s\S]*"plan"[\s\S]*\}/);
        if (jsonMatch) cleanContent = jsonMatch[0];
        parsed = JSON.parse(cleanContent);
        break;
      } catch (e: any) {
        lastErr = `JSON parse error: ${e?.message || e}`;
        if (attempt === attempts) break;
      }
    }

    if (!parsed) {
      console.error(`All ${attempts} attempts failed: ${lastErr}`);
      // Return 200 + success:false so the caller can move on to the next batch
      // instead of aborting the whole sequence.
      return new Response(JSON.stringify({
        success: false,
        partial: true,
        planType,
        batchType: batchType || null,
        batchQuantity: batchQuantity || null,
        isFinalBatch,
        plan: [],
        error: `IA não retornou conteúdo após ${attempts} tentativas (${lastErr}).`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Ensure correct channel + normalize tipo to requested batchType (avoids
    // accent/case mismatches deflating the count).
    const priorityChannel = periodPlan.priority_channel;

    const BATCH_TO_KEY: Record<string, string | null> = {
      'Post Estático': 'criativo_estatico',
      'Post estático': 'criativo_estatico',
      'Carrossel': 'carrossel',
      'Vídeos Curtos': null, // deixa a IA decidir captado vs gerado; null se não souber
    };
    const OFFICIAL_KEYS = new Set(['criativo_estatico', 'carrossel', 'video_captado', 'video_gerado']);
    const coerceKey = (v: any): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return OFFICIAL_KEYS.has(t) ? t : null;
    };
    const normalizeKey = (text: any): string | null => {
      if (!text || typeof text !== 'string') return null;
      const raw = text.trim();
      if (!raw || raw.includes('+')) return null;
      const l = raw.toLowerCase();
      if (l.includes('carrossel') || l.includes('carousel')) return 'carrossel';
      if (l.includes('captad')) return 'video_captado';
      if ((l.includes('gerad') || l.includes('gerar')) && (l.includes('vídeo') || l.includes('video'))) return 'video_gerado';
      if (/(\bv[ií]deo\b|\breels?\b|\btiktok\b|v[ií]deos?\s+curtos)/.test(l)) return null;
      if (/(est[aá]t|\bpost\b|stor(y|ies))/.test(l)) return 'criativo_estatico';
      return null;
    };

    const planDemands = (parsed.plan || []).map((d: any) => {
      const tipo = batchType ? batchType : (d.tipo || d.demand_type || '');
      const forcedKey = batchType && Object.prototype.hasOwnProperty.call(BATCH_TO_KEY, batchType)
        ? BATCH_TO_KEY[batchType]
        : null;
      const iaKey = coerceKey(d.type_key);
      const type_key = forcedKey ?? iaKey ?? normalizeKey(tipo);
      return {
        ...d,
        canal: priorityChannel,
        tipo,
        type_key,
      };
    });
    const summary = parsed.summary || '';

    console.log(`${planType} plan demands:`, planDemands.length);

    // Compute the merged default_plan when running in batch mode (append)
    const existingDefault = (periodPlan.default_plan && Array.isArray(periodPlan.default_plan))
      ? periodPlan.default_plan as any[]
      : [];
    const mergedDefault = (planType === 'default' && isBatch)
      ? [...existingDefault, ...planDemands]
      : planDemands;

    // EARLY SAVE: persist to DB immediately to avoid timeout killing the save.
    // Status enum only allows draft/generated/mode_selected/completed, so we keep
    // 'draft' while batches are still pending and only flip to 'generated' once
    // the full default+ultra plan is persisted.
    {
      const earlySaveData: any = { updated_at: new Date().toISOString() };
      if (planType === 'default') {
        earlySaveData.default_plan = mergedDefault;
        earlySaveData.status = 'draft';
      } else {
        earlySaveData.ultra_plan = planDemands;
        earlySaveData.default_plan = existingDefault;
        earlySaveData.final_plan = [...existingDefault, ...planDemands];
        earlySaveData.status = 'generated';
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
      // Only flip to 'generated' when the ultra plan is already in the row;
      // otherwise keep 'draft' so the frontend can resume the flow.
      if (periodPlan.ultra_plan && Array.isArray(periodPlan.ultra_plan) && periodPlan.ultra_plan.length > 0) {
        updateData.status = 'generated';
      } else {
        updateData.status = 'draft';
      }
    } else {
      updateData.ultra_plan = planDemands;
      updateData.default_plan = existingDefault;
      updateData.final_plan = [...existingDefault, ...planDemands];
      updateData.status = 'generated';
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
        // Keep the plan as 'draft' on failure so the frontend can resume / retry.
        // The status enum does not include 'error', so we never write that value.
        await (supabase as any)
          .from('period_plans')
          .update({ status: 'draft' })
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
