import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyId, strategyId, tenantId } = await req.json();
    console.log('Generating questions for:', { companyId, strategyId, tenantId });

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar dados do cliente
    const { data: company, error: companyError } = await supabase
      .from('tenant_companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError) {
      console.error('Error fetching company:', companyError);
      throw new Error('Erro ao buscar dados do cliente');
    }

    // Buscar estratégia
    const { data: strategy, error: strategyError } = await supabase
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single();

    if (strategyError) {
      console.error('Error fetching strategy:', strategyError);
      throw new Error('Erro ao buscar estratégia');
    }

    // Buscar prompt do sistema
    const { data: systemPrompt, error: promptError } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'generate_questions_prompt')
      .single();

    if (promptError) {
      console.error('Error fetching prompt:', promptError);
      throw new Error('Erro ao buscar prompt do sistema');
    }

    // Preparar contexto para a IA
    const context = `
DADOS DO CLIENTE:
- Nome: ${company.fantasy_name || company.name}
- CNPJ/CPF: ${company.cnpj_cpf}
- Setor: ${company.sector}
- Produtos/Serviços: ${company.products_services}
- Tamanho da empresa: ${company.size}
- Email: ${company.email}
- Telefone: ${company.phone}

ESTRATÉGIA GLOBAL DEFINIDA:
${strategy.strategy_text}

OBJETIVO:
Gere exatamente 8 perguntas estratégicas e personalizadas que ajudarão a refinar o cronograma de marketing deste cliente.
As perguntas devem ser contextuais ao setor, aos produtos/serviços e à estratégia definida.
`;

    const userPrompt = `
${context}

Retorne APENAS um array JSON com 8 objetos no seguinte formato (sem markdown, sem explicações):
[
  {
    "id": 1,
    "question": "Texto da pergunta aqui?",
    "type": "text"
  }
]

As perguntas devem cobrir aspectos como:
- Foco principal do mês
- Campanhas especiais ou datas importantes
- Tipo de conteúdo prioritário
- Objetivos específicos
- Públicos-alvo
- Materiais disponíveis
- Frequência de publicações desejada
- Canais de divulgação preferidos
`;

    // Buscar chave da API OpenAI
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('Error fetching API key:', apiKeyError);
      throw new Error('Chave da API OpenAI não configurada. Configure em Dev → APIs');
    }

    const openaiApiKey = apiKeyData.key_value;

    console.log('Calling OpenAI API...');
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { 
            role: 'system', 
            content: systemPrompt.prompt_content || 'Você é um assistente especializado em marketing digital.'
          },
          { 
            role: 'user', 
            content: userPrompt 
          }
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido na API OpenAI. Tente novamente em alguns instantes.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Chave da API OpenAI inválida. Verifique sua configuração em Dev → APIs.' }), 
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('Erro ao gerar perguntas com OpenAI');
    }

    const aiData = await aiResponse.json();
    console.log('AI Response:', JSON.stringify(aiData));
    
    let questionsText = aiData.choices[0].message.content;
    
    // Limpar markdown se presente
    questionsText = questionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse do JSON
    let questions;
    try {
      questions = JSON.parse(questionsText);
    } catch (parseError) {
      console.error('Error parsing questions:', parseError);
      console.error('Raw text:', questionsText);
      throw new Error('Erro ao processar resposta da IA');
    }

    // Criar sessão de perguntas no banco
    const { data: session, error: sessionError } = await supabase
      .from('question_sessions')
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        strategy_id: strategyId,
        questions: questions,
        answers: {},
        status: 'in_progress'
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      throw new Error('Erro ao criar sessão de perguntas');
    }

    console.log('Questions generated successfully:', session.id);
    
    return new Response(
      JSON.stringify({ 
        sessionId: session.id,
        questions: questions 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-questions function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
