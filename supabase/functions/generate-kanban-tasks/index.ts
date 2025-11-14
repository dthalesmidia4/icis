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

    // Buscar o plano aprovado
    const { data: plan, error: planError } = await supabase
      .from('marketing_plans')
      .select('*, tenant_companies(name)')
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

    // Prompt para o ChatGPT
    const systemPrompt = `Você é um especialista em transformar planos estratégicos de marketing em tarefas operacionais executáveis. 
Sua função é analisar o plano e criar uma lista estruturada de tarefas práticas que precisam ser executadas.

IMPORTANTE: Retorne APENAS um JSON válido, sem texto adicional antes ou depois. O formato deve ser:
{
  "tarefas": [
    {
      "titulo": "Nome claro e curto da tarefa",
      "status": "a fazer",
      "data_publicacao": "YYYY-MM-DD",
      "local_arquivo": "descrição do arquivo ou link necessário",
      "descricao": "Explicação breve do que deve ser feito",
      "observacoes": "Detalhes adicionais ou contexto"
    }
  ]
}

Regras:
1. Cada tarefa deve ser prática e executável
2. O status sempre começa como "a fazer"
3. Estime datas realistas baseadas na lógica do plano
4. Seja específico nas descrições
5. Inclua detalhes importantes nas observações
6. Crie entre 8 a 15 tarefas dependendo da complexidade do plano
7. Organize as tarefas em ordem cronológica lógica`;

    const userPrompt = `Transforme o seguinte plano estratégico em tarefas executáveis:

${planContent}

Empresa: ${plan.tenant_companies?.name || 'Cliente'}

Crie tarefas específicas, práticas e organizadas cronologicamente.`;

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
      column_name: 'A Fazer',
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