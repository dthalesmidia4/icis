import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: check if attachment is an AI-generated carousel slide
function isAiCarouselSlide(att: any): boolean {
  if (!att) return false;
  const uploaderId = att.uploadedBy?.id || "";
  if (["auto-generator", "ai-generator"].includes(uploaderId)) return true;
  const name = (att.name || "").toLowerCase();
  if (/carrossel\s*slide\s*\d+/i.test(name)) return true;
  if (/carousel\s*slide\s*\d+/i.test(name)) return true;
  if (/^slide\s*\d+/i.test(name)) return true;
  return false;
}

// Helper: archive existing AI carousel slides, return manual-only attachments
async function archiveExistingCarouselSlides(
  supabase: any,
  demandId: string
): Promise<{ archivedCount: number }> {
  const { data: demand } = await supabase
    .from("demands")
    .select("attachments, rejected_attachments")
    .eq("id", demandId)
    .single();

  if (!demand) return { archivedCount: 0 };

  const currentAttachments = Array.isArray(demand.attachments) ? demand.attachments : [];
  const existingRejected = Array.isArray(demand.rejected_attachments) ? demand.rejected_attachments : [];

  const aiSlides = currentAttachments.filter((a: any) => isAiCarouselSlide(a));
  const manualAttachments = currentAttachments.filter((a: any) => !isAiCarouselSlide(a));

  if (aiSlides.length === 0) return { archivedCount: 0 };

  console.log(`  → Archiving ${aiSlides.length} existing AI carousel slides to history`);

  const rejectedBatch = {
    rejected_at: new Date().toISOString(),
    reason: "carousel_regeneration",
    attachments: aiSlides,
  };

  await supabase
    .from("demands")
    .update({
      attachments: manualAttachments,
      rejected_attachments: [...existingRejected, rejectedBatch],
    })
    .eq("id", demandId);

  return { archivedCount: aiSlides.length };
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch API keys
    const { data: googleKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "Google AI Studio")
      .single();

    const GOOGLE_API_KEY = googleKeyData?.key_value;
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave 'Google AI Studio' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: openaiKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "OPENAI_API_KEY")
      .single();

    const OPENAI_API_KEY = openaiKeyData?.key_value;
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave 'OPENAI_API_KEY' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // ============ STEP 0: Archive existing AI slides ============
    const { archivedCount } = await archiveExistingCarouselSlides(supabase, demandId);
    if (archivedCount > 0) {
      console.log(`✅ Step 0: Archived ${archivedCount} previous AI slides to history`);
    }

    // 3. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, sector, products_services, content_requirements, logo_url, logo_position, logo_size")
      .eq("id", demand.client_id)
      .single();

    // 3b. Fetch visual identity preset (4 colors + font)
    let presetColors = {
      primary: client?.brand_primary_color || "#000000",
      secondary: client?.brand_secondary_color || "#FFFFFF",
      highlight: null as string | null,
      text: null as string | null,
      font: client?.brand_font || "Montserrat",
    };

    const { data: viPreset } = await supabase
      .from("visual_identity_presets")
      .select("primary_color, secondary_color, highlight_color, text_color, font_name")
      .eq("company_id", demand.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (viPreset) {
      presetColors = {
        primary: viPreset.primary_color || presetColors.primary,
        secondary: viPreset.secondary_color || presetColors.secondary,
        highlight: viPreset.highlight_color,
        text: viPreset.text_color,
        font: viPreset.font_name || presetColors.font,
      };
    }

    const brandName = client?.fantasy_name || client?.name || "Marca";

    // 4. Fetch mascot images (limit to 1 to save memory)
    let mascotImageUrl: string | null = null;
    if (client?.has_mascot) {
      const { data: mascotImages } = await supabase
        .from("company_mascot_images")
        .select("image_url")
        .eq("company_id", demand.client_id)
        .order("position", { ascending: true })
        .limit(1);

      if (mascotImages && mascotImages.length > 0) {
        mascotImageUrl = mascotImages[0].image_url;
      }
    }

    // 5. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", demand.tenant_id)
      .eq("prompt_key", "generate_carousel_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

    // 6. Fetch active strategy (shorter snippet to save memory)
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const strategyText = strategy?.strategy_text
      ? strategy.strategy_text.substring(0, 800)
      : "";

    // 7. Build card content
    const cardContent = [
      demand.title ? `Título: ${demand.title}` : "",
      demand.objective ? `Objetivo: ${demand.objective}` : "",
      demand.instructions ? `Instruções: ${demand.instructions.replace(/<[^>]*>/g, " ").trim()}` : "",
    ].filter(Boolean).join("\n");

    const slideCount = 5;

    // ============ STEP 1: Generate slide texts via OpenAI ============
    console.log(`Step 1: Generating ${slideCount} slide texts via OpenAI o4-mini...`);

    const mascotInfo = mascotImageUrl
      ? `O cliente possui um mascote oficial. ${client?.mascot_description ? `Descrição: ${client.mascot_description}.` : ""}`
      : "";

    const contentReqsSection = (client as any)?.content_requirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${(client as any).content_requirements}\n`
      : '';

    const systemPrompt = `Você é um copywriter especialista em marketing digital. Crie textos para carrosséis.

${basePrompt ? "DIRETRIZES DO SISTEMA (PROMPT DO CARROSSEL):\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA:\n" + strategyText + "\n\n" : ""}CLIENTE: ${brandName} | ${client?.sector || "N/A"} | ${client?.products_services || "N/A"}
${mascotInfo}
${contentReqsSection}
REGRAS:
1. Retorne EXATAMENTE ${slideCount} slides
2. Texto conciso e impactante, sem limite rígido de caracteres
3. Slide 1: gancho de atenção
4. Último slide: CTA
5. Use a função "create_carousel_slides"`;

    const userPrompt = `Crie ${slideCount} slides para este card:\n\n${cardContent}`;

    const contentResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "o4-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_carousel_slides",
              description: "Retorna os slides do carrossel",
              parameters: {
                type: "object",
                properties: {
                  slides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        label: { type: "string" },
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
      console.error("OpenAI error:", contentResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Erro OpenAI: ${contentResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentData = await contentResponse.json();
    const toolCall = contentData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
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

    // ============ STEP 2: Generate images one at a time, attach incrementally ============
    console.log(`Step 2: Generating ${slides.length} slide images via Gemini 3 Pro Image...`);

    const mascotSection = mascotImageUrl
      ? `MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência — mesma aparência, cabelo, roupa, proporções. O mascote DEVE aparecer integrado ao design como protagonista visual.`
      : client?.has_mascot
        ? `A marca possui um mascote (${client?.mascot_description || "sem descrição"}), mas nenhuma imagem de referência está disponível. Tente incluí-lo baseado na descrição.`
        : `NÃO inclua personagens ou figuras humanas.`;

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

    // Fetch mascot image ONCE, keep reference
    let mascotInline: { mimeType: string; data: string } | null = null;
    if (mascotImageUrl) {
      try {
        const imgResp = await fetch(mascotImageUrl);
        if (imgResp.ok) {
          const imgBuffer = await imgResp.arrayBuffer();
          const bytes = new Uint8Array(imgBuffer);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          mascotInline = { mimeType: imgResp.headers.get("content-type") || "image/png", data: btoa(binary) };
          console.log(`  → Mascot reference image pre-fetched`);
        }
      } catch (e) {
        console.error("Failed to fetch mascot:", e);
      }
    }

    // Fetch logo image ONCE
    let logoInline: { mimeType: string; data: string } | null = null;
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
          logoInline = { mimeType: imgResp.headers.get("content-type") || "image/png", data: btoa(binary) };
          console.log("  → Logo reference image pre-fetched");
        }
      } catch (e) {
        console.error("Failed to fetch logo:", e);
      }
    }

    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_API_KEY}`;
    let totalGenerated = 0;

    // Build slide context once (short)
    const slideContext = slides.map((s, idx) => `S${idx + 1}: "${s.text}"`).join(" | ");

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNumber = i + 1;

      const imagePrompt = `Crie imagem profissional para SLIDE ${slideNumber}/${slides.length} de carrossel social.

TEXTO: "${slide.text}" (${slide.label})
CONTEXTO: ${slideContext}
MARCA: "${brandName}" | ${client?.sector || "N/A"} | ${client?.products_services || "N/A"}

PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):
- Cor primária (${presetColors.primary}): Use em fundos, banners, boxes, shapes e elementos gráficos dominantes do layout
- Cor secundária (${presetColors.secondary}): Use em acentos, bordas, elementos complementares e variações de fundo
${presetColors.highlight ? `- Cor de destaque (${presetColors.highlight}): Use em botões, badges, CTAs, ícones e pequenos destaques visuais` : ""}
${presetColors.text ? `- Cor do texto (${presetColors.text}): Use na tipografia principal sobre os fundos` : ""}
- Tipografia: ${presetColors.font}
${mascotSection}

REGRA CRÍTICA DE APLICAÇÃO DE CORES:
As cores da marca devem ser aplicadas APENAS em elementos de design gráfico (fundos, gradientes, boxes, banners, shapes, tipografia, ícones, bordas).
NUNCA aplique as cores da marca em objetos reais, pessoas, animais ou elementos figurativos.
Exemplo: se a cor primária é verde, o fundo e os boxes devem ser verdes, mas um leão deve ter cores NATURAIS realistas.
Os sujeitos e ilustrações figurativas devem manter aparência NATURAL e REALISTA.
A paleta de cores cria a identidade visual através do LAYOUT e DESIGN, não tingindo os elementos figurativos.

ESTILO VISUAL OBRIGATÓRIO:
- Crie designs com estilo de ilustração 3D estilizada, moderna e profissional
- Use cenários detalhados e realistas como background (escritórios, ambientes temáticos, paisagens relevantes ao tema)
- Tipografia bold, grande e impactante integrada ao design (não sobreposta de forma genérica)
- Composição dinâmica com profundidade e camadas visuais
- Qualidade de design de agência profissional de alto nível
- Contraste alto entre texto e fundo para legibilidade perfeita
- Elementos gráficos decorativos sutis que enriquecem o layout
- Cores vibrantes e paleta coerente com a identidade visual da marca

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

REGRAS: Formato 1:1 (1024x1024). O texto "${slide.text}" DEVE aparecer legível. Design coerente entre slides. Indicador ${slideNumber}/${slides.length} discreto. SEM logo/marca d'água.`.trim();

      console.log(`  → Generating slide ${slideNumber}/${slides.length}...`);

      const parts: any[] = [{ text: imagePrompt }];
      if (mascotInline) {
        parts.push({ inlineData: mascotInline });
      }

      try {
        const imgResponse = await fetch(googleApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        });

        if (!imgResponse.ok) {
          const errText = await imgResponse.text();
          console.error(`Slide ${slideNumber} error:`, imgResponse.status, errText);
          if (imgResponse.status === 429) {
            console.warn(`Rate limit at slide ${slideNumber}, stopping`);
            break;
          }
          continue;
        }

        const imgData = await imgResponse.json();

        // Extract base64 image
        let imageBase64 = "";
        let imageMimeType = "image/png";
        for (const candidate of (imgData.candidates || [])) {
          for (const part of (candidate.content?.parts || [])) {
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
          console.warn(`  ⚠ No image for slide ${slideNumber}`);
          continue;
        }

        // Decode, upload, then clear base64 from memory
        const imageBytes = decodeBase64(imageBase64);
        imageBase64 = ""; // Free memory immediately

        const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
        const fileName = `auto-generated/${demand.client_id}/${demandId}/carousel-slide-${slideNumber}-${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(fileName, imageBytes, { contentType: imageMimeType, upsert: false });

        if (uploadError) {
          console.error(`Upload error slide ${slideNumber}:`, uploadError);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from("card-attachments")
          .getPublicUrl(fileName);

        const newAttachment = {
          url: publicUrlData.publicUrl,
          name: `Carrossel Slide ${slideNumber} - ${brandName}.${ext}`,
          type: imageMimeType,
          size: imageBytes.length,
          storagePath: fileName,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "auto-generator", email: "system@ai", name: "IA - Gemini 3 Pro Image (Carrossel)" },
          cardId: demandId,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        };

        // Attach incrementally — fetch current, replace any AI slide with same number, append new
        const { data: currentDemand } = await supabase
          .from("demands")
          .select("attachments")
          .eq("id", demandId)
          .single();

        const currentAttachments = Array.isArray(currentDemand?.attachments) ? currentDemand.attachments : [];
        
        // Remove any existing AI slide with the same slide number to prevent duplicates
        const slideNamePattern = new RegExp(`Carrossel Slide ${slideNumber}\\b`, "i");
        const filteredAttachments = currentAttachments.filter((a: any) => {
          if (!isAiCarouselSlide(a)) return true; // keep manual attachments
          return !slideNamePattern.test(a.name || ""); // remove same-number AI slide
        });

        await supabase
          .from("demands")
          .update({ attachments: [...filteredAttachments, newAttachment] })
          .eq("id", demandId);

        totalGenerated++;
        console.log(`  ✅ Slide ${slideNumber} generated and attached`);
      } catch (slideError) {
        console.error(`Exception on slide ${slideNumber}:`, slideError);
        continue;
      }
    }

    // Free mascot from memory
    mascotInline = null;

    if (totalGenerated === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem de carrossel foi gerada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Auto-generated ${totalGenerated} carousel slides for demand ${demandId} (archived ${archivedCount} previous)`);

    return new Response(
      JSON.stringify({
        success: true,
        totalGenerated,
        totalSlides: slides.length,
        archivedSlides: archivedCount,
        demandId,
        message: `${totalGenerated} slides do carrossel gerados e anexados!`,
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
