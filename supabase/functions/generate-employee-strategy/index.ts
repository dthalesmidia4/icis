import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { employeeId, employeeName, tenantId, answers, observerNotes } = await req.json();

    if (!tenantId || !employeeId) {
      return new Response(JSON.stringify({ error: "Dados obrigatórios faltando" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch the "estrategia_geral_leitura" prompt from system_prompts
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "estrategia_geral_leitura")
      .single();

    const systemPrompt = promptData?.prompt_content || 
      `Você é um especialista em desenvolvimento humano e pessoal. Com base nas respostas da anamnese pessoal de um funcionário, crie uma estratégia geral de desenvolvimento personalizada. A estratégia deve incluir:

1. **Diagnóstico Geral**: Um resumo do perfil do funcionário baseado nas respostas
2. **Pontos Fortes Identificados**: Habilidades e características positivas observadas
3. **Áreas de Desenvolvimento**: Pontos que precisam de atenção e melhoria
4. **Plano de Ação**: Atividades e exercícios recomendados para desenvolvimento
5. **Metas de Curto Prazo**: Objetivos para os próximos 30 dias
6. **Metas de Médio Prazo**: Objetivos para os próximos 3-6 meses
7. **Recomendações de Leitura**: Livros e materiais sugeridos
8. **Observações Finais**: Considerações gerais sobre o processo de desenvolvimento

Seja detalhado, prático e motivador. Use linguagem acessível.`;

    // 2. Format the anamnesis answers
    const sections = [
      "Informações Gerais", "Comunicação", "Dicção e Fala", "Postura e Presença",
      "Raciocínio e Pensamento", "Leitura e Aprendizado", "Argumentação e Exposição de Ideias",
      "Comportamento e Evolução", "Expectativas de Desenvolvimento"
    ];

    let formattedAnswers = `# Anamnese Pessoal - ${employeeName}\n\n`;
    
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

    if (observerNotes) {
      formattedAnswers += `\n## Observações do Entrevistador:\n${observerNotes}\n`;
    }

    // 3. Get OpenAI API key
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

    // 4. Call GPT-5-mini directly
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
          { role: "user", content: formattedAnswers },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", openaiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao gerar estratégia com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();
    const strategyText = openaiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ success: true, strategyText }), {
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
