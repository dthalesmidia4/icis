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
    const { slides, allSlides, batchOffset, aspectRatio, aiModel, presetId, mascotImageUrls, clientId, tenantId } = await req.json();
    const contextSlides = allSlides || slides;
    const slideOffset = batchOffset || 0;

    if (!slides || !Array.isArray(slides) || slides.length === 0 || !clientId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "slides, clientId e tenantId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Google AI Studio API key
    const { data: apiKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "Google AI Studio")
      .single();

    const GOOGLE_API_KEY = apiKeyData?.key_value;
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave 'Google AI Studio' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, logo_url, logo_position, logo_size")
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

    const mascotSection = mascotImageUrls && mascotImageUrls.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas. NÃO altere nenhuma característica do mascote. O mascote DEVE aparecer no design de forma integrada e harmoniosa.`
      : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    // Logo settings
    const logoUrl = (client as any)?.logo_url;
    const logoPosition = (client as any)?.logo_position || "bottom-right";
    const logoSize = (client as any)?.logo_size || "medium";
    const logoSizeMap: Record<string, string> = { small: "~8%", medium: "~12%", large: "~18%" };
    const logoSizeUpMap: Record<string, string> = { small: "~12%", medium: "~18%", large: "~22%" };
    const logoPositionMap: Record<string, string> = {
      "top-left": "canto superior esquerdo", "top-right": "canto superior direito",
      "bottom-left": "canto inferior esquerdo", "bottom-right": "canto inferior direito",
      "bottom-center": "centro inferior",
    };

    console.log(`Generating ${slides.length} carousel images with Gemini 3 Pro Image, ratio: ${aspectRatio}`);

    // Pre-fetch mascot images as base64
    const mascotInlineData: Array<{ mimeType: string; data: string }> = [];
    if (mascotImageUrls && mascotImageUrls.length > 0) {
      for (const url of mascotImageUrls) {
        try {
          const imgResp = await fetch(url);
          if (imgResp.ok) {
            const imgBuffer = await imgResp.arrayBuffer();
            const bytes = new Uint8Array(imgBuffer);
            let binary = "";
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            mascotInlineData.push({ mimeType: imgResp.headers.get("content-type") || "image/png", data: btoa(binary) });
          }
        } catch (e) { console.error("Failed to fetch mascot image:", e); }
      }
      if (mascotInlineData.length > 0) console.log(`  → ${mascotInlineData.length} mascot reference image(s) pre-fetched`);
    }

    // Pre-fetch logo as base64
    let logoInlineData: { mimeType: string; data: string } | null = null;
    if (logoUrl) {
      try {
        const imgResp = await fetch(logoUrl);
        if (imgResp.ok) {
          const imgBuffer = await imgResp.arrayBuffer();
          const bytes = new Uint8Array(imgBuffer);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          logoInlineData = { mimeType: imgResp.headers.get("content-type") || "image/png", data: btoa(binary) };
          console.log("  → Logo reference image pre-fetched");
        }
      } catch (e) { console.error("Failed to fetch logo:", e); }
    }

    const generatedImages: Array<{ slideIndex: number; imageUrl: string }> = [];
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_API_KEY}`;

    // 5. Generate images one by one
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNumber = slideOffset + i + 1;
      const totalSlides = contextSlides.length;

      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional para o SLIDE ${slideNumber} de ${totalSlides} de um carrossel para rede social.

TEXTO DESTE SLIDE:
"${slide.text}"

TIPO DO SLIDE: ${slide.label}

CONTEXTO DO CARROSSEL COMPLETO:
${contextSlides.map((s: any, idx: number) => `Slide ${idx + 1} (${s.label}): "${s.text}"`).join("\n")}

PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):
- Cor primária (${presetColors.primary}): Use em fundos, banners, boxes, shapes e elementos gráficos dominantes do layout
- Cor secundária (${presetColors.secondary}): Use em acentos, bordas, elementos complementares e variações de fundo
${presetColors.highlight ? `- Cor de destaque (${presetColors.highlight}): Use em botões, badges, CTAs, ícones e pequenos destaques visuais` : ""}
${presetColors.text ? `- Cor do texto (${presetColors.text}): Use na tipografia principal sobre os fundos` : ""}
- Tipografia: ${presetColors.font}
${mascotSection}
${logoUrl ? `
LOGO DA MARCA (OBRIGATÓRIO):
- A logo da marca está fornecida como imagem de referência. INCLUA a logo no design OBRIGATORIAMENTE.
- Posição: ${logoPositionMap[logoPosition] || logoPosition}
- Tamanho: ${(slideNumber === 1 || slideNumber === totalSlides) ? logoSizeUpMap[logoSize] || "~18%" : logoSizeMap[logoSize] || "~12%"} da área da imagem
${(slideNumber === 1 || slideNumber === totalSlides) ? "- Este é um slide de DESTAQUE — a logo deve ser PROEMINENTE e mais visível" : "- Mantenha a logo discreta mas visível"}
- NÃO distorça, altere cores ou modifique a logo de nenhuma forma
- Reproduza a logo EXATAMENTE como na imagem de referência fornecida` : ""}

