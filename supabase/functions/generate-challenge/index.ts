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
    const { employeeId, employeeName, tenantId } = await req.json();

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
      return new Response(JSON.stringify({ error: "Anamnese não encontrada. Realize a anamnese primeiro." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch latest strategy
    const { data: strategyEvent } = await supabase
      .from("employee_progress_history")
      .select("event_data")
      .eq("tenant_id", tenantId)
      .eq("employee_id", employeeId)
      .eq("event_type", "estrategia")
      .order("created_at", { ascending: false })
      .limit(1);

    const strategyText = strategyEvent?.[0]?.event_data?.strategyText || "";

    // 3. Format anamnesis answers
    const sections = [
      "Informações Gerais", "Comunicação", "Dicção e Fala", "Postura e Presença",
      "Raciocínio e Pensamento", "Leitura e Aprendizado", "Argumentação e Exposição de Ideias",
      "Comportamento e Evolução", "Expectativas de Desenvolvimento"
    ];

    let formattedAnswers = `# Anamnese Pessoal - ${employeeName}\n\n`;
    const answers = anamneseData.answers as Record<string, string>;
    if (answers && typeof answers === "object") {
      for (const [key, value] of Object.entries(answers)) {
        if (value && typeof value === "string" && value.trim()) {
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

    // 4. Build prompt
    const systemPrompt = `Você é um coach especialista em desenvolvimento humano e pessoal. Com base na anamnese pessoal e na estratégia geral de desenvolvimento de um colaborador, crie um DESAFIO PRÁTICO e motivador para o colaborador.

O desafio deve:
1. Ser específico e realizável em 1 a 7 dias
2. Estar diretamente conectado às áreas de desenvolvimento identificadas na anamnese e estratégia
3. Ter um objetivo claro e mensurável
4. Incluir passos concretos para execução
5. Ser motivador e estimulante

Formato da resposta:
🎯 **DESAFIO**: [Título do desafio]

📋 **Descrição**: [O que o colaborador deve fazer]

⏰ **Prazo sugerido**: [Tempo para conclusão]

📝 **Passos para execução**:
1. [Passo 1]
2. [Passo 2]
3. [Passo 3]
...

✅ **Critério de sucesso**: [Como saber que completou o desafio]

💡 **Dica motivacional**: [Uma frase motivadora relacionada ao desafio]

Seja criativo, prático e personalizado para o perfil do colaborador.`;

    let userMessage = formattedAnswers;
    if (strategyText) {
      userMessage += `\n\n---\n## Estratégia Geral de Desenvolvimento:\n${strategyText}\n`;
    }

    // 5. Get OpenAI API key
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

    // 6. Call OpenAI directly
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKeyData.key_value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", openaiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao gerar desafio com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();
    const challengeText = openaiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ success: true, challengeText }), {
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
