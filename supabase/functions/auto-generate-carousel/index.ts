import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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
    const { demandId } = await req.json();

    if (!demandId) {
      return new Response(
        JSON.stringify({ error: "demandId é obrigatório" }),
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

    // 1. Fetch the demand
    const { data: demand, error: demandError } = await supabase
      .from("demands")
      .select("*")
      .eq("id", demandId)
      .single();

    if (demandError || !demand) {
      console.error("Demand not found:", demandId, demandError);
      return new Response(
        JSON.stringify({ error: "Demanda não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if demand type is "Carrossel"
    const demandType = (demand.demand_type || "").toLowerCase();
    const isCarousel = demandType.includes("carrossel") || demandType.includes("carousel");

    if (!isCarousel) {
      console.log(`Skipping: demand_type="${demand.demand_type}" is not a carousel`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Tipo "${demand.demand_type}" não é Carrossel` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Auto-generating carousel for demand ${demandId} (type: ${demand.demand_type})`);

    // 3. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, sector, products_services")
      .eq("id", demand.client_id)
      .single();

    const brandName = client?.fantasy_name || client?.name || "Marca";

    // 4. Fetch mascot images
    let mascotImageUrls: string[] = [];
    if (client?.has_mascot) {
      const { data: mascotImages } = await supabase
        .from("company_mascot_images")
        .select("image_url")
        .eq("company_id", demand.client_id)
        .order("position", { ascending: true })
        .limit(2);

      if (mascotImages && mascotImages.length > 0) {
        mascotImageUrls = mascotImages.map((m: any) => m.image_url);
      }
    }

    // 5. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", demand.tenant_id)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

    // 6. Fetch active strategy
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const strategyText = strategy?.strategy_text
      ? strategy.strategy_text.substring(0, 1500)
      : "";

    // 7. Build card content as the "idea" for carousel
    const cardContent = [
      demand.title ? `Título: ${demand.title}` : "",
      demand.objective ? `Objetivo: ${demand.objective}` : "",
      demand.instructions ? `Instruções: ${demand.instructions.replace(/<[^>]*>/g, " ").trim()}` : "",
      demand.description ? `Descrição: ${demand.description.replace(/<[^>]*>/g, " ").trim()}` : "",
      demand.observations ? `Observações: ${demand.observations.replace(/<[^>]*>/g, " ").trim()}` : "",
    ].filter(Boolean).join("\n");

    const slideCount = 5; // Default carousel slide count

    // ============ STEP 1: Generate carousel text content ============
    console.log(`Step 1: Generating ${slideCount} slide texts...`);

    const mascotInfo = mascotImageUrls.length > 0
      ? `O cliente possui um mascote oficial. ${client?.mascot_description ? `Descrição: ${client.mascot_description}.` : ""} Considere referenciá-lo nos textos quando relevante.`
      : "";

    const systemPrompt = `Você é um copywriter especialista em marketing digital e conteúdo para redes sociais. Sua função é criar textos para carrosséis de posts.

${basePrompt ? "DIRETRIZES DO SISTEMA:\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA GERAL DO CLIENTE:\n" + strategyText + "\n\n" : ""}CONTEXTO DO CLIENTE:
- Marca: ${brandName}
- Setor: ${client?.sector || "N/A"}
- Produtos/Serviços: ${client?.products_services || "N/A"}
${mascotInfo ? "- " + mascotInfo : ""}

REGRAS OBRIGATÓRIAS:
1. Você DEVE retornar EXATAMENTE ${slideCount} slides
2. Cada slide deve ter no MÁXIMO 50 caracteres de texto
3. O texto deve ser impactante, direto e adequado para redes sociais
4. O Slide 1 SEMPRE deve ser o "gancho" - a frase que atrai atenção
5. O último slide SEMPRE deve ser o CTA (Call to Action)
6. Os slides intermediários devem desenvolver a ideia de forma progressiva
7. Use a função "create_carousel_slides" para retornar os slides estruturados`;

    const userPrompt = `Crie o conteúdo textual para um carrossel de ${slideCount} slides com base no seguinte card aprovado:

${cardContent}

Retorne exatamente ${slideCount} slides, cada um com texto curto (máx 50 caracteres) e um rótulo descritivo.`;

    const contentResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                        text: { type: "string", description: "Texto do slide (máx 50 caracteres)" },
                        label: { type: "string", description: "Rótulo descritivo do slide" },
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

    if (!contentResponse.ok) {
      const errorText = await contentResponse.text();
      console.error("Content generation error:", contentResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Erro ao gerar conteúdo do carrossel: ${contentResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentData = await contentResponse.json();
    const toolCall = contentData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      console.error("No tool call in content response");
      return new Response(
        JSON.stringify({ error: "A IA não retornou os slides estruturados." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let slides: Array<{ text: string; label: string }>;
    try {
      const args = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
      slides = args.slides;
    } catch (e) {
      console.error("Failed to parse slides:", e);
      return new Response(
        JSON.stringify({ error: "Falha ao interpretar slides da IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou slides válidos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Step 1 complete: ${slides.length} slide texts generated`);

    // ============ STEP 2: Generate images for each slide ============
    console.log(`Step 2: Generating ${slides.length} slide images...`);

    const mascotSection = mascotImageUrls.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas.`
      : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    const generatedAttachments: any[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNumber = i + 1;

      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategyText ? "Tom de voz e estratégia da marca: " + strategyText.substring(0, 500) + "\n\n" : ""}Crie uma imagem profissional para o SLIDE ${slideNumber} de ${slides.length} de um carrossel para rede social.

TEXTO DESTE SLIDE:
"${slide.text}"

TIPO DO SLIDE: ${slide.label}

CONTEXTO DO CARROSSEL COMPLETO:
${slides.map((s, idx) => `Slide ${idx + 1} (${s.label}): "${s.text}"`).join("\n")}

BRANDING:
- Cor primária: ${client?.brand_primary_color || "#000000"}
- Cor secundária: ${client?.brand_secondary_color || "#FFFFFF"}
- Tipografia: ${client?.brand_font || "Montserrat"}
${mascotSection}

REGRAS DE DESIGN:
- Formato: 1:1 (quadrado, 1024x1024)
- Este é o slide ${slideNumber} de ${slides.length} — mantenha coerência visual com os outros slides
- O texto "${slide.text}" DEVE aparecer legível e bem posicionado na imagem
- Design profissional para redes sociais
- Cores vibrantes e contraste alto
- Incluir indicador de slide (${slideNumber}/${slides.length}) discretamente
- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem
`.trim();

      console.log(`  → Generating slide ${slideNumber}/${slides.length}...`);

      const contentParts: any[] = [{ type: "text", text: imagePrompt }];
      if (mascotImageUrls.length > 0) {
        for (const url of mascotImageUrls) {
          contentParts.push({ type: "image_url", image_url: { url } });
        }
      }

      try {
        const imgResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            messages: [{ role: "user", content: contentParts }],
            modalities: ["image", "text"],
          }),
        });

        if (!imgResponse.ok) {
          const errText = await imgResponse.text();
          console.error(`Slide ${slideNumber} error:`, imgResponse.status, errText);

          if (imgResponse.status === 429 || imgResponse.status === 402) {
            console.warn(`Rate/credit limit hit at slide ${slideNumber}, returning partial results`);
            break;
          }
          continue;
        }

        const imgData = await imgResponse.json();
        const base64Url = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!base64Url) {
          console.warn(`  ⚠ No image returned for slide ${slideNumber}`);
          continue;
        }

        // Upload to storage
        const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
        const imageBytes = decodeBase64(base64Data);
        const fileName = `auto-generated/${demand.client_id}/${demandId}/carousel-slide-${slideNumber}-${crypto.randomUUID()}.png`;

        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(fileName, imageBytes, {
            contentType: "image/png",
            upsert: false,
          });

        if (uploadError) {
          console.error(`Upload error slide ${slideNumber}:`, uploadError);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from("card-attachments")
          .getPublicUrl(fileName);

        generatedAttachments.push({
          url: publicUrlData.publicUrl,
          name: `Carrossel Slide ${slideNumber} - ${brandName}.png`,
          type: "image/png",
          size: imageBytes.length,
          storagePath: fileName,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "auto-generator", email: "system@ai", name: "IA - Auto Geração (Carrossel)" },
          cardId: demandId,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        });

        console.log(`  ✅ Slide ${slideNumber} generated and uploaded`);
      } catch (slideError) {
        console.error(`Exception on slide ${slideNumber}:`, slideError);
        continue;
      }
    }

    if (generatedAttachments.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem de carrossel foi gerada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Attach all images to the demand
    const existingAttachments = Array.isArray(demand.attachments) ? demand.attachments : [];
    const updatedAttachments = [...existingAttachments, ...generatedAttachments];

    const { error: updateError } = await supabase
      .from("demands")
      .update({ attachments: updatedAttachments })
      .eq("id", demandId);

    if (updateError) {
      console.error("Error updating demand:", updateError);
      return new Response(
        JSON.stringify({ error: "Imagens geradas mas erro ao anexar à demanda" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Auto-generated ${generatedAttachments.length} carousel slides attached to demand ${demandId}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalGenerated: generatedAttachments.length,
        totalSlides: slides.length,
        demandId,
        message: `${generatedAttachments.length} slides do carrossel gerados e anexados!`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-generate-carousel error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
