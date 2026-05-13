import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type LearningStatus = 'meaningful' | 'none' | 'ambiguous';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { card, reason, clientId, tenantId } = await req.json();
    console.log('[reevaluate-card] Reevaluating client:', clientId, '| reason:', reason);

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

    const defaultReevalPrompt = `Você é um especialista em marketing digital. Sua tarefa é DUPLA:

A) Reavaliar e melhorar um card de conteúdo reprovado.
B) Avaliar honestamente se o motivo da reprovação contém um APRENDIZADO PERMANENTE e GENERALIZÁVEL sobre o cliente, que deva ser incorporado nas "Exigências de Conteúdo" (instrução para todas as próximas gerações).

Você DEVE retornar APENAS um JSON válido com esta estrutura:
{
  "updatedCard": { "titulo": "...", "tipo": "...", "canal": "...", "objetivo": "...", "conteudo": "...", "data_sugerida": "...", "cta_recomendado": "...", "instrucoes_de_producao": "..." },
  "learningStatus": "meaningful" | "none" | "ambiguous",
  "learningReasoning": "<1-2 frases explicando por que classificou assim>",
  "requirementsProposal": {
    "proposed": "<TEXTO COMPLETO das exigências>",
    "additions": "<apenas as linhas novas, uma por linha, ou string vazia>"
  }
}

REGRAS RÍGIDAS para learningStatus:
- "meaningful": o motivo descreve uma regra/restrição/preferência que vale para FUTUROS conteúdos do cliente (ex.: "sempre mencionar atendimento 24h", "nunca usar emojis", "evitar termos técnicos"). Nesse caso, 'proposed' = exigências atuais + novas linhas; 'additions' = só as linhas novas (cada uma começando com "- ").
- "none": o motivo é PONTUAL e só vale para este card (ex.: "este título ficou ruim", "trocar a imagem por outra", "está confuso"). Nesse caso, 'proposed' = exigências atuais sem alteração; 'additions' = "".
- "ambiguous": você não consegue decidir com confiança (motivo vago demais ou pode ser interpretado dos dois jeitos). Nesse caso, 'proposed' = exigências atuais; 'additions' = "" e o frontend perguntará ao usuário.

REGRAS RÍGIDAS para 'proposed' quando learningStatus = "meaningful":
- DEVE conter o texto atual de "EXIGÊNCIAS ATUAIS" na íntegra, palavra por palavra, sem reescrever, traduzir ou reformatar.
- Apenas ACRESCENTE ao final novas linhas com a regra aprendida.
- Cada nova linha deve começar com "- " e ser uma frase curta, objetiva, generalizável (não específica a este card).
- NUNCA remova, edite ou reordene linhas existentes.

Não inclua nenhum texto fora do JSON.`;

    const reevalPrompt = systemPrompt?.prompt_content || defaultReevalPrompt;

    // 2-4. Fetch context
    const [{ data: strategy }, { data: anamnesis }, { data: company }] = await Promise.all([
      supabase.from('strategies').select('strategy_text').eq('company_id', clientId).eq('status', 'Ativa').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('question_sessions').select('questions, answers').eq('company_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('tenant_companies').select('name, fantasy_name, sector, size, products_services, content_requirements').eq('id', clientId).single(),
    ]);

    const currentRequirements = (company?.content_requirements || '').trim();
    console.log('[reevaluate-card] currentRequirements length:', currentRequirements.length);

    // 5. Fetch OpenAI key
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys').select('key_value').eq('key_name', 'OPENAI_API_KEY').single();

    if (apiKeyError || !apiKeyData) {
      throw new Error('Chave da API OpenAI não configurada. Configure em Dev → APIs');
    }

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
${JSON.stringify(card, null, 2)}

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

## EXIGÊNCIAS ATUAIS DO CLIENTE (preserve 100% deste texto em 'proposed' quando learningStatus = "meaningful"):
${currentRequirements || '(vazio)'}

Reestruture o card reprovado E classifique o aprendizado conforme as regras.
Retorne APENAS o JSON descrito.
`;

    console.log('[reevaluate-card] Calling OpenAI...');
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
      console.error('[reevaluate-card] OpenAI error:', aiResponse.status, errorText);
      throw new Error(`Erro na API OpenAI: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    console.log('[reevaluate-card] AI raw content:', content);

    if (!content) {
      console.error('[reevaluate-card] Empty AI response:', JSON.stringify(aiData));
      throw new Error('Resposta vazia da IA');
    }

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[reevaluate-card] Parse error. Content was:', content);
      throw new Error('Erro ao processar resposta da IA');
    }

    // updatedCard (with backwards compat for flat shape)
    let updatedCard = parsed.updatedCard;
    if (!updatedCard && (parsed.titulo || parsed.tipo || parsed.conteudo)) {
      updatedCard = parsed;
    }
    if (!updatedCard) {
      console.error('[reevaluate-card] No updatedCard found in:', parsed);
      throw new Error('IA não retornou um card atualizado');
    }

    // Classify learning
    let learningStatus: LearningStatus =
      parsed.learningStatus === 'meaningful' || parsed.learningStatus === 'none' || parsed.learningStatus === 'ambiguous'
        ? parsed.learningStatus
        : 'ambiguous';

    const proposalRaw = parsed.requirementsProposal || {};
    const proposedRaw = typeof proposalRaw.proposed === 'string' ? proposalRaw.proposed.trim() : '';
    const additionsRaw = typeof proposalRaw.additions === 'string' ? proposalRaw.additions.trim() : '';

    let proposed = proposedRaw || currentRequirements;
    let additions = additionsRaw;

    // Coherence checks per status
    if (learningStatus === 'meaningful') {
      // Must preserve current text and have actual additions.
      if (currentRequirements && !proposed.includes(currentRequirements)) {
        console.warn('[reevaluate-card] meaningful but proposed dropped current text — rebuilding from additions');
        proposed = additions ? `${currentRequirements}\n${additions}` : currentRequirements;
      }
      const trulyAdded = proposed.trim() !== currentRequirements.trim() || additions.length > 0;
      if (!trulyAdded) {
        console.warn('[reevaluate-card] meaningful but no real additions — downgrading to ambiguous');
        learningStatus = 'ambiguous';
      }
    } else if (learningStatus === 'none') {
      proposed = currentRequirements;
      additions = '';
    } else {
      // ambiguous: keep current, no additions; frontend will ask user
      proposed = currentRequirements;
      additions = '';
    }

    const responseBody = {
      success: true,
      updatedCard,
      learningStatus,
      learningReasoning: typeof parsed.learningReasoning === 'string' ? parsed.learningReasoning : '',
      requirementsProposal: {
        current: currentRequirements,
        proposed,
        additions,
      },
    };

    console.log('[reevaluate-card] Done. learningStatus:', learningStatus, '| additions length:', additions.length);
    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[reevaluate-card] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
