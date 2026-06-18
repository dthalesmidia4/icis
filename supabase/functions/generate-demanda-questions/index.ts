import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { companyId, tenantId, solicitacaoCliente } = await req.json();

    if (!solicitacaoCliente || !solicitacaoCliente.trim()) {
      return jsonResponse({ error: 'Descreva o que o cliente solicitou antes de continuar.' }, 400);
    }
    if (!companyId || !tenantId) {
      return jsonResponse({ error: 'Cliente ou tenant não identificado.' }, 400);
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
      return jsonResponse({ error: 'Cadastre a Estratégia Geral do cliente antes de gerar perguntas para a demanda planejada.' }, 400);
    }

    // 2. Prompt do sistema (Gerador de perguntas)
    const { data: promptRow } = await supabase
      .from('system_prompts')
      .select('prompt_content')
      .eq('tenant_id', tenantId)
      .eq('prompt_key', 'custom_prompt_1780342556676')
      .maybeSingle();

    const promptContent = promptRow?.prompt_content?.trim();
    if (!promptContent) {
      return jsonResponse({ error: 'Prompt "Gerador de perguntas" (custom_prompt_1780342556676) não encontrado em Dev → Prompts.' }, 400);
    }

    // 3. API key OpenAI
    const { data: apiKeyData } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    const openaiApiKey = apiKeyData?.key_value;
    if (!openaiApiKey) {
      return jsonResponse({ error: 'Chave da API OpenAI não configurada. Configure em Dev → APIs.' }, 500);
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
        return jsonResponse({ error: 'Limite de requisições da OpenAI excedido. Tente novamente em instantes.' }, 429);
      }
      if (aiResponse.status === 401) {
        return jsonResponse({ error: 'Chave da API OpenAI inválida.' }, 401);
      }
      return jsonResponse({ error: 'Erro ao gerar perguntas com a OpenAI.' }, 500);
    }

    const aiData = await aiResponse.json();
    const rawText: string = aiData.choices?.[0]?.message?.content?.trim() ?? '';

    // Parse questions: split by line, keep non-empty
    const questions = rawText
      .split('\n')
      .map((l: string) => l.replace(/^\s*\d+[\).:\-]\s*/, '').trim())
      .filter((l: string) => l.length > 0);

    return jsonResponse({ questions, rawText });
  } catch (err) {
    console.error('generate-demanda-questions error:', err);
    return jsonResponse({ error: (err as Error).message || 'Erro inesperado.' }, 500);
  }
});
