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
    const { slides, aspectRatio, aiModel, presetId, mascotImageUrls, clientId, tenantId } = await req.json();

    if (!slides || !Array.isArray(slides) || slides.length === 0 || !clientId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "slides, clientId e tenantId são obrigatórios" }),
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
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description")
      .eq("id", clientId)
      .single();

    const brandName = client?.fantasy_name || client?.name || "Marca";

    // 2. Fetch preset colors
    let presetColors = {
      primary: client?.brand_primary_color || "#000000",
      secondary: client?.brand_secondary_color || "#FFFFFF",
      highlight: null as string | null,
      text: null as string | null,
      font: client?.brand_font || "Montserrat",
    };

    if (presetId) {
      const { data: preset } = await supabase
        .from("visual_identity_presets")
        .select("primary_color, secondary_color, highlight_color, text_color, font_name")
        .eq("id", presetId)
        .single();

      if (preset) {
        presetColors = {
          primary: preset.primary_color || presetColors.primary,
          secondary: preset.secondary_color || presetColors.secondary,
          highlight: preset.highlight_color,
          text: preset.text_color,
          font: preset.font_name || presetColors.font,
        };
      }
    }

    // 3. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

    // 4. Fetch strategy
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", clientId)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}`
      : "";

    // 5. Determine dimensions from aspect ratio
    const dimensions: Record<string, { w: number; h: number }> = {
      "1:1": { w: 1024, h: 1024 },
      "9:16": { w: 768, h: 1365 },
      "16:9": { w: 1365, h: 768 },
      "4:5": { w: 1024, h: 1280 },
    };
    const dim = dimensions[aspectRatio] || dimensions["1:1"];

    // 6. Determine model
    const modelId = aiModel === "gpt" 
      ? "openai/gpt-5" 
      : "google/gemini-3-pro-image-preview";

    const mascotSection = mascotImageUrls && mascotImageUrls.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas. NÃO altere nenhuma característica do mascote. O mascote DEVE aparecer no design de forma integrada e harmoniosa.`
      : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    console.log(`Generating ${slides.length} carousel images with model: ${modelId}, ratio: ${aspectRatio}`);

    const generatedImages: Array<{ slideIndex: number; imageUrl: string }> = [];

    // 7. Generate images one by one to avoid memory issues
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNumber = i + 1;
      const totalSlides = slides.length;

      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional para o SLIDE ${slideNumber} de ${totalSlides} de um carrossel para rede social.

TEXTO DESTE SLIDE:
"${slide.text}"

TIPO DO SLIDE: ${slide.label}

CONTEXTO DO CARROSSEL COMPLETO:
${slides.map((s: any, idx: number) => `Slide ${idx + 1} (${s.label}): "${s.text}"`).join("\n")}

BRANDING:
- Cor primária: ${presetColors.primary}
- Cor secundária: ${presetColors.secondary}
${presetColors.highlight ? `- Cor de destaque: ${presetColors.highlight}` : ""}
${presetColors.text ? `- Cor do texto: ${presetColors.text}` : ""}
- Tipografia: ${presetColors.font}
${mascotSection}

REGRAS DE DESIGN:
- Formato: ${aspectRatio} (${dim.w}x${dim.h}px)
- Este é o slide ${slideNumber} de ${totalSlides} — mantenha coerência visual com os outros slides
- O texto "${slide.text}" DEVE aparecer legível e bem posicionado na imagem
- Design profissional para redes sociais
- Cores vibrantes e contraste alto
- Incluir indicador de slide (${slideNumber}/${totalSlides}) discretamente
- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem
- NÃO adicione texto com o nome da marca em nenhum lugar da imagem
`.trim();

      console.log(`  → Generating slide ${slideNumber}/${totalSlides}...`);

      const contentParts: any[] = [{ type: "text", text: imagePrompt }];

      if (mascotImageUrls && mascotImageUrls.length > 0) {
        for (const url of mascotImageUrls) {
          contentParts.push({ type: "image_url", image_url: { url } });
        }
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: contentParts }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Slide ${slideNumber} AI error:`, response.status, errorText);

        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: `Rate limit excedido no slide ${slideNumber}. Tente novamente.`, partialImages: generatedImages }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace.", partialImages: generatedImages }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Skip this slide but continue with others
        console.warn(`  ⚠ Skipping slide ${slideNumber} due to error`);
        continue;
      }

      const data = await response.json();
      const base64Url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!base64Url) {
        console.warn(`  ⚠ No image returned for slide ${slideNumber}`);
        continue;
      }

      // Upload to storage
      const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
      const imageBytes = decodeBase64(base64Data);
      const fileName = `carousel-posts/${clientId}/${crypto.randomUUID()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("card-attachments")
        .upload(fileName, imageBytes, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        console.error(`Storage upload error for slide ${slideNumber}:`, uploadError);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from("card-attachments")
        .getPublicUrl(fileName);

      generatedImages.push({
        slideIndex: i,
        imageUrl: publicUrlData.publicUrl,
      });

      console.log(`  ✅ Slide ${slideNumber} generated successfully`);
    }

    if (generatedImages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem foi gerada. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Generated ${generatedImages.length}/${slides.length} carousel images`);

    return new Response(
      JSON.stringify({
        success: true,
        images: generatedImages,
        totalGenerated: generatedImages.length,
        totalRequested: slides.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-carousel-images error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
