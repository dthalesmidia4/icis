import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para gerar fingerprint (mesma lógica do banco)
function generateFingerprint(title: string, demandType: string, channel: string): string {
  const input = `${(title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${(demandType || '').toLowerCase()}|${(channel || '').toLowerCase()}`;
  // Simple hash for fingerprint (MD5 equivalent logic)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let periodPlanId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const body = await req.json();
    periodPlanId = body.periodPlanId;
    const tenantId = body.tenantId;

    console.log('=== GENERATE-PERIOD-PLANS START (ADAPTIVE V2) ===');
    console.log('periodPlanId:', periodPlanId);
    console.log('tenantId:', tenantId);

    if (!periodPlanId || !tenantId) {
      throw new Error('periodPlanId e tenantId são obrigatórios');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch period plan data
    console.log('Fetching period plan...');
    const { data: periodPlanData, error: periodError } = await supabase
      .from('period_plans')
      .select('*')
      .eq('id', periodPlanId)
      .single();

    if (periodError || !periodPlanData) {
      console.error('Period plan not found:', periodError);
      throw new Error('Plano de período não encontrado');
    }
    
    const periodPlan = periodPlanData as any;
    console.log('Period plan found:', periodPlan.period_title);

    // Fetch company data
    console.log('Fetching company...');
    const { data: companyData, error: companyError } = await supabase
      .from('tenant_companies')
      .select('*')
      .eq('id', periodPlan.company_id)
      .single();

    if (companyError || !companyData) {
      console.error('Company not found:', companyError);
      throw new Error('Empresa não encontrada');
    }
    
    const company = companyData as any;
    console.log('Company found:', company.name);

    // Fetch strategy if exists
    let strategyText = '';
    if (periodPlan.strategy_id) {
      const { data: strategyData } = await supabase
        .from('strategies')
        .select('strategy_text, name')
        .eq('id', periodPlan.strategy_id)
        .single();
      
      const strategy = strategyData as any;
      if (strategy) {
        strategyText = strategy.strategy_text;
        console.log('Strategy found by ID');
      }
    } else {
      // Try to get latest strategy for the company
      const { data: latestStrategyData } = await supabase
        .from('strategies')
        .select('strategy_text, name')
        .eq('company_id', periodPlan.company_id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const latestStrategy = latestStrategyData as any;
      if (latestStrategy) {
        strategyText = latestStrategy.strategy_text;
        console.log('Latest strategy found');
      }
    }

    // Fetch guide questions answers
    const { data: questionSessionData } = await supabase
      .from('question_sessions')
      .select('questions, answers')
      .eq('company_id', periodPlan.company_id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const questionSession = questionSessionData as any;
    let questionsContext = '';
    if (questionSession?.questions && questionSession?.answers) {
      const questions = questionSession.questions as string[];
      const answers = questionSession.answers as Record<string, string>;
      
      questionsContext = questions.map((q: string, i: number) => {
        const answer = answers[i.toString()] || 'Não respondido';
        return `Pergunta: ${q}\nResposta: ${answer}`;
      }).join('\n\n');
      console.log('Questions context loaded:', questions.length, 'questions');
    }

    // ============================================
    // BUSCAR CONTEXTO ADAPTATIVO
    // ============================================
    console.log('Fetching adaptive context...');
    const { data: adaptiveContextData, error: adaptiveError } = await (supabase as any)
      .rpc('get_contextual_planning_input', {
        p_client_id: periodPlan.company_id,
        p_period_start: periodPlan.period_start,
        p_period_end: periodPlan.period_end
      });

    let adaptiveContext: any = {
      calendar_events: [],
      successful_patterns: [],
      failed_patterns: [],
      recent_fingerprints: [],
      top_demand_types: [],
      avoid_fingerprints: []
    };

    if (adaptiveError) {
      console.error('Error fetching adaptive context:', adaptiveError);
    } else if (adaptiveContextData?.success) {
      adaptiveContext = adaptiveContextData;
      console.log('Adaptive context loaded:');
      console.log('- Calendar events:', adaptiveContext.calendar_events?.length || 0);
      console.log('- Successful patterns:', adaptiveContext.successful_patterns?.length || 0);
      console.log('- Failed patterns:', adaptiveContext.failed_patterns?.length || 0);
      console.log('- Recent fingerprints:', adaptiveContext.recent_fingerprints?.length || 0);
    }

    // ============================================
    // BUSCAR FINGERPRINTS EXISTENTES PARA DEDUPLICAÇÃO
    // ============================================
    console.log('Fetching existing fingerprints for deduplication...');
    const { data: existingFingerprintsData } = await supabase
      .from('demand_fingerprints')
      .select('fingerprint, title')
      .eq('client_id', periodPlan.company_id);
    
    const existingFingerprints = new Set(
      (existingFingerprintsData || []).map((f: any) => f.fingerprint)
    );
    const existingTitles = (existingFingerprintsData || []).map((f: any) => f.title);
    console.log('Existing fingerprints count:', existingFingerprints.size);

    // ============================================
    // FORMATAR CONTEXTO ADAPTATIVO PARA A IA
    // ============================================
    let calendarContext = '';
    if (adaptiveContext.calendar_events && adaptiveContext.calendar_events.length > 0) {
      calendarContext = `
## 📅 DATAS COMEMORATIVAS NO PERÍODO (USAR OBRIGATORIAMENTE)
${(adaptiveContext.calendar_events as any[]).map((e: any) => 
  `- ${e.date}: **${e.name}** (${e.type}, prioridade: ${e.priority}/100)
   Dica de marketing: ${e.tips || 'Aproveite a data para engajamento'}`
).join('\n')}

⚠️ OBRIGATÓRIO: Pelo menos 30% das demandas DEVEM ser relacionadas a essas datas comemorativas.
`;
    } else {
      calendarContext = `
## 📅 DATAS COMEMORATIVAS
Nenhuma data comemorativa especial encontrada para este período.
Foque em conteúdo evergreen e temas da estratégia do cliente.
`;
    }

    let successPatternsContext = '';
    if (adaptiveContext.successful_patterns && adaptiveContext.successful_patterns.length > 0) {
      successPatternsContext = `
## ✅ PADRÕES DE SUCESSO DESTE CLIENTE (PRIORIZAR)
Os seguintes formatos/tipos tiveram bom desempenho e devem ser priorizados:
${(adaptiveContext.successful_patterns as any[])
  .filter((p: any) => p.type !== 'fingerprint')
  .map((p: any) => `- ${p.type}: "${p.value}" (taxa de sucesso: ${p.success_rate}%)`)
  .join('\n')}
`;
    }

    let topDemandTypesContext = '';
    if (adaptiveContext.top_demand_types && adaptiveContext.top_demand_types.length > 0) {
      topDemandTypesContext = `
## 🏆 TIPOS DE DEMANDA MAIS EFETIVOS
${(adaptiveContext.top_demand_types as any[]).map((t: any) => 
  `- ${t.demand_type} (${t.success_count} publicações bem-sucedidas)`
).join('\n')}
`;
    }

    let avoidPatternsContext = '';
    if (adaptiveContext.failed_patterns && adaptiveContext.failed_patterns.length > 0) {
      avoidPatternsContext = `
## ❌ PADRÕES A EVITAR (NÃO REPETIR)
Os seguintes padrões tiveram mau desempenho ou foram rejeitados pelo cliente:
${(adaptiveContext.failed_patterns as any[])
  .filter((p: any) => p.type !== 'fingerprint')
  .map((p: any) => `- ${p.type}: "${p.value}" (taxa de rejeição: ${p.failure_rate}%)`)
  .join('\n')}

⚠️ NÃO gere demandas usando esses padrões problemáticos.
`;
    }

    // ============================================
    // LISTA DE TÍTULOS PROIBIDOS (CRÍTICO PARA EVITAR REPETIÇÃO)
    // ============================================
    let prohibitedTitlesContext = '';
    if (existingTitles.length > 0) {
      const recentTitles = existingTitles.slice(0, 30);
      prohibitedTitlesContext = `
## ⛔ TÍTULOS PROIBIDOS - NÃO USAR NENHUM DESTES

Os seguintes títulos JÁ FORAM USADOS para este cliente. Qualquer demanda com título idêntico ou muito similar será AUTOMATICAMENTE REJEITADA pelo sistema:

${recentTitles.map((t: string) => `❌ "${t}"`).join('\n')}

REGRAS DE ORIGINALIDADE:
1. NÃO copie nenhum título acima literalmente
2. NÃO faça variações mínimas (ex: "5 dicas" vs "6 dicas")
3. Crie ideias COMPLETAMENTE NOVAS e DIFERENTES
4. Use abordagens, ângulos e formatos que ainda não foram explorados
5. Demandas duplicadas serão removidas automaticamente

`;
    }

    // Fetch custom prompt from database - OBRIGATÓRIO
    console.log('Fetching custom prompt for tenant:', tenantId);
    const { data: customPromptData, error: promptError } = await supabase
      .from('system_prompts')
      .select('prompt_content')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'generate_demandas_prompt')
      .maybeSingle();

    if (promptError) {
      console.error('Error fetching prompt:', promptError);
      throw new Error('Erro ao buscar prompt de demandas no banco de dados');
    }

    const customPrompt = customPromptData as any;
    if (!customPrompt?.prompt_content) {
      console.error('Prompt not found for tenant:', tenantId);
      throw new Error('Prompt de demandas não configurado. Acesse /dev/prompts para configurar o prompt "generate_demandas_prompt".');
    }

    const systemPrompt = customPrompt.prompt_content;
    console.log('Custom prompt loaded, length:', systemPrompt.length);

    // Fetch OpenAI API key from api_keys table
    const { data: apiKeyDataResult, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyError || !apiKeyDataResult) {
      console.error('OpenAI API key not found:', apiKeyError);
      throw new Error('OPENAI_API_KEY não configurada na tabela api_keys');
    }
    
    const apiKeyData = apiKeyDataResult as any;
    console.log('OpenAI API key found');

    // Build comprehensive context with ADAPTIVE DATA
    const context = `
## DADOS DA EMPRESA
- Razão Social: ${company.name}
- Nome Fantasia: ${company.fantasy_name || 'Não informado'}
- Setor: ${company.sector}
- Tamanho: ${company.size}
- Produtos/Serviços: ${company.products_services}
- Email: ${company.email}
- Telefone: ${company.phone}

## ESTRATÉGIA GLOBAL
${strategyText || 'Estratégia não definida ainda.'}

## CONTEXTO DAS PERGUNTAS GUIAS
${questionsContext || 'Nenhuma pergunta respondida.'}

## INFORMAÇÕES ESTRATÉGICAS DO PERÍODO
- Como a empresa atrai clientes: ${periodPlan.client_acquisition || 'Não informado'}
- Investimento em tráfego pago: ${periodPlan.paid_traffic_budget || 'Não especificado'}

## PERÍODO SELECIONADO
- Título: ${periodPlan.period_title}
- Data Início: ${periodPlan.period_start}
- Data Fim: ${periodPlan.period_end}
- Orçamento: ${periodPlan.budget || 'Não especificado'}
- Objetivo: ${periodPlan.objective}

⚠️ CANAL PRIORITÁRIO (OBRIGATÓRIO PARA TODAS AS DEMANDAS): ${periodPlan.priority_channel}
ATENÇÃO: Todas as demandas devem ser EXCLUSIVAMENTE para "${periodPlan.priority_channel}". NÃO gere demandas para nenhum outro canal.

- Observações/Restrições do Período: ${periodPlan.observations || 'Nenhuma'}

${calendarContext}
${successPatternsContext}
${topDemandTypesContext}
${avoidPatternsContext}
${prohibitedTitlesContext}

## 🎯 INSTRUÇÕES DE ADAPTAÇÃO
1. PRIORIZE os tipos de demanda que funcionam para este cliente
2. APROVEITE as datas comemorativas - inclua demandas específicas para elas
3. EVITE ABSOLUTAMENTE repetir ideias dos títulos proibidos
4. VARIE e EVOLUA ideias que tiveram sucesso, não apenas copie
5. CRIE conteúdo contextualizado para a temporada/período
6. CADA demanda deve ter uma ideia CENTRAL ÚNICA
`;

    console.log('Generating period plans for:', periodPlanId, 'using GPT-5 Mini (ADAPTIVE V2)');
    console.log('Priority channel:', periodPlan.priority_channel);
    console.log('Calendar events in period:', adaptiveContext.calendar_events?.length || 0);
    console.log('Prohibited titles count:', existingTitles.length);

    // Append JSON instruction with VALIDATION RULES integrated
    const jsonInstruction = `

⚠️ INSTRUÇÕES OBRIGATÓRIAS DE FORMATO (SEGUIR EXATAMENTE):

Responda APENAS com JSON válido, sem texto adicional antes ou depois.

⚠️ LEMBRETE CRÍTICO: O campo "canal" de TODAS as demandas DEVE ser EXATAMENTE: "${periodPlan.priority_channel}"
NÃO use nenhum outro canal. TODAS as demandas são para ${periodPlan.priority_channel}.

ESTRUTURA DE CADA DEMANDA (campos obrigatórios):
{
  "tipo": "Carrossel (X slides) | Reels (Xs) | Post estático | Story | Vídeo Comercial | etc",
  "titulo": "Nome curto e objetivo da peça - DEVE SER ÚNICO E DIFERENTE DOS TÍTULOS PROIBIDOS",
  "objetivo": "O que a peça quer alcançar (educar, vender, engajar, autoridade, etc)",
  "conteudo": "CONTEÚDO FORMATADO COM MARKDOWN para facilitar leitura. Use ## para títulos de seções, - para listas, e linhas em branco para separar parágrafos. Exemplo:\\n\\n## SLIDE 1\\nTexto completo do slide\\n\\n## SLIDE 2\\nTexto completo do slide\\n\\nPara vídeos:\\n\\n## CENA 1\\n**Visual:** descrição\\n**Narração:** texto\\n\\n## CENA 2\\n...",
  "instrucoes_de_producao": "Instruções específicas: cores, ícones, fotos, ângulos, cortes, CTAs visuais, tom",
  "cta_recomendado": "Chamada para ação específica da peça",
  "canal": "${periodPlan.priority_channel}",
  "data_sugerida": "YYYY-MM-DD (dentro do período especificado)",
  "contexto_sazonal": "Se aplicável, mencione a data comemorativa relacionada (ex: 'Carnaval', 'Dia da Mulher')"
}

IMPORTANTE: O campo "conteudo" DEVE conter o conteúdo COMPLETO E PRONTO PARA USO:
- Para carrosséis: todos os slides com texto exato de cada um
- Para reels/vídeos: roteiro completo cena por cena com falas e descrição visual
- Para posts estáticos: texto completo da legenda + texto que vai na imagem
- Para stories: sequência completa de frames com texto de cada um
- Para depoimentos: texto completo do depoimento/citação do cliente
- Para vídeos comerciais: roteiro completo com cada cena, VO (voz off) e texto na tela
- Para posts LinkedIn: texto completo do artigo/post

⚠️ NUNCA deixe "conteudo" vazio. TODA demanda DEVE ter conteúdo pronto para uso.
⚠️ TODAS as demandas DEVEM ter canal = "${periodPlan.priority_channel}"

## ⚠️ AUTO-VALIDAÇÃO OBRIGATÓRIA (aplicar ANTES de finalizar cada demanda):

Antes de incluir qualquer demanda no resultado, valide internamente:

1. PLANEJAMENTO: A demanda respeita as observações/restrições do período "${periodPlan.observations || 'Nenhuma'}"?
2. CTA: Se CTA comercial/vendas NÃO foi autorizado nas observações, use APENAS encerramentos neutros (ex: "Reflita sobre isso", "Salve para depois", "Comente sua opinião"). NUNCA prometa resultados, prazos ou promoções sem autorização.
3. COERÊNCIA: O objetivo declarado bate com o conteúdo? A peça cumpre exatamente a função proposta?
4. REPETIÇÃO: O título É DIFERENTE de todos os títulos proibidos listados acima? Se for similar, MUDE COMPLETAMENTE.
5. VIABILIDADE: A demanda está clara, acionável e pronta para uma equipe de agência produzir?
6. ORIGINALIDADE: A ideia central é DIFERENTE de todas as demandas anteriores?
7. SAZONALIDADE: Se há datas comemorativas, inclua pelo menos 2-3 demandas relacionadas a elas.

Se qualquer validação falhar, AJUSTE a demanda antes de incluir no JSON. Não inclua demandas que violem essas regras.

FORMATO DE RESPOSTA FINAL:
{
  "default_plan": [{ "tipo": "...", "titulo": "...", "objetivo": "...", "conteudo": "...", "instrucoes_de_producao": "...", "cta_recomendado": "...", "canal": "${periodPlan.priority_channel}", "data_sugerida": "YYYY-MM-DD", "contexto_sazonal": "..." }],
  "ultra_plan": [...],
  "normal_summary": "...",
  "ultra_summary": "..."
}`;

    console.log('Calling OpenAI API...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key_value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt + jsonInstruction },
          { role: 'user', content: context }
        ],
        max_tokens: 16000,
      }),
    });

    const responseText = await response.text();
    console.log('OpenAI raw response status:', response.status);
    console.log('OpenAI raw response preview:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, responseText);
      
      if (response.status === 429) {
        throw new Error('Rate limit excedido. Tente novamente em alguns segundos.');
      }
      if (response.status === 401) {
        throw new Error('API Key inválida. Verifique a configuração do OPENAI_API_KEY.');
      }
      throw new Error(`OpenAI API error: ${response.status} - ${responseText}`);
    }

    let aiResponse;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse OpenAI response:', parseErr);
      throw new Error('Erro ao processar resposta da API OpenAI');
    }

    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty content. Full response:', JSON.stringify(aiResponse));
      throw new Error('Resposta vazia da IA. Verifique o modelo e prompt.');
    }

    console.log('AI content preview:', content.substring(0, 300));

    // Parse JSON response - try multiple extraction methods
    let plans;
    try {
      // Method 1: Try direct parse after cleaning markdown
      let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Method 2: Try to find JSON object in the response
      const jsonMatch = cleanContent.match(/\{[\s\S]*"default_plan"[\s\S]*"ultra_plan"[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
      plans = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw content:', content.substring(0, 1000));
      throw new Error('Erro ao processar resposta da IA. A resposta não está em formato JSON válido.');
    }

    // Ensure all demands have the correct priority channel (post-processing safety)
    const priorityChannel = periodPlan.priority_channel;
    if (plans.default_plan && Array.isArray(plans.default_plan)) {
      plans.default_plan = plans.default_plan.map((demand: any) => ({
        ...demand,
        canal: priorityChannel
      }));
      console.log('Default plan demands before dedup:', plans.default_plan.length);
    }
    if (plans.ultra_plan && Array.isArray(plans.ultra_plan)) {
      plans.ultra_plan = plans.ultra_plan.map((demand: any) => ({
        ...demand,
        canal: priorityChannel
      }));
      console.log('Ultra plan demands before dedup:', plans.ultra_plan.length);
    }

    // ============================================
    // DEDUPLICAÇÃO PROGRAMÁTICA PÓS-GERAÇÃO
    // ============================================
    console.log('=== STARTING DEDUPLICATION ===');
    
    const deduplicatePlan = (planDemands: any[], planName: string): any[] => {
      const uniqueDemands: any[] = [];
      const seenFingerprints = new Set<string>();
      let duplicatesRemoved = 0;
      
      for (const demand of planDemands) {
        const title = demand.titulo || demand.title || '';
        const demandType = demand.tipo || demand.demand_type || '';
        const channel = demand.canal || demand.channel || priorityChannel;
        
        const fingerprint = generateFingerprint(title, demandType, channel);
        
        // Check if fingerprint already exists in database OR in current batch
        if (existingFingerprints.has(fingerprint)) {
          console.log(`⚠️ DUPLICATE REMOVED (exists in DB): "${title}"`);
          duplicatesRemoved++;
          continue;
        }
        
        if (seenFingerprints.has(fingerprint)) {
          console.log(`⚠️ DUPLICATE REMOVED (in current batch): "${title}"`);
          duplicatesRemoved++;
          continue;
        }
        
        // Check for similar titles (case-insensitive, stripped)
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSimilarToExisting = existingTitles.some((existingTitle: string) => {
          const normalizedExisting = existingTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
          // If 80% or more of characters match, consider similar
          const similarity = normalizedTitle.length > 0 && normalizedExisting.length > 0
            ? (normalizedTitle === normalizedExisting || 
               normalizedTitle.includes(normalizedExisting) || 
               normalizedExisting.includes(normalizedTitle))
            : false;
          return similarity;
        });
        
        if (isSimilarToExisting) {
          console.log(`⚠️ SIMILAR TITLE REMOVED: "${title}"`);
          duplicatesRemoved++;
          continue;
        }
        
        seenFingerprints.add(fingerprint);
        uniqueDemands.push(demand);
      }
      
      console.log(`${planName}: ${duplicatesRemoved} duplicates removed, ${uniqueDemands.length} unique demands`);
      return uniqueDemands;
    };
    
    // Apply deduplication to both plans
    if (plans.default_plan && Array.isArray(plans.default_plan)) {
      plans.default_plan = deduplicatePlan(plans.default_plan, 'default_plan');
    }
    if (plans.ultra_plan && Array.isArray(plans.ultra_plan)) {
      plans.ultra_plan = deduplicatePlan(plans.ultra_plan, 'ultra_plan');
    }
    
    console.log('=== DEDUPLICATION COMPLETE ===');
    console.log('Final default_plan count:', plans.default_plan?.length || 0);
    console.log('Final ultra_plan count:', plans.ultra_plan?.length || 0);

    // ============================================
    // REGISTRAR FINGERPRINTS DAS DEMANDAS GERADAS
    // ============================================
    console.log('Recording demand fingerprints...');
    const allDemands = [...(plans.default_plan || []), ...(plans.ultra_plan || [])];
    
    for (const demand of allDemands) {
      try {
        const title = demand.titulo || demand.title || 'Sem título';
        const demandType = demand.tipo || demand.demand_type;
        const channel = demand.canal || demand.channel || priorityChannel;
        
        // O trigger auto_generate_fingerprint vai calcular o fingerprint automaticamente
        await (supabase as any).from('demand_fingerprints').insert({
          tenant_id: tenantId,
          client_id: periodPlan.company_id,
          period_plan_id: periodPlanId,
          title: title,
          demand_type: demandType,
          channel: channel,
          fingerprint: '' // Trigger will auto-calculate
        });
      } catch (fpError) {
        console.error('Error recording fingerprint:', fpError);
        // Don't fail the whole operation for fingerprint errors
      }
    }
    console.log('Fingerprints recorded:', allDemands.length);

    // Update period plan with generated plans
    console.log('Updating period plan with generated plans...');
    const { error: updateError } = await (supabase as any)
      .from('period_plans')
      .update({
        default_plan: plans.default_plan || [],
        ultra_plan: plans.ultra_plan || [],
        status: 'generated',
        updated_at: new Date().toISOString()
      })
      .eq('id', periodPlanId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error('Erro ao salvar planos gerados no banco de dados');
    }

    console.log('=== GENERATE-PERIOD-PLANS SUCCESS (ADAPTIVE V2) ===');

    return new Response(JSON.stringify({
      success: true,
      default_plan: plans.default_plan,
      ultra_plan: plans.ultra_plan,
      normal_summary: plans.normal_summary || 'Abordagem tradicional e segura com demandas operacionais.',
      ultra_summary: plans.ultra_summary || 'Abordagem ousada e criativa com ideias inovadoras.',
      adaptive_info: {
        calendar_events_count: adaptiveContext.calendar_events?.length || 0,
        patterns_considered: (adaptiveContext.successful_patterns?.length || 0) + (adaptiveContext.failed_patterns?.length || 0),
        avoided_repetitions: adaptiveContext.recent_fingerprints?.length || 0,
        duplicates_prevented: allDemands.length - (plans.default_plan?.length || 0) - (plans.ultra_plan?.length || 0)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('=== GENERATE-PERIOD-PLANS ERROR ===');
    console.error('Error:', error);

    // Try to update status to error so polling knows it failed
    if (periodPlanId && supabase) {
      try {
        console.log('Updating period plan status to error...');
        await (supabase as any)
          .from('period_plans')
          .update({ status: 'error' })
          .eq('id', periodPlanId);
        console.log('Status updated to error');
      } catch (updateErr) {
        console.error('Failed to update status to error:', updateErr);
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
