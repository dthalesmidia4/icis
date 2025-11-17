import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { marked } from "https://esm.sh/marked@11.1.1";

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

    // Obter data atual e calcular período válido
    const now = new Date();
    const diaAtual = now.getDate();
    const mesAtual = now.getMonth();
    const anoAtual = now.getFullYear();
    const currentMonth = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const currentYear = now.getFullYear();
    
    // Mês de referência é sempre o mês atual
    const referenceMonth = currentMonth;
    
    // Calcular primeiro e último dia válidos
    const primeiroDiaValido = now.toISOString().split('T')[0];
    const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const diasRestantes = ultimoDiaMes - diaAtual + 1;

    // Preparar contexto completo para a IA
    const context = `
╔════════════════════════════════════════════════════════════════════════════╗
║                    ⚠️  ATENÇÃO: REGRAS DE DATAS ⚠️                         ║
╚════════════════════════════════════════════════════════════════════════════╝

📅 CONTEXTO TEMPORAL CRÍTICO:
- DATA ATUAL: ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} (dia ${diaAtual})
- ANO ATUAL: ${currentYear}
- MÊS ATUAL: ${currentMonth}
- PRIMEIRO DIA VÁLIDO: ${primeiroDiaValido}
- DIAS RESTANTES NO MÊS: ${diasRestantes} dias

🚨 REGRAS OBRIGATÓRIAS PARA O PLANO:
1. NUNCA mencione ou sugira ações para datas que já passaram
2. Todas as recomendações devem considerar que só há ${diasRestantes} dias disponíveis
3. Ao sugerir cronogramas ou distribuição de tarefas, comece SEMPRE a partir de HOJE (${primeiroDiaValido})
4. Se mencionar semanas, recalcule-as a partir do dia ${diaAtual}, não do dia 01
5. Seja realista quanto ao tempo disponível para execução

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

MÊS DE REFERÊNCIA PARA O CRONOGRAMA: ${referenceMonth}

🎯 DIRETRIZES FINAIS PARA O PLANO:
- Use EXATAMENTE o mês de referência "${referenceMonth}" para criar o cronograma
- Todas as datas devem ser baseadas neste mês de ${currentYear}
- Comece SEMPRE a partir do dia ${diaAtual} (HOJE), nunca antes
- Você tem ${diasRestantes} dias disponíveis neste mês para planejar
- Seja específico e realista considerando o tempo real disponível
- Distribua as ações de forma equilibrada nos dias que ainda virão
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
            content: `Você é um especialista em marketing estratégico que cria planos de marketing detalhados e personalizados.

╔════════════════════════════════════════════════════════════════════════════╗
║              ⚠️  REGRAS CRÍTICAS DE DATAS (OBRIGATÓRIO) ⚠️                 ║
╚════════════════════════════════════════════════════════════════════════════╝

🚨 NUNCA mencione, sugira ou planeje ações para datas que já passaram.

📅 CONTEXTO TEMPORAL:
- Se hoje é dia ${diaAtual} do mês, você tem apenas ${diasRestantes} dias úteis disponíveis
- TODAS as recomendações, cronogramas e sugestões devem começar a partir de HOJE
- Se mencionar semanas, recalcule considerando que estamos no dia ${diaAtual}
- NUNCA use expressões como "Na primeira semana do mês" se essa semana já passou

✅ CORRETO:
- "A partir de hoje, nos próximos ${diasRestantes} dias..."
- "Na semana atual (a partir do dia ${diaAtual})..."
- "Nas próximas X semanas restantes do mês..."

❌ ERRADO:
- "Na primeira semana do mês..." (se essa semana já passou)
- "No início do mês..." (se já estamos no meio do mês)
- Qualquer menção a datas ou períodos anteriores ao dia ${diaAtual}

Gere planos realistas, executáveis e que respeitem o tempo REALMENTE disponível.`
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

    // Converter Markdown para HTML
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    const htmlContent = marked.parse(generatedPlan) as string;
    
    // Adicionar classes do Tailwind ao HTML
    const styledHtml = htmlContent
      .replace(/<p>\s*<\/p>/g, '')
      .replace(/<h1>/g, '<h1 class="text-3xl font-bold mb-4 mt-6">')
      .replace(/<h2>/g, '<h2 class="text-2xl font-bold mb-3 mt-5">')
      .replace(/<h3>/g, '<h3 class="text-xl font-semibold mb-2 mt-4">')
      .replace(/<p>/g, '<p class="mb-3 leading-relaxed">')
      .replace(/<ul>/g, '<ul class="list-disc ml-6 mb-3 space-y-1">')
      .replace(/<ol>/g, '<ol class="list-decimal ml-6 mb-3 space-y-1">')
      .replace(/<li>/g, '<li class="mb-1">')
      .replace(/<strong>/g, '<strong class="font-semibold">')
      .replace(/<em>/g, '<em class="italic">')
      .replace(/<blockquote>/g, '<blockquote class="border-l-4 border-primary pl-4 italic my-3">')
      .replace(/<hr>/g, '<hr class="my-6 border-t border-border">');

    // Salvar o plano gerado no banco de dados (já em HTML)
    const { data: savedPlan, error: savePlanError } = await supabase
      .from('marketing_plans')
      .insert({
        company_id: companyId,
        strategy_id: strategyId,
        tenant_id: tenantId,
        plan_content: styledHtml,
        plan_data: { metadata: { month: referenceMonth } }
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
        planContent: styledHtml 
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
