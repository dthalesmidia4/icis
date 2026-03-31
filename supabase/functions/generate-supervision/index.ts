import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { employeeId, employeeName, tenantId, bookName, bookAuthor } = await req.json();

    if (!tenantId || !employeeId) {
      return new Response(JSON.stringify({ error: "Dados obrigatórios faltando" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch anamnesis
    const { data: anamneseData } = await supabase
      .from("employee_anamnesis")
      .select("answers, observer_notes")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!anamneseData) {
      return new Response(JSON.stringify({ error: "Anamnese não encontrada para este colaborador. Realize a anamnese primeiro." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch the generated strategy (from generate-employee-strategy)
    // We look for the most recent strategy text stored after anamnesis
    // Since strategies are returned but not stored in a table yet, we'll regenerate context
    // For now, we format the anamnesis as context

    const sections = [
      "Informações Gerais", "Comunicação", "Dicção e Fala", "Postura e Presença",
      "Raciocínio e Pensamento", "Leitura e Aprendizado", "Argumentação e Exposição de Ideias",
      "Comportamento e Evolução", "Expectativas de Desenvolvimento"
    ];

    let formattedAnswers = `# Anamnese Pessoal - ${employeeName}\n\n`;
    const answers = anamneseData.answers as Record<string, string>;
    if (answers && typeof answers === 'object') {
      for (const [key, value] of Object.entries(answers)) {
        if (value && typeof value === 'string' && value.trim()) {
          const match = key.match(/s(\d+)_q(\d+)/);
          if (match) {
            const sIdx = parseInt(match[1]);
            const sectionName = sections[sIdx] || `Seção ${sIdx + 1}`;
            formattedAnswers += `**${sectionName}** - Pergunta ${parseInt(match[2]) + 1}: ${value}\n\n`;
          }
        }
      }
    }
    if (anamneseData.observer_notes) {
      formattedAnswers += `\n## Observações do Entrevistador:\n${anamneseData.observer_notes}\n`;
    }

    // 3. Get the general strategy (regenerate from anamnesis using strategy prompt)
    const { data: strategyPromptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "estrategia_geral_leitura")
      .single();

    // 4. Get the supervision prompt
    const { data: supervisionPromptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "supervisao_leitura")
      .single();

    const supervisionPrompt = supervisionPromptData?.prompt_content ||
      `Você é um supervisor especialista em desenvolvimento humano e leitura. Com base nas informações fornecidas (anamnese pessoal, estratégia geral de desenvolvimento e livro atual sendo lido), faça uma análise de supervisão completa.

A análise deve incluir:

1. **Avaliação do Progresso**: Como o colaborador está evoluindo com base na anamnese e estratégia
2. **Adequação do Livro**: Se o livro atual é adequado para o momento de desenvolvimento do colaborador
3. **Conexões**: Como o conteúdo do livro se conecta com as áreas de desenvolvimento identificadas
4. **Orientações para o Supervisor**: Pontos que o supervisor deve observar e trabalhar nas próximas sessões
5. **Sugestões de Atividades**: Exercícios práticos relacionados ao livro e à estratégia
6. **Próximos Passos**: Recomendações para a continuidade do processo

Seja objetivo, prático e construtivo.`;

    // 5. Fetch the most recent books for THIS specific employee from history
    const { data: bookEvents } = await supabase
      .from("employee_progress_history")
      .select("event_data, event_title, created_at")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .eq("event_type", "livro")
      .order("created_at", { ascending: false })
      .limit(5);

    // Also fetch the latest strategy for this employee
    const { data: strategyEvent } = await supabase
      .from("employee_progress_history")
      .select("event_data")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .eq("event_type", "estrategia")
      .order("created_at", { ascending: false })
      .limit(1);

    // 6. Build the user message with all context
    let userMessage = formattedAnswers;

    // Add the saved strategy if it exists
    if (strategyEvent && strategyEvent.length > 0) {
      const savedStrategy = (strategyEvent[0] as any).event_data?.strategyText;
      if (savedStrategy) {
        userMessage += `\n\n---\n## Estratégia Geral de Desenvolvimento:\n${savedStrategy}\n`;
      }
    } else if (strategyPromptData?.prompt_content) {
      userMessage += `\n\n---\n## Contexto do Prompt de Estratégia:\n${strategyPromptData.prompt_content}\n`;
    }

    // Add books from this employee's history (not from component state)
    if (bookEvents && bookEvents.length > 0) {
      userMessage += `\n\n---\n## Livros em Uso pelo Colaborador:\n`;
      for (const book of bookEvents) {
        const bd = (book as any).event_data;
        if (bd?.bookName) {
          userMessage += `- **Livro**: ${bd.bookName}`;
          if (bd.bookAuthor) userMessage += ` — **Autor**: ${bd.bookAuthor}`;
          userMessage += `\n`;
        }
      }
    } else if (bookName) {
      // Fallback to passed params (backwards compatibility)
      userMessage += `\n\n---\n## Livro Atual em Uso:\n`;
      userMessage += `- **Livro**: ${bookName}\n`;
      if (bookAuthor) {
        userMessage += `- **Autor**: ${bookAuthor}\n`;
      }
    }

    // 6. Get OpenAI API key
    const { data: apiKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "OPENAI_API_KEY")
      .single();

    if (!apiKeyData?.key_value) {
      return new Response(JSON.stringify({ error: "Chave da OpenAI não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Call GPT-4o-mini directly
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKeyData.key_value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: supervisionPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", openaiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao gerar supervisão com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();
    const supervisionText = openaiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ success: true, supervisionText }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
