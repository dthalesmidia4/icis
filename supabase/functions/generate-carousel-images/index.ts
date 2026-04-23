import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: fetch a remote image as a Blob (for OpenAI multipart endpoints)
async function fetchImageBlob(url: string): Promise<{ blob: Blob; filename: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/png";
    const buf = await r.arrayBuffer();
    const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
    return { blob: new Blob([buf], { type: ct }), filename: `ref-${crypto.randomUUID()}.${ext}` };
  } catch (e) {
    console.error("Failed to fetch reference image:", e);
    return null;
  }
}

// Map aspect ratio strings to GPT Image 2 supported sizes.
function mapAspectToGptSize(aspectRatio: string | undefined): string {
  const r = (aspectRatio || "1:1").trim();
  if (r === "16:9" || r === "1.91:1") return "1536x1024";
  if (r === "9:16" || r === "4:5" || r === "3:4" || r === "2:3") return "1024x1536";
  return "1024x1024"; // default 1:1
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slides, allSlides, batchOffset, aspectRatio, presetId, mascotImageUrls, clientId, tenantId } = await req.json();
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

    // Fetch OpenAI API key (GPT Image 2 lives at OpenAI)
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

    const sizeForGpt = mapAspectToGptSize(aspectRatio);
    console.log(`Generating ${slides.length} carousel images with GPT Image 2, size: ${sizeForGpt}`);

    // Pre-fetch reference images (mascot + logo) as Blobs (for /images/edits)
    const referenceImages: { blob: Blob; filename: string }[] = [];

    if (mascotImageUrls && Array.isArray(mascotImageUrls)) {
      for (const url of mascotImageUrls) {
        const ref = await fetchImageBlob(url);
        if (ref) {
          referenceImages.push(ref);
          console.log("  → Mascot reference attached");
        }
      }
    }

    if (logoUrl) {
      const logoRef = await fetchImageBlob(logoUrl);
      if (logoRef) {
        referenceImages.push(logoRef);
        console.log("  → Logo reference attached");
      }
    }

    const generatedImages: Array<{ slideIndex: number; imageUrl: string }> = [];

    // 5. Generate images IN PARALLEL with GPT Image 2 (medium quality to fit 150s edge timeout)
    //    Sequential mode would exceed limits since each slide takes ~30-60s.
    const slideJobs = slides.map((slide, i) => {
      const slideNumber = slideOffset + i + 1;
      const totalSlides = contextSlides.length;

      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional para o SLIDE ${slideNumber} de ${totalSlides} de um carrossel para rede social da marca "${brandName}".

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
- Formato: ${aspectRatio || "1:1"} (saída ${sizeForGpt})
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

      console.log(`  → Generating slide ${slideNumber}/${totalSlides} via GPT Image 2...`);

      try {
        let openaiResp: Response;

        if (referenceImages.length > 0) {
          const form = new FormData();
          form.append("model", "gpt-image-2");
          form.append("prompt", imagePrompt);
          form.append("size", sizeForGpt);
          form.append("quality", "high");
          // Note: gpt-image-2 does NOT support input_fidelity (gpt-image-1 only).
          form.append("n", "1");
          for (const ref of referenceImages) {
            form.append("image[]", ref.blob, ref.filename);
          }
          openaiResp = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
            body: form,
          });
        } else {
          openaiResp = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-image-2",
              prompt: imagePrompt,
              size: sizeForGpt,
              quality: "high",
              n: 1,
            }),
          });
        }

        if (!openaiResp.ok) {
          const errorText = await openaiResp.text();
          console.error(`Slide ${slideNumber} GPT Image 2 error:`, openaiResp.status, errorText);

          if (openaiResp.status === 429) {
            return new Response(
              JSON.stringify({ error: `Rate limit excedido no slide ${slideNumber}. Tente novamente.`, partialImages: generatedImages }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (openaiResp.status === 401) {
            return new Response(
              JSON.stringify({ error: "Chave OpenAI inválida ou sem permissão para gpt-image-2.", partialImages: generatedImages }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          console.warn(`  ⚠ Skipping slide ${slideNumber} due to error`);
          continue;
        }

        const data = await openaiResp.json();
        const imageBase64: string | undefined = data?.data?.[0]?.b64_json;

        if (!imageBase64) {
          console.warn(`  ⚠ No image returned for slide ${slideNumber}`);
          continue;
        }

        // Upload to storage
        const imageBytes = decodeBase64(imageBase64);
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

        console.log(`  ✅ Slide ${slideNumber} generated successfully (GPT Image 2)`);
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

    console.log(`✅ Generated ${generatedImages.length}/${slides.length} carousel images with GPT Image 2`);

    return new Response(
      JSON.stringify({
        success: true,
        images: generatedImages,
        totalGenerated: generatedImages.length,
        totalRequested: slides.length,
        model: "gpt-image-2",
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
