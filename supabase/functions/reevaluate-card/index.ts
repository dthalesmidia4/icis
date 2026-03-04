import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { card, reason, clientId, tenantId } = await req.json();
    console.log('Reevaluating card for client:', clientId, 'reason:', reason);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch reavaliação prompt
    const { data: systemPrompt } = await supabase
      .from('system_prompts')
      .select('prompt_content')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'reavaliacao_prompt')
      .maybeSingle();

    const defaultReevalPrompt = `Você é um especialista em marketing digital. Sua tarefa é reavaliar e melhorar um card de conteúdo que foi reprovado. 
Você deve manter o formato do card original mas melhorar o conteúdo com base no motivo da reprovação, na estratégia do cliente e no perfil do cliente.
Retorne APENAS um JSON válido com os campos: titulo, tipo, canal, objetivo, conteudo, data_sugerida, cta_recomendado, instrucoes_de_producao.
Não inclua nenhum texto fora do JSON.`;

    const reevalPrompt = systemPrompt?.prompt_content || defaultReevalPrompt;

    // 2. Fetch client strategy
    const { data: strategy } = await supabase
      .from('strategies')
      .select('strategy_text')
      .eq('company_id', clientId)
      .eq('status', 'Ativa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Fetch client anamnesis (question_sessions)
    const { data: anamnesis } = await supabase
      .from('question_sessions')
      .select('questions, answers')
      .eq('company_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Fetch client company data
    const { data: company } = await supabase
      .from('tenant_companies')
      .select('name, fantasy_name, sector, size, products_services')
      .eq('id', clientId)
      .single();

    // 5. Fetch OpenAI API key
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyError || !apiKeyData) {
      throw new Error('Chave da API OpenAI não configurada. Configure em Dev → APIs');
    }

    // Build user prompt
    const cardJson = JSON.stringify(card, null, 2);
    
    let anamnesisText = '';
    if (anamnesis) {
      const questions = Array.isArray(anamnesis.questions) ? anamnesis.questions : [];
      const answers = anamnesis.answers && typeof anamnesis.answers === 'object' ? anamnesis.answers : {};
      anamnesisText = questions.map((q: any, i: number) => {
        const answer = (answers as Record<string, string>)[`question_${i}`] || 'Não respondido';
        return `Pergunta: ${q.question || q}\nResposta: ${answer}`;
      }).join('\n\n');
    }

    const userPrompt = `
## CARD REPROVADO (que precisa ser melhorado):
${cardJson}

## MOTIVO DA REPROVAÇÃO:
${reason}

## DADOS DO CLIENTE:
- Nome: ${company?.fantasy_name || company?.name || 'N/A'}
- Setor: ${company?.sector || 'N/A'}
- Tamanho: ${company?.size || 'N/A'}
- Produtos/Serviços: ${company?.products_services || 'N/A'}

## ESTRATÉGIA DO CLIENTE:
${strategy?.strategy_text || 'Nenhuma estratégia cadastrada.'}

## ANAMNESE DO CLIENTE:
${anamnesisText || 'Nenhuma anamnese disponível.'}

Com base em todas essas informações, reestruture e melhore o card reprovado.
Retorne APENAS um JSON válido com os campos: titulo, tipo, canal, objetivo, conteudo, data_sugerida, cta_recomendado, instrucoes_de_producao.
`;

    console.log('Calling OpenAI API...');
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key_value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: reevalPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      throw new Error(`Erro na API OpenAI: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    // Parse JSON from response
    let updatedCard;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        updatedCard = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', content);
      throw new Error('Erro ao processar resposta da IA');
    }

    console.log('Card reevaluated successfully');
    return new Response(JSON.stringify({ success: true, updatedCard }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reevaluate error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
