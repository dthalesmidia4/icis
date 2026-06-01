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
    const { companyId, tenantId, solicitacaoCliente } = await req.json();

    if (!solicitacaoCliente || !solicitacaoCliente.trim()) {
      return new Response(
        JSON.stringify({ error: 'Descreva o que o cliente solicitou antes de continuar.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!companyId || !tenantId) {
      return new Response(
        JSON.stringify({ error: 'Cliente ou tenant não identificado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Estratégia Geral do Cliente
    const { data: strategy } = await supabase
      .from('strategies')
      .select('strategy_text')
      .eq('company_id', companyId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const estrategiaGeralCliente = strategy?.strategy_text?.trim();
    if (!estrategiaGeralCliente) {
      return new Response(
        JSON.stringify({ error: 'Cadastre a Estratégia Geral do cliente antes de gerar perguntas para a demanda planejada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Prompt do sistema (Gerador de perguntas)
    const { data: promptRow } = await supabase
      .from('system_prompts')
      .select('prompt_content')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'custom_prompt_1780339940303')
      .maybeSingle();

    const promptContent = promptRow?.prompt_content?.trim();
    if (!promptContent) {
      return new Response(
        JSON.stringify({ error: 'Prompt "Gerador de perguntas" (custom_prompt_1780339940303) não encontrado em Dev → Prompts.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. API key OpenAI
    const { data: apiKeyData } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    const openaiApiKey = apiKeyData?.key_value;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave da API OpenAI não configurada. Configure em Dev → APIs.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPrompt = `SOLICITAÇÃO DO CLIENTE:
${solicitacaoCliente}

ESTRATÉGIA GERAL DO CLIENTE:
${estrategiaGeralCliente}

Com base na solicitação acima e na estratégia geral do cliente, gere perguntas estratégicas personalizadas que ajudem a planejar essa demanda com qualidade. Não repita perguntas cuja resposta já foi fornecida pela solicitação. Retorne apenas as perguntas, numeradas, sem comentários adicionais.`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: promptContent },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI error:', aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições da OpenAI excedido. Tente novamente em instantes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Chave da API OpenAI inválida.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar perguntas com a OpenAI.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const rawText: string = aiData.choices?.[0]?.message?.content?.trim() ?? '';

    // Parse questions: split by line, keep non-empty
    const questions = rawText
      .split('\n')
      .map((l: string) => l.replace(/^\s*\d+[\).:\-]\s*/, '').trim())
      .filter((l: string) => l.length > 0);

    return new Response(
      JSON.stringify({ questions, rawText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('generate-demanda-questions error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Erro inesperado.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