REGRA CRÍTICA DE APLICAÇÃO DE CORES:
As cores da marca devem ser aplicadas APENAS em elementos de design gráfico (fundos, gradientes, boxes, banners, shapes, tipografia, ícones, bordas).
NUNCA aplique as cores da marca em objetos reais, pessoas, animais ou elementos figurativos.
Exemplo: se a cor primária é verde, o fundo e os boxes devem ser verdes, mas um leão deve ter cores NATURAIS realistas.
Os sujeitos e ilustrações figurativas devem manter aparência NATURAL e REALISTA.
A paleta de cores cria a identidade visual através do LAYOUT e DESIGN, não tingindo os elementos figurativos.

REGRAS DE DESIGN:
- Formato: ${aspectRatio || "1:1"} (1024x1024px)
- Este é o slide ${slideNumber} de ${totalSlides} — mantenha coerência visual com os outros slides
- O texto "${slide.text}" DEVE aparecer legível e bem posicionado na imagem
- Design profissional para redes sociais
- Cores vibrantes e contraste alto
- Incluir indicador de slide (${slideNumber}/${totalSlides}) discretamente
${logoUrl ? "- A LOGO da marca DEVE aparecer no design conforme as instruções acima" : "- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem\n- NÃO adicione texto com o nome da marca em nenhum lugar da imagem"}

${slideNumber === 1 ? `REGRAS ESPECIAIS PARA CAPA (SLIDE 1 - OBRIGATÓRIO):
Este é o slide de CAPA do carrossel — o mais importante de todos.
- Design VISUALMENTE IMPACTANTE e CHAMATIVO que capture atenção imediata no feed
- Use elementos gráficos bold: boxes coloridos grandes, banners vibrantes, balões de fala (speech bubbles) ou shapes dinâmicos para conter o texto
- Tipografia EXTRA BOLD, centralizada e com tamanho grande — o texto deve ser o protagonista visual
- Composição com profundidade: sombras, gradientes e camadas visuais que criem dimensão
- Use ícones ou emojis 3D estilizados para enriquecer o layout
- O design deve transmitir "profissionalismo de agência" e incentivar o usuário a DESLIZAR para ver mais
- A capa deve comunicar CLARAMENTE o tema do carrossel de forma concisa e atraente
- NÃO use layouts simples ou minimalistas — a capa deve ser visualmente rica e elaborada` : `CONTINUIDADE VISUAL: Mantenha o estilo visual coerente com a capa, mas com layout adequado para conteúdo informativo.`}
`.trim();

      console.log(`  → Generating slide ${slideNumber}/${totalSlides}...`);

      const parts: any[] = [{ text: imagePrompt }];
      for (const mascot of mascotInlineData) {
        parts.push({ inlineData: mascot });
      }

      try {
        const response = await fetch(googleApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Slide ${slideNumber} error:`, response.status, errorText);

          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: `Rate limit excedido no slide ${slideNumber}. Tente novamente.`, partialImages: generatedImages }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          console.warn(`  ⚠ Skipping slide ${slideNumber} due to error`);
          continue;
        }

        const data = await response.json();

        // Extract base64 image from Gemini response
        let imageBase64 = "";
        let imageMimeType = "image/png";
        const candidates = data.candidates || [];
        for (const candidate of candidates) {
          const candidateParts = candidate.content?.parts || [];
          for (const part of candidateParts) {
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData) {
              imageBase64 = inlineData.data;
              imageMimeType = inlineData.mimeType || inlineData.mime_type || "image/png";
              break;
            }
          }
          if (imageBase64) break;
        }

        if (!imageBase64) {
          console.warn(`  ⚠ No image returned for slide ${slideNumber}`);
          continue;
        }

        // Upload to storage
        const imageBytes = decodeBase64(imageBase64);
        const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
        const fileName = `carousel-posts/${clientId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(fileName, imageBytes, {
            contentType: imageMimeType,
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
      } catch (slideError) {
        console.error(`Exception on slide ${slideNumber}:`, slideError);
        continue;
      }
    }

    if (generatedImages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem foi gerada. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Generated ${generatedImages.length}/${slides.length} carousel images with Gemini 3 Pro Image`);

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
