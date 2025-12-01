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
    const { companyId, tenantId, answers } = await req.json();
    console.log('Generating strategy for:', { companyId, tenantId });

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

    // Buscar prompt do sistema (ou usar padrão)
    const { data: systemPrompt } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'generate_strategy_prompt')
      .maybeSingle();

    // Prompt padrão caso não exista configuração
    const defaultPrompt = `Você é um estrategista de marketing sênior com mais de 15 anos de experiência em criar estratégias globais e atemporais para negócios de diversos setores.

Sua tarefa é criar uma ESTRATÉGIA GLOBAL DE MARKETING baseada nas informações do cliente e nas respostas do questionário estratégico.

A estratégia deve ser:
- Clara, objetiva e direta
- Acionável e prática
- Alinhada aos objetivos declarados pelo cliente
- Atemporal (não vinculada a um período específico)
- Adaptável a diferentes momentos e campanhas

Estruture a estratégia nos seguintes tópicos:

## POSICIONAMENTO DE MARCA
Defina como a marca deve se posicionar no mercado com base nos diferenciais e objetivos.

## PÚBLICO-ALVO
Detalhe o perfil do público a ser impactado, suas características e comportamentos.

## CANAIS PRIORITÁRIOS
Liste e justifique os canais de comunicação mais adequados para alcançar os objetivos.

## PILARES DE COMUNICAÇÃO
Defina os principais temas e mensagens-chave que devem guiar toda a comunicação.

## TOM DE VOZ
Especifique como a marca deve se comunicar (formal, descontraído, técnico, etc.).

## TIPOS DE CONTEÚDO
Recomende os formatos de conteúdo mais adequados para o negócio e público.

## FREQUÊNCIA E CADÊNCIA
Sugira uma frequência de publicações e ações considerando os recursos disponíveis.

## MÉTRICAS DE SUCESSO
Indique como medir o sucesso das ações de marketing.

Escreva em português brasileiro, de forma profissional mas acessível.
Seja específico e evite generalizações vazias.
Baseie todas as recomendações nas informações fornecidas pelo cliente.`;

    const promptContent = systemPrompt?.prompt_content || defaultPrompt;

    // Preparar contexto com dados do cliente
    const clientContext = `
DADOS DO CLIENTE:
- Razão Social: ${company.name}
- Nome Fantasia: ${company.fantasy_name || company.name}
- CNPJ/CPF: ${company.cnpj_cpf}
- Setor de Atuação: ${company.sector}
- Tamanho da Empresa: ${company.size}
- Produtos/Serviços: ${company.products_services}
- Email: ${company.email}
- Telefone: ${company.phone}
`;

    // Preparar respostas das perguntas guias
    const questionsAndAnswers = `
RESPOSTAS DAS PERGUNTAS ESTRATÉGICAS:

1. O que você deseja alcançar com a sua comunicação e marketing neste momento?
${answers.question_0 || 'Não respondido'}

2. Por qual motivo esse objetivo é tão importante para o seu negócio agora?
${answers.question_1 || 'Não respondido'}

3. Quem é o público que você precisa impactar?
${answers.question_2 || 'Não respondido'}

4. Em quais canais o seu público está mais presente e onde devemos concentrar esforços?
${answers.question_3 || 'Não respondido'}

5. Em qual prazo você espera começar a ver resultados dessas ações?
${answers.question_4 || 'Não respondido'}

6. De que forma você prefere que a comunicação seja desenvolvida?
${answers.question_5 || 'Não respondido'}

7. Como sua empresa atrai clientes hoje?
${answers.question_6 || 'Não respondido'}

8. Quais diferenciais reais tornam sua empresa mais competitiva?
${answers.question_7 || 'Não respondido'}

9. Qual é o orçamento disponível para ações, anúncios ou impulsionamentos?
${answers.question_8 || 'Não respondido'}

10. Quais materiais você já possui que podem ajudar na produção dos conteúdos?
${answers.question_9 || 'Não respondido'}

11. Existem datas, eventos ou ocasiões especiais que precisamos incluir no planejamento?
${answers.question_10 || 'Não respondido'}

12. Quem será o responsável pela aprovação dos conteúdos e qual o tempo médio dessa aprovação?
${answers.question_11 || 'Não respondido'}

13. Há alguma limitação que devemos considerar?
${answers.question_12 || 'Não respondido'}

14. Qual é o maior desafio que impede sua marca de ter resultados melhores hoje?
${answers.question_13 || 'Não respondido'}

15. Quais tipos de conteúdo são essenciais para o seu negócio?
${answers.question_14 || 'Não respondido'}
`;

    const userPrompt = `
${clientContext}

${questionsAndAnswers}

Com base nas informações acima, crie uma ESTRATÉGIA GLOBAL DE MARKETING que seja clara, objetiva e acionável.
A estratégia deve ser atemporal (não vinculada a um período específico) e servir como guia principal para todas as ações de marketing do cliente.

Formate a estratégia em texto corrido, bem estruturado e organizado por tópicos principais.
Seja direto, prático e aplicável à realidade do negócio.
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

    console.log('Calling OpenAI API to generate strategy...');
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
            content: promptContent
          },
          { 
            role: 'user', 
            content: userPrompt 
          }
        ],
        max_completion_tokens: 4000,
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
      
      throw new Error('Erro ao gerar estratégia com OpenAI');
    }

    const aiData = await aiResponse.json();
    console.log('AI Response received');
    
    const strategyText = aiData.choices[0].message.content.trim();

    // Verificar se já existe uma estratégia para este cliente
    const { data: existingStrategy } = await supabase
      .from('strategies')
      .select('id')
      .eq('company_id', companyId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let strategyData;
    
    if (existingStrategy) {
      // Atualizar estratégia existente
      const { data, error: updateError } = await supabase
        .from('strategies')
        .update({
          strategy_text: strategyText,
          updated_at: new Date().toISOString(),
          status: 'Em elaboração'
        })
        .eq('id', existingStrategy.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating strategy:', updateError);
        throw new Error('Erro ao atualizar estratégia');
      }
      strategyData = data;
    } else {
      // Criar nova estratégia
      const { data, error: insertError } = await supabase
        .from('strategies')
        .insert({
          company_id: companyId,
          tenant_id: tenantId,
          strategy_text: strategyText,
          status: 'Em elaboração'
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating strategy:', insertError);
        throw new Error('Erro ao criar estratégia');
      }
      strategyData = data;
    }

    console.log('Strategy generated successfully:', strategyData.id);
    
    return new Response(
      JSON.stringify({ 
        strategyId: strategyData.id,
        strategyText: strategyText
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-strategy function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
