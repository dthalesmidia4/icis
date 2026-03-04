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
    const { idea, sceneCount, presetId, mascotImageUrls, clientId, tenantId } = await req.json();

    if (!idea || !sceneCount || !clientId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "idea, sceneCount, clientId e tenantId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, sector, products_services")
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

    // 4. Fetch video storyboard prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "generate_video_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

    // 5. Mascot info - determine gender from description
    const hasMascot = mascotImageUrls && mascotImageUrls.length > 0;
    const mascotDescription = client?.mascot_description || "";
    
    // Try to detect mascot gender from description
    const descLower = mascotDescription.toLowerCase();
    const isFemale = descLower.includes("feminino") || descLower.includes("mulher") || descLower.includes("menina") || descLower.includes("garota") || descLower.includes("moça") || descLower.includes("female");
    const mascotGender = isFemale ? "feminino" : "masculino";

    const mascotInfo = hasMascot
      ? `O cliente possui um mascote oficial (${mascotGender}). ${mascotDescription ? `Descrição do mascote: ${mascotDescription}.` : ""} O mascote DEVE aparecer em TODAS as cenas executando uma ação relevante. A aparência do mascote NÃO pode ser alterada.`
      : "";

    // 6. Build the prompt
    const systemPrompt = `Você é um roteirista especialista em criação de storyboards para vídeos de marketing digital.

${basePrompt ? "DIRETRIZES DO SISTEMA:\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA GERAL DO CLIENTE:\n" + strategyText + "\n\n" : ""}CONTEXTO DO CLIENTE:
- Marca: ${brandName}
- Setor: ${client?.sector || "N/A"}
- Produtos/Serviços: ${client?.products_services || "N/A"}
${presetInfo ? "- " + presetInfo : ""}
${mascotInfo ? "- " + mascotInfo : ""}

REGRAS OBRIGATÓRIAS:
1. Você DEVE retornar EXATAMENTE ${sceneCount} cenas
2. A DESCRIÇÃO DA CENA deve ser escrita em INGLÊS (English) - isso é CRÍTICO pois será usado como prompt para geração de vídeo com IA (Veo) que funciona melhor em inglês
3. A FALA DO MASCOTE deve ser escrita em PORTUGUÊS BRASILEIRO (PT-BR) - pois o vídeo final será em português
4. ${hasMascot ? `O mascote (${mascotGender}) DEVE estar presente em TODAS as cenas, executando uma ação relevante` : "NÃO inclua personagens ou mascotes nas cenas"}
5. As descrições de cena devem ser cinematográficas, descrevendo ambiente, ação, composição e iluminação
6. ${hasMascot ? `A fala deve ser curta (máximo 2 frases), natural e em primeira pessoa. Use: "O mascote ${mascotGender} diz: ..."` : "Não inclua falas de mascote"}
7. Cada cena deve fazer sentido narrativamente com as anteriores
8. A primeira cena deve ser impactante (gancho visual)
9. A última cena deve ter um CTA (chamada para ação)
10. Use a função "create_video_storyboard" para retornar as cenas estruturadas`;

    const userPrompt = `Crie um storyboard de vídeo com ${sceneCount} cenas sobre:

"${idea}"

LEMBRE-SE: 
- Descrição da cena em INGLÊS
- Fala do mascote em PORTUGUÊS BRASILEIRO
- Retorne exatamente ${sceneCount} cenas usando a função create_video_storyboard`;

    console.log(`Generating video storyboard: ${sceneCount} scenes for "${idea.substring(0, 50)}..."`);

    // 7. Call Lovable AI Gateway with tool calling
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_video_storyboard",
              description: "Retorna as cenas do storyboard de vídeo estruturadas",
              parameters: {
                type: "object",
                properties: {
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        scene_description: { type: "string", description: "Descrição cinematográfica da cena em INGLÊS descrevendo ambiente, ação, composição e iluminação" },
                        mascot_speech: { type: "string", description: "Fala do mascote em PORTUGUÊS BRASILEIRO. Formato: 'O mascote [masculino/feminino] diz: ...'. Se não houver mascote, deixe vazio." },
                      },
                      required: ["scene_description", "mascot_speech"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["scenes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_video_storyboard" } },
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
        JSON.stringify({ error: "A IA não retornou as cenas estruturadas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let scenes;
    try {
      const args = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      scenes = args.scenes;
    } catch (e) {
      console.error("Failed to parse tool call args:", e);
      return new Response(
        JSON.stringify({ error: "Falha ao interpretar resposta da IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou cenas válidas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Generated ${scenes.length} video storyboard scenes successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        scenes: scenes.map((s: any) => ({
          scene_description: s.scene_description || "",
          mascot_speech: s.mascot_speech || "",
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-video-storyboard error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
