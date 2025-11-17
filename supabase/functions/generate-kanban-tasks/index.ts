import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Task {
  titulo: string;
  status: string;
  data_publicacao: string;
  local_arquivo: string;
  descricao: string;
  observacoes: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { planId } = await req.json();

    if (!planId) {
      throw new Error('planId is required');
    }

    // Inicializar Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar o plano aprovado com todos os dados necessários
    const { data: plan, error: planError } = await supabase
      .from('marketing_plans')
      .select(`
        *, 
        tenant_companies(
          name, 
          sector, 
          products_services, 
          size, 
          cnpj_cpf,
          email,
          phone
        )
      `)
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      console.error('Error fetching plan:', planError);
      throw new Error('Plano não encontrado');
    }

    if (!plan.approved) {
      throw new Error('Plano não está aprovado');
    }

    // Verificar se já existem cards para este plano
    const { data: existingCards } = await supabase
      .from('cards')
      .select('id')
      .eq('plan_id', planId)
      .limit(1);

    if (existingCards && existingCards.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Cards já foram gerados para este plano',
          cardsCreated: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const planContent = plan.plan_content || '';
    const companyData = plan.tenant_companies || {};
    
    // Buscar estratégia associada se houver
    let strategyText = '';
    if (plan.strategy_id) {
      const { data: strategy } = await supabase
        .from('strategies')
        .select('strategy_text, name, period_start, period_end')
        .eq('id', plan.strategy_id)
        .single();
      
      if (strategy) {
        strategyText = strategy.strategy_text || '';
      }
    }
    
    // Buscar respostas das perguntas guias se houver
    let answersText = '';
    if (plan.strategy_id) {
      const { data: questionSession } = await supabase
        .from('question_sessions')
        .select('questions, answers')
        .eq('strategy_id', plan.strategy_id)
        .single();
      
      if (questionSession && questionSession.questions && questionSession.answers) {
        const questions = questionSession.questions as any[];
        const answers = questionSession.answers as Record<string, any>;
        
        answersText = '\n\n## PERGUNTAS E RESPOSTAS DO CLIENTE:\n';
        questions.forEach((q: any, index: number) => {
          const answer = answers[`question_${index}`] || 'Sem resposta';
          answersText += `\nPergunta: ${q.question}\nResposta: ${answer}\n`;
        });
      }
    }
    
    // Determinar o mês de referência (sempre o mês atual)
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const mesReferencia = hoje.toISOString().slice(0, 7); // YYYY-MM formato
    const mesReferenciaFormatado = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    
    // Calcular primeiro e último dia válidos do mês
    const primeiroDiaValido = hoje.toISOString().split('T')[0]; // Data atual (nunca antes)
    const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const ultimoDiaValido = `${mesReferencia}-${String(ultimoDiaMes).padStart(2, '0')}`;

    // Prompt para o ChatGPT
    const systemPrompt = `Você é um planner de marketing profissional especializado em criar cronogramas de conteúdo executáveis, contextuais e altamente específicos.

╔════════════════════════════════════════════════════════════════════════════╗
║                    ⚠️  REGRAS DE DATAS (NÃO NEGOCIÁVEL) ⚠️                  ║
╚════════════════════════════════════════════════════════════════════════════╝

🚨 REGRA PRINCIPAL ABSOLUTA:
O sistema NUNCA, EM HIPÓTESE ALGUMA, pode gerar tarefas com datas passadas.
Esta regra é OBRIGATÓRIA e INVIOLÁVEL.

📅 CONTEXTO TEMPORAL OBRIGATÓRIO:
- Data atual REAL: ${hoje.toISOString().split('T')[0]} (dia ${diaAtual} do mês)
- Mês de referência: ${mesReferenciaFormatado}
- Primeiro dia VÁLIDO para tarefas: ${primeiroDiaValido}
- Último dia VÁLIDO para tarefas: ${ultimoDiaValido}

🎯 REGRAS DE DISTRIBUIÇÃO DE DATAS:

1️⃣ SE O MÊS DE REFERÊNCIA FOR O MÊS ATUAL:
   ✅ OBRIGATÓRIO: Começar as tarefas a partir de HOJE (${primeiroDiaValido})
   ❌ PROIBIDO: Usar qualquer data anterior a ${primeiroDiaValido}
   ❌ PROIBIDO: Gerar tarefas nos dias ${diaAtual > 1 ? `01 a ${String(diaAtual - 1).padStart(2, '0')}` : 'anteriores'}
   
2️⃣ RECALCULAR SEMANAS COM BASE NO DIA ATUAL:
   ❌ ERRADO: Semana 1 começando no dia 01 (se dia 01 já passou)
   ✅ CORRETO: Semana 1 começando no primeiro dia VÁLIDO (${primeiroDiaValido})
   
   Exemplo:
   - Se hoje é dia ${diaAtual}, a Semana 1 vai de ${primeiroDiaValido} até ${diaAtual + 6 <= ultimoDiaMes ? new Date(anoAtual, mesAtual, diaAtual + 6).toISOString().split('T')[0] : ultimoDiaValido}
   - Nunca use datas que já passaram para definir o início da semana

3️⃣ DISTRIBUIÇÃO INTELIGENTE:
   - Analise quantos dias ÚTEIS restam no mês (de hoje até o fim)
   - Distribua as tarefas apenas nesses dias válidos
   - Considere dias úteis (segunda a sexta) preferencialmente
   - Evite sobrecarga: máximo 2-3 tarefas por dia
   - Respeite sequência lógica: pesquisa → criação → revisão → publicação

4️⃣ VALIDAÇÃO OBRIGATÓRIA DE CADA DATA:
   Antes de atribuir uma data a uma tarefa, verifique:
   ✓ A data está entre ${primeiroDiaValido} e ${ultimoDiaValido}?
   ✓ A data não é anterior ao dia atual (${primeiroDiaValido})?
   ✓ A data está em dia útil ou faz sentido para o tipo de tarefa?
   
   Se qualquer resposta for NÃO, ajuste a data para o próximo dia válido.

5️⃣ PROIBIÇÕES ABSOLUTAS:
   ❌ NUNCA use templates com datas fixas sem validação
   ❌ NUNCA reconstrua cronogramas históricos
   ❌ NUNCA gere tarefas em datas impossíveis
   ❌ NUNCA ignore a data atual ao calcular semanas
   ❌ NUNCA comece cronogramas no dia 01 se esse dia já passou

REGRAS CRÍTICAS PARA GERAÇÃO DE TAREFAS:

1. ESPECIFICIDADE OBRIGATÓRIA:
   ❌ PROIBIDO: Tarefas genéricas como "fazer stories", "postar no Instagram", "criar conteúdo", "publicar reels"
   ✅ OBRIGATÓRIO: Tarefas específicas e contextuais como:
   - "Criar stories destacando a nova bebida de pistache com foco no público de 20 a 40 anos"
   - "Publicar vídeo demonstrando o preparo da bebida X"
   - "Criar carrossel sobre os benefícios do produto Y para o público Z"
   - "Produzir foto para campanha gourmet destacando ingrediente premium"

2. USO OBRIGATÓRIO DE TODO O CONTEXTO:
   Você DEVE utilizar TODAS as seguintes informações para criar cada tarefa:
   - Dados cadastrais da empresa (setor, produtos/serviços, tamanho)
   - Estratégia definida
   - Perguntas e respostas fornecidas pelo cliente
   - Público-alvo específico
   - Produto prioritário
   - Objetivos do mês
   - Canais escolhidos
   - Estilo de conteúdo desejado

3. ESTRUTURA DE CADA TAREFA:
   - titulo: Curto e objetivo (máximo 60 caracteres)
   - descricao: Clara, direcionada ao conteúdo específico (2-3 frases)
   - data_publicacao: Data válida no formato YYYY-MM-DD (dentro do mês de referência, após a data atual)
   - local_arquivo: Formato recomendado (story, reel, post, vídeo, foto, carrossel, campanha) + plataforma
   - observacoes: Detalhes técnicos, hashtags sugeridas, call-to-action, horário ideal
   - status: Sempre "a fazer"

4. INTELIGÊNCIA TEMPORAL:
   - Analise o tempo restante no mês
   - Distribua tarefas em dias úteis
   - Considere sequência lógica (pesquisa → criação → revisão → publicação)
   - Espaçamento adequado entre posts similares

5. QUANTIDADE:
   - Gere entre 10 a 20 tarefas dependendo da complexidade do plano
   - Priorize qualidade e especificidade sobre quantidade

FORMATO DE SAÍDA (JSON):
{
  "tarefas": [
    {
      "titulo": "Título específico e objetivo",
      "status": "a fazer",
      "data_publicacao": "YYYY-MM-DD",
      "local_arquivo": "Formato + Plataforma (ex: Story Instagram, Reel TikTok)",
      "descricao": "Descrição detalhada do que será feito, incluindo tema específico",
      "observacoes": "Detalhes técnicos, hashtags, horário sugerido, call-to-action"
    }
  ]
}

IMPORTANTE: Retorne APENAS o JSON válido, sem texto adicional antes ou depois.`;

    const userPrompt = `Com base em TODOS os dados abaixo, crie um cronograma de tarefas ALTAMENTE CONTEXTUAL e ESPECÍFICO:

## DADOS CADASTRAIS DA EMPRESA:
- Nome: ${companyData.name || 'Não informado'}
- Setor: ${companyData.sector || 'Não informado'}
- Produtos/Serviços: ${companyData.products_services || 'Não informado'}
- Tamanho: ${companyData.size || 'Não informado'}
- Mês de Referência: ${mesReferenciaFormatado}

## ESTRATÉGIA DEFINIDA:
${strategyText || 'Estratégia não definida'}

## PLANO DETALHADO:
${planContent}
${answersText}

🚨 ATENÇÃO CRÍTICA SOBRE DATAS:
- Hoje é ${primeiroDiaValido} - NENHUMA tarefa pode ter data anterior a esta
- Mês de referência: ${mesReferenciaFormatado}
- Período VÁLIDO para tarefas: de ${primeiroDiaValido} até ${ultimoDiaValido}
- Dias já passados (NÃO USAR): ${diaAtual > 1 ? `01/${mesAtual + 1} até ${String(diaAtual - 1).padStart(2, '0')}/${mesAtual + 1}` : 'Nenhum'}
- Dias disponíveis: ${ultimoDiaMes - diaAtual + 1} dias

IMPORTANTE: 
- Use TODOS esses dados para criar tarefas específicas
- Cada tarefa deve refletir o contexto real do negócio
- Nenhuma tarefa pode ser genérica
- TODAS as datas DEVEM estar entre ${primeiroDiaValido} e ${ultimoDiaValido}
- Distribua as tarefas nos ${ultimoDiaMes - diaAtual + 1} dias disponíveis do mês`;

    // Chamar Lovable AI
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log('Chamando Lovable AI para gerar tarefas...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Limite de requisições atingido. Tente novamente em alguns instantes.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Créditos insuficientes. Adicione créditos ao workspace.');
      }
      
      throw new Error('Erro ao processar com IA');
    }

    const aiData = await aiResponse.json();
    const generatedContent = aiData.choices?.[0]?.message?.content;

    if (!generatedContent) {
      throw new Error('IA não retornou conteúdo');
    }

    console.log('Conteúdo gerado pela IA:', generatedContent);

    // Parse do JSON retornado
    let tasks: Task[] = [];
    try {
      // Remover markdown code blocks se existirem
      let cleanContent = generatedContent.trim();
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const parsedData = JSON.parse(cleanContent);
      tasks = parsedData.tarefas || parsedData.tasks || [];
    } catch (parseError) {
      console.error('Erro ao fazer parse do JSON:', parseError);
      console.error('Conteúdo recebido:', generatedContent);
      throw new Error('Erro ao processar resposta da IA');
    }

    if (!tasks || tasks.length === 0) {
      throw new Error('Nenhuma tarefa foi gerada');
    }

    console.log(`Gerando ${tasks.length} tarefas...`);

    // Criar os cards no banco de dados
    const cardsToInsert = tasks.map((task) => ({
      title: task.titulo,
      status: 'unassigned',
      column_name: 'Planejamento Automatizado',
      publication_date: task.data_publicacao,
      file_location: task.local_arquivo || 'Aguardando material',
      description: task.descricao,
      observations: task.observacoes || '',
      plan_id: planId,
      tenant_id: plan.tenant_id,
      responsible_name: null,
    }));

    const { data: insertedCards, error: insertError } = await supabase
      .from('cards')
      .insert(cardsToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting cards:', insertError);
      throw new Error('Erro ao salvar tarefas no banco de dados');
    }

    console.log(`${insertedCards?.length || 0} cards criados com sucesso`);

    return new Response(
      JSON.stringify({
        success: true,
        cardsCreated: insertedCards?.length || 0,
        message: `${insertedCards?.length || 0} tarefas geradas com sucesso!`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-kanban-tasks:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});