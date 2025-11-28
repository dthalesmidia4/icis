import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientData, strategy, questions, answers, prompt } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch OpenAI API key from database
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', 'OPENAI_API_KEY')
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('Failed to fetch OpenAI API key:', apiKeyError);
      return new Response(JSON.stringify({ 
        error: 'OpenAI API key not configured. Please add it in Developer settings.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const openAIApiKey = apiKeyData.key_value;

    // Construir o contexto completo
    const contextData = `
DADOS CADASTRAIS DO CLIENTE:
- Nome da Empresa: ${clientData.name}
- Nome Fantasia: ${clientData.fantasy_name || "Não informado"}
- CNPJ/CPF: ${clientData.cnpj_cpf}
- Segmento/Ramo: ${clientData.sector}
- Tamanho da Empresa: ${clientData.size}
- Produtos/Serviços: ${clientData.products_services}
- Email: ${clientData.email}
- Telefone: ${clientData.phone}

ESTRATÉGIA GERAL:
${strategy}

PERGUNTAS GUIAS E RESPOSTAS:
${questions.map((q: string, i: number) => `
Pergunta ${i + 1}: ${q}
Resposta: ${answers[i] || "Sem resposta"}
`).join('\n')}
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { 
            role: 'system', 
            content: prompt 
          },
          { 
            role: 'user', 
            content: contextData 
          }
        ],
        max_completion_tokens: 4000,
        tools: [
          {
            type: "function",
            function: {
              name: "generate_advanced_plan",
              description: "Generate a comprehensive advanced marketing plan with creative ideas",
              parameters: {
                type: "object",
                properties: {
                  campanhas_avancadas: {
                    type: "string",
                    description: "Advanced campaign ideas and strategies"
                  },
                  ideias_conteudo: {
                    type: "string",
                    description: "Creative content ideas including reels, carousels, stories, commercial videos, TV indoor, etc."
                  },
                  cronograma_sugerido: {
                    type: "string",
                    description: "Suggested timeline and schedule for implementing the ideas"
                  },
                  ganchos_criativos: {
                    type: "string",
                    description: "Creative hooks and engaging approaches for the target audience"
                  },
                  oportunidades_segmento: {
                    type: "string",
                    description: "Out-of-the-box opportunities specific to the client's segment"
                  }
                },
                required: ["campanhas_avancadas", "ideias_conteudo", "cronograma_sugerido", "ganchos_criativos", "oportunidades_segmento"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_advanced_plan" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the tool call result
    const toolCall = data.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in response');
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-advanced-plan function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
