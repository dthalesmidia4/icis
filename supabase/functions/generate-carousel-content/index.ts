import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, slideCount, presetId, mascotImageUrls, clientId, tenantId } = await req.json();

    if (!idea || !slideCount || !clientId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "idea, slideCount, clientId e tenantId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch OpenAI API key from api_keys table
    const { data: apiKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "OPENAI_API_KEY")
      .single();

    const OPENAI_API_KEY = apiKeyData?.key_value;
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave 'OPENAI_API_KEY' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // (supabase client already created above)

    // 1. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, sector, products_services, content_requirements")
      .eq("id", clientId)
      .single();

    const brandName = client?.fantasy_name || client?.name || "Marca";

    // 2. Fetch preset if selected
    let presetInfo = "";
    if (presetId) {
      const { data: preset } = await supabase
        .from("visual_identity_presets")
        .select("name, primary_color, secondary_color, highlight_color, text_color, font_name")
        .eq("id", presetId)
        .single();

      if (preset) {
        presetInfo = `Predefinição visual ativa: "${preset.name}" (cores: ${preset.primary_color || "N/A"}, ${preset.secondary_color || "N/A"}, fonte: ${preset.font_name || "N/A"}).`;
      }
    }

    // 3. Fetch active strategy
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", clientId)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const strategyText = strategy?.strategy_text
      ? strategy.strategy_text.substring(0, 1500)
      : "";

    // 4. Fetch carousel content prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

    // 5. Mascot info
    const mascotInfo = mascotImageUrls && mascotImageUrls.length > 0
      ? `O cliente possui um mascote oficial. ${client?.mascot_description ? `Descrição: ${client.mascot_description}.` : ""} Considere referenciá-lo nos textos quando relevante.`
      : "";

    const contentReqsSection = (client as any)?.content_requirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${(client as any).content_requirements}\n`
      : '';

    // 6. Build the prompt for text generation
    const systemPrompt = `Você é um copywriter especialista em marketing digital e conteúdo para redes sociais. Sua função é criar textos para carrosséis de posts.

${basePrompt ? "DIRETRIZES DO SISTEMA:\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA GERAL DO CLIENTE:\n" + strategyText + "\n\n" : ""}${contentReqsSection}CONTEXTO DO CLIENTE:
- Marca: ${brandName}
- Setor: ${client?.sector || "N/A"}
- Produtos/Serviços: ${client?.products_services || "N/A"}
${presetInfo ? "- " + presetInfo : ""}
${mascotInfo ? "- " + mascotInfo : ""}

REGRAS OBRIGATÓRIAS:
1. Você DEVE retornar EXATAMENTE ${slideCount} slides
2. O texto de cada slide deve ser conciso e impactante, sem limite rígido de caracteres
3. O texto deve ser impactante, direto e adequado para redes sociais
4. O Slide 1 SEMPRE deve ser o "gancho" - a frase que atrai atenção
5. O último slide SEMPRE deve ser o CTA (Call to Action)
6. Os slides intermediários devem desenvolver a ideia de forma progressiva
7. Use a função "create_carousel_slides" para retornar os slides estruturados`;

    const userPrompt = `Crie o conteúdo textual para um carrossel de ${slideCount} slides sobre:

"${idea}"

Retorne exatamente ${slideCount} slides, cada um com texto impactante e um rótulo descritivo.`;

    console.log(`Generating carousel content: ${slideCount} slides for "${idea.substring(0, 50)}..."`);

    // 7. Call OpenAI API directly with tool calling for structured output
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_carousel_slides",
              description: "Retorna os slides do carrossel estruturados",
              parameters: {
                type: "object",
                properties: {
                  slides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "Texto do slide" },
                        label: { type: "string", description: "Rótulo descritivo do slide, ex: Gancho (Atração), Conteúdo, Chamada para Ação (CTA)" },
                      },
                      required: ["text", "label"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["slides"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_carousel_slides" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro do gateway de IA: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "A IA não retornou os slides estruturados." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let slides;
    try {
      const args = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      slides = args.slides;
    } catch (e) {
      console.error("Failed to parse tool call args:", e);
      return new Response(
        JSON.stringify({ error: "Falha ao interpretar resposta da IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou slides válidos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Generated ${slides.length} carousel slides successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        slides: slides.map((s: any) => ({
          text: (s.text || "").substring(0, 50),
          label: s.label || "Conteúdo",
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-carousel-content error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
