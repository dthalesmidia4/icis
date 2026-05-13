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

    // Fetch context (strategy, anamnesis, company)
    const [{ data: strategy }, { data: anamnesis }, { data: company }] = await Promise.all([
      supabase.from('strategies').select('strategy_text').eq('company_id', clientId).eq('status', 'Ativa').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('question_sessions').select('questions, answers').eq('company_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('tenant_companies').select('name, fantasy_name, sector, size, products_services, content_requirements').eq('id', clientId).single(),
    ]);

    const currentRequirements = (company?.content_requirements || '').trim();
    console.log('[reevaluate-card] currentRequirements length:', currentRequirements.length);

    // Fetch OpenAI key
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys').select('key_value').eq('key_name', 'OPENAI_API_KEY').single();

    if (apiKeyError || !apiKeyData) {
      throw new Error('Chave da API OpenAI não configurada. Configure em Dev → APIs');
    }
    const openaiKey = apiKeyData.key_value;

    let anamnesisText = '';
    if (anamnesis) {
      const questions = Array.isArray(anamnesis.questions) ? anamnesis.questions : [];
      const answers = anamnesis.answers && typeof anamnesis.answers === 'object' ? anamnesis.answers : {};
      anamnesisText = questions.map((q: any, i: number) => {
        const answer = (answers as Record<string, string>)[`question_${i}`] || 'Não respondido';
        return `Pergunta: ${q.question || q}\nResposta: ${answer}`;
      }).join('\n\n');
    }

    const clientCtx = `
## DADOS DO CLIENTE:
- Nome: ${company?.fantasy_name || company?.name || 'N/A'}
- Setor: ${company?.sector || 'N/A'}
- Tamanho: ${company?.size || 'N/A'}
- Produtos/Serviços: ${company?.products_services || 'N/A'}

## ESTRATÉGIA DO CLIENTE:
${strategy?.strategy_text || 'Nenhuma estratégia cadastrada.'}

## ANAMNESE DO CLIENTE:
${anamnesisText || 'Nenhuma anamnese disponível.'}

## EXIGÊNCIAS ATUAIS DO CLIENTE:
${currentRequirements || '(vazio)'}
`;

    // ============== CALL A: Reescrever o card ==============
    const cardSystem = `Você é um especialista em marketing digital. Sua tarefa é reescrever um card de conteúdo reprovado, melhorando-o conforme o motivo da reprovação e o contexto do cliente. Retorne APENAS um JSON válido com a estrutura: { "titulo": "...", "tipo": "...", "canal": "...", "objetivo": "...", "conteudo": "...", "data_sugerida": "...", "cta_recomendado": "...", "instrucoes_de_producao": "..." }. Nada além do JSON.`;

    const cardUser = `## CARD REPROVADO:\n${JSON.stringify(card, null, 2)}\n\n## MOTIVO DA REPROVAÇÃO:\n${reason}\n${clientCtx}\n\nReescreva o card melhorando-o conforme o motivo. Retorne APENAS o JSON.`;

    console.log('[reevaluate-card] Call A: rewriting card...');
    const callA = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: cardSystem },
          { role: 'user', content: cardUser },
        ],
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!callA.ok) {
      const t = await callA.text();
      console.error('[reevaluate-card] Call A error:', callA.status, t);
      throw new Error(`Erro OpenAI (card): ${callA.status}`);
    }
    const cardData = await callA.json();
    const cardContent = cardData.choices?.[0]?.message?.content;
    console.log('[reevaluate-card] Call A raw:', cardContent);

    let updatedCard: any;
    try {
      updatedCard = JSON.parse(cardContent);
      // unwrap if nested
      if (updatedCard.updatedCard) updatedCard = updatedCard.updatedCard;
    } catch (e) {
      console.error('[reevaluate-card] Call A parse error');
      throw new Error('Erro ao processar reescrita do card');
    }

    // ============== CALL B: Avaliar aprendizado (json_schema strict) ==============
    const learningSystem = `Você analisa motivos de reprovação de conteúdo para identificar APRENDIZADOS PERMANENTES sobre um cliente.

REGRAS:
- "meaningful": o motivo descreve uma regra/restrição/preferência que vale para FUTUROS conteúdos do cliente em geral (ex.: "sempre se aprofundar em uma área", "nunca usar emojis", "evitar termos técnicos", "sempre incluir CTA de WhatsApp"). Devolva 1+ linhas em "additions", cada uma começando com "- " e sendo uma frase curta e generalizável.
- "none": o motivo é PONTUAL e só vale para este card específico (ex.: "este título ficou ruim", "trocar a imagem", "está confuso"). additions = "".
- "ambiguous": realmente impossível decidir (motivo vago como "não gostei", "refazer"). additions = "".

Seja generoso na classificação "meaningful": se o motivo expressa uma preferência ou padrão que faz sentido aplicar nas próximas gerações, classifique como meaningful.`;

    const learningUser = `## EXIGÊNCIAS ATUAIS DO CLIENTE:\n${currentRequirements || '(vazio)'}\n\n## MOTIVO DA REPROVAÇÃO:\n${reason}\n\n## CONTEXTO DO CLIENTE:\n- Setor: ${company?.sector || 'N/A'}\n- Produtos/Serviços: ${company?.products_services || 'N/A'}\n\nClassifique este motivo conforme as regras e devolva o JSON.`;

    console.log('[reevaluate-card] Call B: evaluating learning...');
    const callB = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: learningSystem },
          { role: 'user', content: learningUser },
        ],
        max_tokens: 500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'learning_evaluation',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['learningStatus', 'learningReasoning', 'additions'],
              properties: {
                learningStatus: { type: 'string', enum: ['meaningful', 'none', 'ambiguous'] },
                learningReasoning: { type: 'string' },
                additions: { type: 'string', description: 'Linhas novas no formato "- frase", uma por linha. Vazio se não houver aprendizado.' },
              },
            },
          },
        },
      }),
    });

    let learningStatus: LearningStatus = 'ambiguous';
    let learningReasoning = '';
    let additions = '';

    if (!callB.ok) {
      const t = await callB.text();
      console.error('[reevaluate-card] Call B error:', callB.status, t);
      // continue with fallback ambiguous
    } else {
      const learnData = await callB.json();
      const learnContent = learnData.choices?.[0]?.message?.content;
      console.log('[reevaluate-card] Call B raw:', learnContent);
      try {
        const parsed = JSON.parse(learnContent);
        if (['meaningful', 'none', 'ambiguous'].includes(parsed.learningStatus)) {
          learningStatus = parsed.learningStatus;
        }
        learningReasoning = typeof parsed.learningReasoning === 'string' ? parsed.learningReasoning : '';
        additions = typeof parsed.additions === 'string' ? parsed.additions.trim() : '';
      } catch (e) {
        console.error('[reevaluate-card] Call B parse error');
      }
    }

    // Build proposed text
    let proposed = currentRequirements;
    if (learningStatus === 'meaningful' && additions) {
      proposed = currentRequirements ? `${currentRequirements}\n${additions}` : additions;
    } else if (learningStatus === 'meaningful' && !additions) {
      // Inconsistent: claimed meaningful but no additions — downgrade
      console.warn('[reevaluate-card] meaningful but no additions — downgrading to ambiguous');
      learningStatus = 'ambiguous';
    }

    const responseBody = {
      success: true,
      updatedCard,
      learningStatus,
      learningReasoning,
      requirementsProposal: {
        current: currentRequirements,
        proposed,
        additions,
      },
    };

    console.log('[reevaluate-card] Done.', {
      learningStatus,
      learningReasoning,
      additionsLen: additions.length,
      currentLen: currentRequirements.length,
      proposedLen: proposed.length,
      proposedPreview: proposed.slice(0, 200),
    });

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
