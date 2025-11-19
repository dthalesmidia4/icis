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
    const { companyId, strategyId, tenantId, selectedMonth } = await req.json();
    console.log('Generating plan for:', { companyId, strategyId, tenantId, selectedMonth });

    // Validar parâmetros obrigatórios
    if (!selectedMonth) {
      throw new Error('O mês de referência é obrigatório para gerar o plano');
    }

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

    // Obter data atual
    const now = new Date();
    
    // Parse do mês selecionado (formato YYYY-MM)
    const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
    const selectedDate = new Date(selectedYear, selectedMonthNum - 1, 1);
    const selectedMonthName = selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    
    // Determinar o contexto temporal baseado no mês selecionado
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonthNum === (now.getMonth() + 1);
    const diaAtual = isCurrentMonth ? now.getDate() : 1;
    const mesAtual = selectedMonthNum - 1;
    const anoAtual = selectedYear;
    
    // Calcular primeiro e último dia válidos do mês selecionado
    const primeiroDiaValido = isCurrentMonth 
      ? now.toISOString().split('T')[0]
      : `${selectedYear}-${String(selectedMonthNum).padStart(2, '0')}-01`;
    const ultimoDiaMes = new Date(selectedYear, selectedMonthNum, 0).getDate();
    const ultimoDiaValido = `${selectedYear}-${String(selectedMonthNum).padStart(2, '0')}-${String(ultimoDiaMes).padStart(2, '0')}`;
    const diasRestantes = ultimoDiaMes - diaAtual + 1;

    // Preparar contexto completo para a IA
    const context = `
╔════════════════════════════════════════════════════════════════════════════╗
║                    ⚠️  ATENÇÃO: REGRAS DE DATAS ⚠️                         ║
╚════════════════════════════════════════════════════════════════════════════╝

📅 CONTEXTO TEMPORAL CRÍTICO:
- DATA ATUAL: ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- MÊS SELECIONADO: ${selectedMonthName}
- ANO: ${anoAtual}
- PRIMEIRO DIA VÁLIDO: ${primeiroDiaValido}
- ÚLTIMO DIA VÁLIDO: ${ultimoDiaValido}
- DIAS DISPONÍVEIS: ${diasRestantes} dias

🚨 REGRAS OBRIGATÓRIAS PARA O PLANO:
1. NUNCA mencione ou sugira ações para datas anteriores a ${primeiroDiaValido}
2. Todas as recomendações devem considerar que há ${diasRestantes} dias disponíveis
3. Ao sugerir cronogramas ou distribuição de tarefas, comece SEMPRE a partir de ${primeiroDiaValido}
4. ${isCurrentMonth ? `Hoje é dia ${diaAtual}. Se mencionar semanas, recalcule a partir de hoje, não do dia 01` : 'Este é um mês futuro, pode usar o mês completo para planejamento'}
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

MÊS DE REFERÊNCIA PARA O CRONOGRAMA: ${selectedMonthName}

🎯 DIRETRIZES FINAIS PARA O PLANO:
- Use EXATAMENTE o mês de referência "${selectedMonthName}" para criar o cronograma
- Período válido: de ${primeiroDiaValido} até ${ultimoDiaValido}
- Você tem ${diasRestantes} dias disponíveis para planejar
- Seja específico e realista considerando o tempo real disponível
- Distribua as ações de forma equilibrada nos dias válidos
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
        model: 'openai/gpt-5-mini',
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
- "A partir ${isCurrentMonth ? 'de hoje' : 'do início do mês'}, nos próximos ${diasRestantes} dias..."
- ${isCurrentMonth ? `"Na semana atual (a partir do dia ${diaAtual})..."` : '"Na primeira semana do mês..."'}
- "Nas próximas X semanas ${isCurrentMonth ? 'restantes' : ''} do mês..."

❌ ERRADO:
- ${isCurrentMonth ? `"Na primeira semana do mês..." (se essa semana já passou)` : '"Em datas anteriores ao início do mês"'}
- ${isCurrentMonth ? `"No início do mês..." (se já estamos no meio do mês)` : '"Qualquer menção a períodos inválidos"'}
- Qualquer menção a datas ou períodos anteriores a ${primeiroDiaValido}

Gere planos realistas, executáveis e que respeitem o tempo REALMENTE disponível.

╔════════════════════════════════════════════════════════════════════════════╗
║           📝 REGRAS DE FORMATAÇÃO E ORGANIZAÇÃO (OBRIGATÓRIO) 📝           ║
╚════════════════════════════════════════════════════════════════════════════╝

🎯 ESTRUTURA OBRIGATÓRIA:

O planejamento DEVE ser organizado em seções numeradas e formatadas corretamente.

1️⃣ IDENTIFICAÇÃO AUTOMÁTICA DE TÍTULOS:
- Sempre retorne o conteúdo dividido em seções principais numeradas: 1., 2., 3., etc.
- Cada seção deve ter um título claro e objetivo
- Os títulos devem ser detectados de forma inteligente com base no conteúdo gerado

2️⃣ ESTRUTURA DAS SEÇÕES (adapte se necessário):
- 1. Resumo Executivo
- 2. Estratégia Principal do Cliente
- 3. Objetivos do Mês
- 4. Público-Alvo
- 5. Análise de Conteúdo
- 6. Diretrizes Criativas
- 7. Plano Mensal / Cronograma
- 8. Recomendações Finais

Se alguma seção não fizer sentido, adapte ou renomeie, mas SEMPRE mantenha a estrutura numerada.

3️⃣ HIERARQUIA DE FORMATAÇÃO:
- Títulos de seção: ## 1. Resumo Executivo
- Subtítulos internos (quando necessário): ### Ações, ### Insights, ### Diretrizes
- NUNCA usar H1 (#)
- SEMPRE manter H2 (##) e H3 (###) no máximo

4️⃣ CONTEÚDO LIMPO E NAVEGÁVEL:
- Não usar markdown complexo, apenas títulos, listas e parágrafos
- Não usar negrito desnecessário
- Não retornar códigos, barras, aspas duplicadas, caracteres especiais ou marcações que quebrem a interface
- NUNCA misturar tudo em um texto contínuo — separar sempre em blocos claros

5️⃣ CONSISTÊNCIA NA NUMERAÇÃO:
- Nada de "## PLANO DE MARKETING:"
- Nada de duplicar títulos
- Evitar títulos longos demais
- Manter sempre: 1., 2., 3., etc.

6️⃣ FORMATO IDEAL PARA NAVEGAÇÃO:
Retorne SEMPRE neste padrão:

## 1. Título da Seção
conteúdo...

## 2. Título da Seção
conteúdo...

## 3. Título da Seção
conteúdo...

⚠️ CRÍTICO:
- Sem textos acima do primeiro título
- Sem textos soltos antes da primeira seção
- O conteúdo DEVE começar diretamente com "## 1."

7️⃣ LINGUAGEM:
- Clara, objetiva, profissional
- Focada em estratégia e marketing
- Evitar redundância
- Respeitar contexto do cliente e do mês selecionado

🎯 MISSÃO FINAL:
Retorne SEMPRE um planejamento estruturado, com seções numeradas corretamente e devidamente formatadas, permitindo que a interface navegue entre essas seções sem erro.

Nada fora do padrão.
Nada fora da hierarquia.
A saída deve ser consistentemente organizada toda vez.`
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
        plan_data: { metadata: { month: selectedMonth } },
        selected_month: selectedMonth,
        approved: false
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
