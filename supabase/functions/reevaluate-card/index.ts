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

    const defaultReevalPrompt = `Você é um especialista em marketing digital. Sua tarefa é reavaliar e melhorar um card de conteúdo que foi reprovado, e ao mesmo tempo extrair APRENDIZADO permanente sobre o cliente a partir do motivo da reprovação.

Você DEVE retornar APENAS um JSON válido com a seguinte estrutura:
{
  "updatedCard": { "titulo": "...", "tipo": "...", "canal": "...", "objetivo": "...", "conteudo": "...", "data_sugerida": "...", "cta_recomendado": "...", "instrucoes_de_producao": "..." },
  "requirementsProposal": {
    "proposed": "<TEXTO COMPLETO das exigências de conteúdo do cliente, contendo OBRIGATORIAMENTE 100% do texto atual SEM nenhuma alteração ou remoção, e adicionando ao final uma ou mais novas linhas começando com '- ' contendo a regra/restrição aprendida com este motivo de reprovação>",
    "additions": "<apenas a(s) linha(s) novas, uma por linha>"
  }
}

REGRAS RÍGIDAS para requirementsProposal:
- 'proposed' DEVE conter o texto atual de "EXIGÊNCIAS ATUAIS" na íntegra, palavra por palavra, sem reescrever, traduzir ou reformatar.
- Apenas ACRESCENTE ao final novas linhas com restrições/preferências aprendidas a partir do motivo da reprovação.
- Cada nova linha deve começar com "- " e ser uma frase curta, objetiva, generalizável (não específica a este card).
- Se o motivo da reprovação NÃO trouxer aprendizado generalizável, retorne 'proposed' igual ao texto atual e 'additions' como string vazia.
- NUNCA remova, edite ou reordene linhas existentes.

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

    // 4. Fetch client company data (incl. content_requirements)
    const { data: company } = await supabase
      .from('tenant_companies')
      .select('name, fantasy_name, sector, size, products_services, content_requirements')
      .eq('id', clientId)
      .single();

    const currentRequirements = (company?.content_requirements || '').trim();

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

## EXIGÊNCIAS ATUAIS DO CLIENTE (preserve 100% deste texto em 'proposed'):
${currentRequirements || '(vazio)'}

Reestruture o card reprovado E proponha o aprendizado para "Exigências de Conteúdo".
Retorne APENAS o JSON descrito (com 'updatedCard' e 'requirementsProposal').
`;

    console.log('Calling OpenAI API...');
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyData.key_value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: reevalPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      throw new Error(`Erro na API OpenAI: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      console.error('Empty AI response. Full response:', JSON.stringify(aiData));
      throw new Error('Resposta vazia da IA');
    }

    // Parse JSON from response
    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Error parsing AI response:', content);
      throw new Error('Erro ao processar resposta da IA');
    }

    // Backwards-compat: if model returned the flat shape (legacy), wrap it.
    let updatedCard = parsed.updatedCard;
    if (!updatedCard && (parsed.titulo || parsed.tipo || parsed.conteudo)) {
      updatedCard = parsed;
    }

    let requirementsProposal = parsed.requirementsProposal || null;

    // Safety net: enforce 100% preservation of current text on the server side.
    if (requirementsProposal && typeof requirementsProposal.proposed === 'string') {
      const proposed = requirementsProposal.proposed.trim();
      if (currentRequirements && !proposed.includes(currentRequirements)) {
        const additions = (requirementsProposal.additions || '').trim();
        const safeProposed = additions
          ? `${currentRequirements}\n${additions}`
          : currentRequirements;
        console.warn('Proposed text dropped current requirements — rebuilding from additions only.');
        requirementsProposal = {
          proposed: safeProposed,
          additions,
        };
      } else {
        requirementsProposal.proposed = proposed;
      }
    }

    if (!requirementsProposal) {
      requirementsProposal = { proposed: currentRequirements, additions: '' };
    }

    console.log('Card reevaluated successfully');
    return new Response(
      JSON.stringify({
        success: true,
        updatedCard,
        requirementsProposal: {
          current: currentRequirements,
          proposed: requirementsProposal.proposed,
          additions: requirementsProposal.additions || '',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Reevaluate error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
