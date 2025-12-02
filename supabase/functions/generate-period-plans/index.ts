import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_DEMANDAS_PROMPT = `Você é um estrategista de marketing digital premium. Sua tarefa é gerar DUAS linhas de demandas para um período de campanha.

CONTEXTO DISPONÍVEL:
- Dados cadastrais da empresa (razão social, nome fantasia, setor, tamanho, produtos/serviços)
- Estratégia global de marketing previamente definida
- Respostas das perguntas guias estratégicas
- Período selecionado (título, datas, orçamento, objetivo, canal prioritário, observações/restrições)

REGRAS OBRIGATÓRIAS:
1. As datas DEVEM estar DENTRO do período especificado (entre data_inicio e data_fim)
2. Gere entre 8 a 15 demandas para cada linha
3. Considere o orçamento e restrições mencionadas nas observações
4. Respeite os formatos que o cliente NÃO deseja usar (se mencionados)
5. Distribua as demandas de forma equilibrada ao longo do período
6. Seja específico e contextualizado - use as informações do cliente para criar demandas personalizadas

⚠️ EXEMPLO DE COMO VOCÊ DEVE ENTREGAR OS CARDS DAS DEMANDAS (MODELO OBRIGATÓRIO):

{
  "tipo": "Carrossel (3 slides)",
  "titulo": "Erros na Conferência de Notas",
  "objetivo": "Educar e reforçar autoridade",
  "descricao_da_tarefa": "SLIDE 1 – Atenção!\\nErros na conferência de notas custam caro ⚠️\\n✔️ CFOP, NCM e valores precisam bater.\\n❌ NF em CPF sem recibo? Recuse na hora.\\n\\nSLIDE 2 – Transporte\\n📄 Exija o CTe completo.\\n🚛 Confira placa e CNPJ do prestador.\\nSem CTe = sem descarga.",
  "canal": "Instagram",
  "data_sugerida": "2025-01-15"
}

ESTRUTURA DE CADA DEMANDA:
- tipo: Formato do conteúdo (ex: "Carrossel (3 slides)", "Reels (30s)", "Post estático", "Story sequência")
- titulo: Nome curto e objetivo da demanda
- objetivo: Propósito da peça (educar, vender, engajar, etc.)
- descricao_da_tarefa: Conteúdo DETALHADO com roteiro, textos, CTAs, divisão de slides/cenas
- canal: Plataforma onde será publicado
- data_sugerida: Data no formato YYYY-MM-DD

LINHA NORMAL (default_plan):
- Demandas tradicionais, operacionais e seguras
- Conteúdos comprovados que funcionam no mercado
- Abordagem conservadora e consistente
- Foco em resultados previsíveis e mensuráveis

LINHA ULTRA (ultra_plan):
- Demandas ousadas, criativas e fora da caixa
- Ideias inovadoras com potencial viral
- Campanhas disruptivas e diferenciadas
- Abordagem de alto risco/alto impacto

FORMATO DE RESPOSTA (JSON válido):
{
  "default_plan": [
    {
      "tipo": "...",
      "titulo": "...",
      "objetivo": "...",
      "descricao_da_tarefa": "...",
      "canal": "...",
      "data_sugerida": "YYYY-MM-DD"
    }
  ],
  "ultra_plan": [...],
  "normal_summary": "Descrição breve do tom e abordagem do plano normal",
  "ultra_summary": "Descrição breve do tom e abordagem do plano ultra"
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { periodPlanId, tenantId } = await req.json();

    if (!periodPlanId || !tenantId) {
      throw new Error('periodPlanId e tenantId são obrigatórios');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch period plan data
    const { data: periodPlan, error: periodError } = await supabase
      .from('period_plans')
      .select('*')
      .eq('id', periodPlanId)
      .single();

    if (periodError || !periodPlan) {
      throw new Error('Plano de período não encontrado');
    }

    // Fetch company data
    const { data: company, error: companyError } = await supabase
      .from('tenant_companies')
      .select('*')
      .eq('id', periodPlan.company_id)
      .single();

    if (companyError || !company) {
      throw new Error('Empresa não encontrada');
    }

    // Fetch strategy if exists
    let strategyText = '';
    if (periodPlan.strategy_id) {
      const { data: strategy } = await supabase
        .from('strategies')
        .select('strategy_text, name')
        .eq('id', periodPlan.strategy_id)
        .single();
      
      if (strategy) {
        strategyText = strategy.strategy_text;
      }
    } else {
      // Try to get latest strategy for the company
      const { data: latestStrategy } = await supabase
        .from('strategies')
        .select('strategy_text, name')
        .eq('company_id', periodPlan.company_id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latestStrategy) {
        strategyText = latestStrategy.strategy_text;
      }
    }

    // Fetch guide questions answers
    const { data: questionSession } = await supabase
      .from('question_sessions')
      .select('questions, answers')
      .eq('company_id', periodPlan.company_id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let questionsContext = '';
    if (questionSession?.questions && questionSession?.answers) {
      const questions = questionSession.questions as string[];
      const answers = questionSession.answers as Record<string, string>;
      
      questionsContext = questions.map((q, i) => {
        const answer = answers[i.toString()] || 'Não respondido';
        return `Pergunta: ${q}\nResposta: ${answer}`;
      }).join('\n\n');
    }

    // Fetch custom prompt from database
    const { data: customPrompt } = await supabase
      .from('system_prompts')
      .select('prompt_content')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'generate_demandas_prompt')
      .maybeSingle();

    const systemPrompt = customPrompt?.prompt_content || DEFAULT_DEMANDAS_PROMPT;
    console.log('Using custom prompt:', !!customPrompt);

    // Fetch OpenAI API key from api_keys table
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('OpenAI API key not found:', apiKeyError);
      throw new Error('OPENAI_API_KEY não configurada na tabela api_keys');
    }

    // Build comprehensive context
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

## PERÍODO SELECIONADO
- Título: ${periodPlan.period_title}
- Data Início: ${periodPlan.period_start}
- Data Fim: ${periodPlan.period_end}
- Orçamento: ${periodPlan.budget || 'Não especificado'}
- Objetivo: ${periodPlan.objective}
- Canal Prioritário: ${periodPlan.priority_channel}
- Observações/Restrições: ${periodPlan.observations || 'Nenhuma'}
`;

    console.log('Generating period plans for:', periodPlanId, 'using GPT-5 Mini');

    // Append JSON instruction to ensure proper output format with DETAILED field requirements
    const jsonInstruction = `

⚠️ INSTRUÇÕES OBRIGATÓRIAS DE FORMATO (SEGUIR EXATAMENTE):

Responda APENAS com JSON válido, sem texto adicional antes ou depois.

ESTRUTURA DE CADA DEMANDA (campos obrigatórios):
{
  "tipo": "Carrossel (X slides) | Reels (Xs) | Post estático | Story | Vídeo Comercial | etc",
  "titulo": "Nome curto e objetivo da peça",
  "objetivo": "O que a peça quer alcançar (educar, vender, engajar, autoridade, etc)",
  "texto_da_peca": "CONTEÚDO DETALHADO E COMPLETO:\\nSLIDE 1 — [texto completo]\\nSLIDE 2 — [texto completo]\\n...ou ROTEIRO COMPLETO para vídeos com cada cena/fala descrita",
  "instrucoes_de_producao": "Instruções específicas: cores, ícones, fotos, ângulos, cortes, CTAs visuais, tom",
  "cta_recomendado": "Chamada para ação específica da peça",
  "canal": "Instagram | LinkedIn | TikTok | YouTube | etc",
  "data_sugerida": "YYYY-MM-DD (dentro do período especificado)"
}

IMPORTANTE: O campo "texto_da_peca" DEVE conter o conteúdo COMPLETO E PRONTO PARA USO:
- Para carrosséis: todos os slides com texto exato de cada um
- Para reels/vídeos: roteiro completo cena por cena com falas e descrição visual
- Para posts estáticos: texto completo da legenda + texto que vai na imagem
- Para stories: sequência completa de frames com texto de cada um
- Para depoimentos: texto completo do depoimento/citação do cliente
- Para vídeos comerciais: roteiro completo com cada cena, VO (voz off) e texto na tela
- Para posts LinkedIn: texto completo do artigo/post

⚠️ NUNCA deixe "texto_da_peca" vazio. TODA demanda DEVE ter conteúdo pronto para uso.

FORMATO DE RESPOSTA FINAL:
{
  "default_plan": [{ "tipo": "...", "titulo": "...", "objetivo": "...", "texto_da_peca": "...", "instrucoes_de_producao": "...", "cta_recomendado": "...", "canal": "...", "data_sugerida": "YYYY-MM-DD" }],
  "ultra_plan": [...],
  "normal_summary": "...",
  "ultra_summary": "..."
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key_value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt + jsonInstruction },
          { role: 'user', content: context }
        ],
        max_completion_tokens: 16000,
      }),
    });

    const responseText = await response.text();
    console.log('OpenAI raw response status:', response.status);
    console.log('OpenAI raw response preview:', responseText.substring(0, 300));

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, responseText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit excedido. Tente novamente em alguns segundos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 401) {
        return new Response(JSON.stringify({ error: 'API Key inválida. Verifique a configuração do OPENAI_API_KEY.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

    console.log('AI content preview:', content.substring(0, 200));

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
      console.error('Raw content:', content.substring(0, 500));
      throw new Error('Erro ao processar resposta da IA. A resposta não está em formato JSON válido.');
    }

    // Update period plan with generated plans
    const { error: updateError } = await supabase
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
      throw new Error('Erro ao salvar planos gerados');
    }

    console.log('Period plans generated successfully with GPT-5 Mini');

    return new Response(JSON.stringify({
      success: true,
      default_plan: plans.default_plan,
      ultra_plan: plans.ultra_plan,
      normal_summary: plans.normal_summary || 'Abordagem tradicional e segura com demandas operacionais.',
      ultra_summary: plans.ultra_summary || 'Abordagem ousada e criativa com ideias inovadoras.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-period-plans:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});