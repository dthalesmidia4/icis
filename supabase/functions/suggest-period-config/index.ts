import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const truncate = (v: unknown, n: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId, companyId, currentForm } = await req.json();
    if (!tenantId || !companyId) {
      throw new Error('tenantId e companyId são obrigatórios');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch context in parallel
    const [companyRes, strategyRes, sessionRes, lastPlansRes] = await Promise.all([
      supabase.from('tenant_companies').select('*').eq('id', companyId).maybeSingle(),
      supabase
        .from('strategies')
        .select('strategy_text')
        .eq('company_id', companyId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('question_sessions')
        .select('questions, answers')
        .eq('company_id', companyId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('period_plans')
        .select('period_title, period_start, period_end, priority_channel, objective, production_line, observations')
        .eq('company_id', companyId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const company: any = companyRes.data || {};
    const strategyText: string = (strategyRes.data as any)?.strategy_text || '';
    const session: any = sessionRes.data || {};
    const lastPlans: any[] = (lastPlansRes.data as any[]) || [];

    // Anamnese: named guidelines + short indexed QA
    const answers: Record<string, string> = (session?.answers && typeof session.answers === 'object') ? session.answers : {};
    const questions: string[] = Array.isArray(session?.questions)
      ? session.questions.map((q: any) => typeof q === 'string' ? q : (q?.question || String(q)))
      : [];

    const guidelineFields = [
      ['tone_of_voice', 'Tom de voz'],
      ['content_pillars', 'Pilares de conteúdo'],
      ['preferred_ctas', 'CTAs preferidos'],
      ['forbidden_words', 'Palavras proibidas'],
      ['active_channels', 'Canais ativos'],
      ['offer_and_ticket', 'Oferta e ticket'],
      ['main_competitors', 'Concorrentes'],
    ] as const;
    const guidelinesBlock = guidelineFields
      .map(([k, l]) => `- ${l}: ${truncate(answers[k] || '', 200) || '(não informado)'}`)
      .join('\n');

    const indexedQA = questions.slice(0, 12).map((q, i) => {
      const a = truncate(answers[`question_${i}`] || '', 160);
      return a ? `${i + 1}. ${truncate(q, 120)} → ${a}` : '';
    }).filter(Boolean).join('\n');

    const lastPlansBlock = lastPlans.map((p, i) => {
      const line = Array.isArray(p.production_line)
        ? p.production_line.map((x: any) => `${x.quantity} ${x.type}`).join(', ')
        : '';
      return `Plano ${i + 1}: "${truncate(p.period_title, 80)}" (${p.period_start} a ${p.period_end}) — canal: ${truncate(p.priority_channel, 60)}${line ? ` — mix: ${line}` : ''}`;
    }).join('\n') || '(sem planos anteriores)';

    const currentFormBlock = currentForm ? truncate(JSON.stringify(currentForm), 1200) : '(vazio)';

    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `Você é um estrategista de marketing sênior. A partir da estratégia, anamnese, dados da empresa e histórico de planos, sugira uma configuração inicial de período de planejamento de conteúdo.

Regras:
- Considere objetivo estratégico, capacidade de produção informada na anamnese, canais ativos e frequência histórica.
- Equilibre volume e qualidade. Se não houver dados suficientes, use padrões sensatos (30 dias, 10 conteúdos, mix 4:2:4 = 4 estáticos, 2 vídeos, 4 carrosséis).
- Prefira canais efetivamente ativos do cliente.
- Justificativa curta, direta, em português brasileiro.

Responda APENAS JSON válido (sem markdown, sem comentários), no formato:
{
  "period_title": "string curta",
  "period_days": 30,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "quantidade_conteudos": 10,
  "distribuicao": [
    {"type":"Post Estático","quantity":4},
    {"type":"Vídeos Curtos","quantity":2},
    {"type":"Carrossel","quantity":4}
  ],
  "canais_sugeridos": ["instagram"],
  "objetivos_sugeridos": ["Gerar vendas"],
  "objetivo_outro": "",
  "produto_foco": "",
  "justificativa": "1-3 frases explicando as escolhas"
}

Canais válidos (use exatamente esses ids): instagram, facebook, tiktok, youtube, linkedin.
Objetivos válidos: Gerar vendas, Atrair leads, Lançar produto, Crescer seguidores, Educar o mercado. Qualquer objetivo fora dessa lista deve ir em "objetivo_outro".`;

    const userPrompt = `Data de hoje: ${today}

EMPRESA
- Nome: ${truncate(company.name, 120)} (${truncate(company.fantasy_name || '', 120)})
- Setor: ${truncate(company.sector, 120)} | Porte: ${truncate(company.size, 80)}
- Produtos/serviços: ${truncate(company.products_services, 300)}

ESTRATÉGIA GLOBAL
${truncate(strategyText, 1400) || '(não definida)'}

DIRETRIZES ESTRATÉGICAS PARA IA
${guidelinesBlock}

RESPOSTAS DA ANAMNESE (resumo)
${indexedQA || '(sem respostas)'}

HISTÓRICO DE PLANOS RECENTES
${lastPlansBlock}

FORMULÁRIO ATUAL DO USUÁRIO (pode estar parcialmente preenchido — respeite quando fizer sentido)
${currentFormBlock}

Gere a sugestão de configuração seguindo o schema JSON.`;

    // Fetch OpenAI key (same pattern as generate-strategy / generate-period-plans)
    const { data: apiKeyData, error: apiKeyErr } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyErr || !apiKeyData) {
      throw new Error('OPENAI_API_KEY não configurada em Dev → APIs');
    }

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(apiKeyData as any).key_value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('OpenAI error:', aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite da OpenAI excedido. Tente novamente em instantes.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Erro ao gerar sugestão com OpenAI');
    }

    const aiData = await aiResponse.json();
    const raw = aiData?.choices?.[0]?.message?.content || '{}';
    let suggestion: any;
    try {
      suggestion = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      suggestion = match ? JSON.parse(match[0]) : {};
    }

    return new Response(JSON.stringify({ success: true, suggestion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('suggest-period-config error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
