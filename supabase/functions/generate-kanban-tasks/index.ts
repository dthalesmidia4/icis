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
          fantasy_name,
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
    // Buscar o plano do banco de dados para obter o período
    const { data: planData } = await supabase
      .from('marketing_plans')
      .select('periodo_titulo, periodo_data_inicio, periodo_data_fim')
      .eq('id', planId)
      .single();
    
    const periodTitle = planData?.periodo_titulo;
    const periodStartDate = planData?.periodo_data_inicio;
    const periodEndDate = planData?.periodo_data_fim;
    
    if (!periodTitle || !periodStartDate || !periodEndDate) {
      throw new Error('Período de referência não encontrado no plano');
    }
    
    // Parse do período selecionado
    const startDate = new Date(periodStartDate);
    const endDate = new Date(periodEndDate);
    
    // Determinar o contexto temporal baseado no período selecionado
    const hoje = new Date();
    const isPeriodStarted = hoje >= startDate;
    const diaAtual = isPeriodStarted ? hoje.getDate() : startDate.getDate();
    
    // Calcular primeiro e último dia válidos do período
    const primeiroDiaValido = isPeriodStarted 
      ? hoje.toISOString().split('T')[0]
      : periodStartDate;
    const ultimoDiaValido = periodEndDate;
    
    // Calcular dias restantes no período
    const diasRestantes = Math.ceil((endDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Prompt para o ChatGPT
    const systemPrompt = `Você é um planner de marketing profissional especializado em criar cronogramas de conteúdo executáveis, contextuais e altamente específicos.

╔════════════════════════════════════════════════════════════════════════════╗
║                    ⚠️  REGRAS DE DATAS (NÃO NEGOCIÁVEL) ⚠️                  ║
╚════════════════════════════════════════════════════════════════════════════╝

🚨 REGRA PRINCIPAL ABSOLUTA:
O sistema NUNCA, EM HIPÓTESE ALGUMA, pode gerar tarefas com datas passadas.
Esta regra é OBRIGATÓRIA e INVIOLÁVEL.

📅 CONTEXTO TEMPORAL OBRIGATÓRIO:
- Data atual REAL: ${hoje.toISOString().split('T')[0]} (dia ${diaAtual})
- Período de referência: ${periodTitle}
- Data de início do período: ${periodStartDate}
- Data de fim do período: ${periodEndDate}
- Primeiro dia VÁLIDO para tarefas: ${primeiroDiaValido}
- Último dia VÁLIDO para tarefas: ${ultimoDiaValido}
- Dias disponíveis no período: ${diasRestantes} dias

🎯 REGRAS DE DISTRIBUIÇÃO DE DATAS:

1️⃣ ${isPeriodStarted ? 'PERÍODO JÁ INICIADO - Começar a partir de HOJE:' : 'PERÍODO FUTURO - Pode usar o período completo:'}
   ✅ OBRIGATÓRIO: Começar as tarefas a partir de ${primeiroDiaValido}
   ❌ PROIBIDO: Usar qualquer data anterior a ${primeiroDiaValido}
   ${isPeriodStarted ? `❌ PROIBIDO: Gerar tarefas em datas já passadas` : '✅ PERMITIDO: Usar todo o período desde a data de início'}
   
2️⃣ RECALCULAR SEMANAS COM BASE NO DIA INICIAL VÁLIDO:
   ${isPeriodStarted ? `❌ ERRADO: Começar contagem no início do período se essa data já passou` : '✅ Pode começar no início do período'}
   ✅ CORRETO: Semana 1 começando no primeiro dia VÁLIDO (${primeiroDiaValido})
   
   Exemplo: A distribuição deve respeitar o intervalo de ${primeiroDiaValido} até ${ultimoDiaValido}

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

REGRAS CRÍTICAS PARA GERAÇÃO DE DEMANDAS:

🎯 IMPORTANTE: A partir de agora, chamaremos essas tarefas de "DEMANDAS".

1. ESPECIFICIDADE E CONTEXTO OBRIGATÓRIOS:
   ❌ PROIBIDO: Demandas genéricas como "fazer stories", "postar no Instagram", "criar conteúdo", "publicar reels"
   ✅ OBRIGATÓRIO: Demandas ultra-específicas e contextuais que demonstrem conhecimento profundo do negócio:
   - "Instagram Reel: Apresentar o novo sorvete de pistache com creme de avelã, focando em jovens adultos 20-35 anos que buscam experiências gourmet"
   - "LinkedIn Post: Compartilhar case de sucesso da consultoria tributária para e-commerce, destacando redução de impostos para o nicho de moda"
   - "Stories Instagram: Fazer tour pela cozinha mostrando processo artesanal de produção das bebidas premium da casa"

2. DESCRIÇÃO = BRIEFING COMPLETO OBRIGATÓRIO:
   A descrição DEVE ser um guia prático e acionável contendo:
   
   ✅ O QUE FAZER (conceito criativo específico):
   - Tema exato baseado nos produtos/serviços do cliente
   - Ângulo de abordagem considerando o público-alvo
   - Mensagem principal alinhada aos objetivos
   
   ✅ COMO FAZER (orientações práticas):
   - Elementos visuais sugeridos (cores, estilo, composição)
   - Tom de voz e linguagem apropriados
   - Estrutura do conteúdo (início, meio, fim / problema-solução)
   
   ✅ POR QUE FAZER (objetivo claro):
   - Qual resultado esperado (engajamento, conversão, awareness)
   - Como se conecta à estratégia maior
   
   ✅ SUGESTÕES CONCRETAS DE CONTEÚDO:
   - Temas específicos extraídos das respostas das perguntas guias
   - Produtos/serviços prioritários do cliente
   - Diferenciais competitivos identificados
   - Dores e desejos do público-alvo
   
   Exemplo de descrição COMPLETA:
   "Criar Reel de 30s mostrando o processo artesanal de preparo da bebida 'Pistache Dream'. ABERTURA: Close no pistache sendo triturado com música suave. MEIO: Mostrar camadas sendo montadas no copo transparente. FINALIZAÇÃO: Cliente provando e sorrindo. MENSAGEM: 'Cada detalhe pensado para sua experiência'. OBJETIVO: Gerar desejo pelo produto premium e destacar qualidade artesanal para público 25-40 anos classe A/B que valoriza experiências diferenciadas. CTA: 'Vem experimentar'."

3. USO OBRIGATÓRIO DE TODO O CONTEXTO DO CLIENTE:
   Você DEVE incorporar TODAS estas informações em cada demanda:
   - Nome e tipo do negócio
   - Setor de atuação e concorrentes
   - Produtos/serviços específicos (nome, características, diferenciais)
   - Tamanho da empresa e estrutura
   - Público-alvo detalhado (idade, classe, interesses, dores)
   - Objetivos declarados nas respostas
   - Produto prioritário mencionado
   - Tom de voz e identidade desejados
   - Canais preferidos
   - Restrições ou observações especiais
   - Temporada/sazonalidade relevante

3. ESTRUTURA DE CADA DEMANDA:
   - titulo: Curto, objetivo e específico (máximo 50 caracteres). Formato: "Plataforma: Tipo - Tema específico". Exemplo: "Instagram: Reel - Processo artesanal"
   
   - descricao: ⚠️ CAMPO MAIS IMPORTANTE - DEVE SER UM BRIEFING COMPLETO E ACIONÁVEL ⚠️
     Mínimo 4-6 frases estruturadas:
     
     [CONCEITO] O que criar e por quê (baseado nas respostas do cliente)
     [EXECUÇÃO] Como fazer - elementos visuais, estrutura, tom de voz
     [CONTEÚDO] Sugestões concretas de temas usando produtos/serviços reais do cliente
     [PÚBLICO] Para quem é direcionado (baseado nas respostas sobre público-alvo)
     [OBJETIVO] Resultado esperado (engajamento, conversão, awareness)
     [CTA] Call-to-action sugerido
     
     ✅ EXEMPLO CORRETO (observe a riqueza de detalhes e orientações):
     "Criar Reel de 45s apresentando o novo sorvete artesanal de Pistache com Creme de Avelã. ABERTURA: Close em pistaches sendo triturados manualmente, com música suave instrumental. DESENVOLVIMENTO: Mostrar as camadas sendo montadas no pote transparente, destacando a textura cremosa e os pedaços crocantes. FINALIZAÇÃO: Cliente degustando com expressão de satisfação. MENSAGEM: 'Cada colher é uma experiência gourmet'. DIRECIONADO para adultos 25-40 anos, classe A/B, que buscam experiências gastronômicas diferenciadas e valorizam qualidade artesanal. OBJETIVO: Gerar desejo pelo produto premium e posicionar a marca como referência em sorvetes gourmet. CTA: 'Experimente hoje, disponível por tempo limitado'."
     
     ❌ EXEMPLO ERRADO (vago e sem orientações):
     "Fazer reel sobre o novo sabor de sorvete. Mostrar o produto e colocar música."
   
   - data_publicacao: Data válida no formato YYYY-MM-DD (dentro do mês de referência, após a data atual)
   
   - local_arquivo: FORMATO + PLATAFORMA. Exemplos: "Reel Instagram", "Carrossel LinkedIn", "Post Facebook", "Story Instagram", "Vídeo YouTube", "E-mail Marketing"
   
   - observacoes: Detalhes técnicos complementares, hashtags estratégicas, melhor horário de publicação, dimensões recomendadas, duração exata, referências visuais
   
   - status: Sempre "a fazer"

4. INTELIGÊNCIA TEMPORAL:
   - Analise o tempo restante no mês
   - Distribua demandas em dias úteis
   - Considere sequência lógica (pesquisa → criação → revisão → publicação)
   - Espaçamento adequado entre posts similares
   - Considere sazonalidade e eventos relevantes do setor

5. QUANTIDADE E QUALIDADE:
   - Gere entre 12 a 20 demandas dependendo da complexidade do plano
   - Priorize QUALIDADE, ESPECIFICIDADE e ORIENTAÇÕES PRÁTICAS sobre quantidade
   - Cada demanda deve ser tão completa que o executor possa começar a trabalhar imediatamente sem precisar de esclarecimentos adicionais

FORMATO DE SAÍDA (JSON):
{
  "tarefas": [
    {
      "titulo": "Plataforma: Tipo - Tema específico do cliente",
      "status": "a fazer",
      "data_publicacao": "YYYY-MM-DD",
      "local_arquivo": "Tipo Plataforma (ex: Reel Instagram, Carrossel LinkedIn, Post Facebook)",
      "descricao": "⚠️ BRIEFING COMPLETO OBRIGATÓRIO ⚠️ - Mínimo 4-6 frases detalhadas contendo: [CONCEITO] O que criar com base no negócio real do cliente + [EXECUÇÃO] Como fazer (estrutura, visual, tom) + [CONTEÚDO] Sugestões específicas usando produtos/serviços reais + [PÚBLICO] Para quem (baseado nas respostas) + [OBJETIVO] Resultado esperado + [CTA] Call-to-action sugerido. Deve ter informações suficientes para execução imediata sem necessidade de esclarecimentos.",
      "observacoes": "Hashtags estratégicas sugeridas, melhor horário de publicação, especificações técnicas detalhadas (duração exata, formato, dimensões), referências visuais, tom de voz específico"
    }
  ]
}

⚠️ ATENÇÃO CRÍTICA: A descrição é o campo MAIS IMPORTANTE. Ela DEVE conter um briefing completo com orientações práticas e específicas que permitam execução imediata. Use TODO o contexto do cliente disponível.

IMPORTANTE: Retorne APENAS o JSON válido, sem texto adicional antes ou depois.`;

    const userPrompt = `Com base em TODOS os dados abaixo, crie um cronograma de DEMANDAS (não tarefas) ALTAMENTE CONTEXTUAL, ESPECÍFICO e com ORIENTAÇÕES COMPLETAS para execução:

## DADOS CADASTRAIS DA EMPRESA:
- Nome: ${companyData.fantasy_name || companyData.name || 'Não informado'}
- Setor: ${companyData.sector || 'Não informado'}
- Produtos/Serviços: ${companyData.products_services || 'Não informado'}
- Tamanho: ${companyData.size || 'Não informado'}
- Período de Referência: ${periodTitle}
- Data de início: ${startDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Data de fim: ${endDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}

## ESTRATÉGIA DEFINIDA:
${strategyText || 'Estratégia não definida'}

## PLANO DETALHADO:
${planContent}
${answersText}

🚨 ATENÇÃO CRÍTICA SOBRE DATAS:
- Hoje é ${primeiroDiaValido} - NENHUMA tarefa pode ter data anterior a esta
- Período de referência: ${periodTitle}
- Período VÁLIDO para tarefas: de ${primeiroDiaValido} até ${ultimoDiaValido}
- Dias disponíveis: ${diasRestantes} dias

⚠️ REQUISITOS OBRIGATÓRIOS PARA CADA DEMANDA:
- Use TODOS os dados fornecidos para criar demandas ultra-específicas
- Cada demanda DEVE refletir o contexto REAL do negócio do cliente
- A DESCRIÇÃO é obrigatoriamente um BRIEFING COMPLETO com orientações de execução
- SEMPRE inclua sugestões concretas de temas baseadas nos produtos/serviços reais
- SEMPRE mencione o público-alvo específico das respostas
- SEMPRE indique o objetivo e resultado esperado
- NENHUMA demanda pode ser genérica ou vaga
- TODAS as datas DEVEM estar entre ${primeiroDiaValido} e ${ultimoDiaValido}
- Distribua as demandas nos ${diasRestantes} dias disponíveis do período
- Cada descrição deve ter informações suficientes para que o executor comece a trabalhar IMEDIATAMENTE`;

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
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
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

    // Validar e normalizar datas antes de inserir
    const validateAndNormalizeDate = (dateStr: string): string => {
      try {
        const date = new Date(dateStr);
        const dateISO = date.toISOString().split('T')[0];
        
        // Verificar se a data é válida
        if (isNaN(date.getTime())) {
          console.log(`Data inválida detectada: ${dateStr}, ajustando para ${primeiroDiaValido}`);
          return primeiroDiaValido;
        }
        
        // Verificar se a data está antes do primeiro dia válido
        if (dateISO < primeiroDiaValido) {
          console.log(`Data anterior ao permitido: ${dateISO} → ${primeiroDiaValido}`);
          return primeiroDiaValido;
        }
        
        // Verificar se a data está depois do último dia válido
        if (dateISO > ultimoDiaValido) {
          console.log(`Data posterior ao permitido: ${dateISO} → ${ultimoDiaValido}`);
          return ultimoDiaValido;
        }
        
        return dateISO;
        
        return dateISO;
      } catch (error) {
        console.error(`Erro ao validar data ${dateStr}:`, error);
        return primeiroDiaValido;
      }
    };

    // Criar os cards no banco de dados com datas validadas
    const cardsToInsert = tasks.map((task) => {
      const normalizedDate = validateAndNormalizeDate(task.data_publicacao);
      
      return {
        title: task.titulo,
        status: 'unassigned',
        column_name: 'Planejamento Automatizado',
        publication_date: normalizedDate,
        file_location: task.local_arquivo || 'Aguardando material',
        description: task.descricao,
        observations: task.observacoes || '',
        plan_id: planId,
        tenant_id: plan.tenant_id,
        responsible_name: null,
      };
    });

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