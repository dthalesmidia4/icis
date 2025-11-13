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
    console.log('Generating plan for:', { companyId, strategyId, tenantId });

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

    // Buscar sessão de perguntas e respostas
    const { data: questionSession, error: sessionError } = await supabase
      .from('question_sessions')
      .select('*')
      .eq('company_id', companyId)
      .eq('strategy_id', strategyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error('Error fetching question session:', sessionError);
      throw new Error('Erro ao buscar perguntas e respostas');
    }

    // Buscar prompt do sistema para geração de plano
    const { data: systemPrompt, error: promptError } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'generate_plan_prompt')
      .single();

    if (promptError) {
      console.error('Error fetching prompt:', promptError);
      throw new Error('Erro ao buscar prompt do sistema. Configure em Dev → Prompts do Sistema');
    }

    // Consolidar perguntas e respostas
    const questions = Array.isArray(questionSession?.questions) ? questionSession.questions : [];
    const answers = questionSession?.answers || {};
    
    const questionsAndAnswers = questions.map((q: any, index: number) => {
      const qId = q.id || `q_${index}`;
      return {
        question: q.question || q.text || q,
        answer: answers[qId] || 'Não respondida'
      };
    });

    // Preparar contexto completo para a IA
    const context = `
DADOS CADASTRAIS DO CLIENTE:
- Razão Social: ${company.name}
- Nome Fantasia: ${company.name}
- CNPJ: ${company.cnpj_cpf}
- Setor de Atuação: ${company.sector}
- Produtos/Serviços Oferecidos: ${company.products_services}
- Tamanho da Empresa: ${company.size}
- Email: ${company.email}
- Telefone: ${company.phone}
- Endereço: ${company.address || 'Não informado'}

ESTRATÉGIA DO CLIENTE:
${strategy.strategy_text}

PERGUNTAS E RESPOSTAS:
${questionsAndAnswers.map((qa: { question: string; answer: string }, idx: number) => `${idx + 1}. ${qa.question}\n   Resposta: ${qa.answer}`).join('\n\n')}

MÊS SELECIONADO PARA O CRONOGRAMA:
${company.selected_month || 'Não especificado'}
`;

    const userPrompt = `
${context}

${systemPrompt.prompt_content}
`;

    // Buscar chave da API
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log('Calling AI API to generate plan...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em marketing estratégico. Gere planos de marketing detalhados e personalizados baseados nos dados fornecidos.'
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Limite de requisições excedido. Tente novamente em alguns instantes.');
      } else if (aiResponse.status === 402) {
        throw new Error('Créditos insuficientes. Adicione créditos em Settings → Workspace → Usage.');
      }
      
      throw new Error(`Erro na API de IA: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const generatedPlan = aiResult.choices?.[0]?.message?.content;

    if (!generatedPlan) {
      throw new Error('Nenhum plano foi gerado pela IA');
    }

    console.log('Plan generated successfully');

    // Salvar o plano gerado no banco de dados
    const { data: savedPlan, error: savePlanError } = await supabase
      .from('marketing_plans')
      .insert({
        company_id: companyId,
        strategy_id: strategyId,
        tenant_id: tenantId,
        plan_content: generatedPlan,
        status: 'draft',
        month: company.selected_month
      })
      .select()
      .single();

    if (savePlanError) {
      console.error('Error saving plan:', savePlanError);
      throw new Error('Erro ao salvar o plano gerado');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        planId: savedPlan.id,
        planContent: generatedPlan 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in generate-plan function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido ao gerar plano'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
