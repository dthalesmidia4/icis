import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseSlides(description: string): { slideNumber: number; title: string; body: string }[] {
  if (!description) return [];
  const text = description.replace(/<[^>]*>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const normalizedText = text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
  const slideRegex = /(?:SLIDE|FRAME|CENA|IMAGEM)\s*(\d+)\b\s*(?:[—\-:]\s*)?([\s\S]*?)(?=(?:SLIDE|FRAME|CENA|IMAGEM)\s*\d+\b|$)/gi;
  const slides: { slideNumber: number; title: string; body: string }[] = [];
  let match;
  while ((match = slideRegex.exec(normalizedText)) !== null) {
    const slideNumber = parseInt(match[1]);
    const content = match[2].trim();
    const lines = content.split(/\n+/).filter((l: string) => l.trim());
    const title = lines[0] || "";
    const body = lines.slice(1).join("\n").trim();
    slides.push({ slideNumber, title, body });
  }
  if (slides.length === 0 && normalizedText.trim()) {
    slides.push({ slideNumber: 1, title: normalizedText.trim().substring(0, 100), body: normalizedText.trim() });
  }
  return slides;
}

function getAspectRatioInfo(demandType: string | null, _channel: string | null): { label: string; width: number; height: number } {
  const type = (demandType || "").toLowerCase();
  if (type.includes("reel") || type.includes("stories") || type.includes("story") || type.includes("video curto")) {
    return { label: "9:16 (portrait)", width: 1024, height: 1536 };
  }
  if (type.includes("cover") || type.includes("banner") || type.includes("capa")) {
    return { label: "16:9 (landscape)", width: 1536, height: 1024 };
  }
  return { label: "1:1 (square)", width: 1024, height: 1024 };
}

function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { demandId, slideNumber, replaceSlide } = await req.json();

    if (!demandId) {
      return new Response(JSON.stringify({ error: "demandId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // 1. Fetch the demand
    const { data: demand, error: demandError } = await supabase
      .from("demands")
      .select("*")
      .eq("id", demandId)
      .single();

    if (demandError || !demand) {
      return new Response(JSON.stringify({ error: "Demanda não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch client branding (including content_requirements)
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, logo_url, logo_position, logo_size, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_url, mascot_description, sector, products_services, content_requirements")
      .eq("id", demand.client_id)
      .single();

    // 3. Fetch visual identity preset (4 colors + font)
    let presetColors = {
      primary: client?.brand_primary_color || "#000000",
      secondary: client?.brand_secondary_color || "#FFFFFF",
      highlight: null as string | null,
      text: null as string | null,
      font: client?.brand_font || "Montserrat",
    };

    const { data: preset } = await supabase
      .from("visual_identity_presets")
      .select("primary_color, secondary_color, highlight_color, text_color, font_name")
      .eq("company_id", demand.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
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

    // 4. Fetch mascot images from gallery (ALWAYS when has_mascot, no keyword check)
    let mascotInlineImages: { mimeType: string; data: string }[] = [];
    const hasMascot = client?.has_mascot || false;

    if (hasMascot) {
      const { data: mascotImages } = await supabase
        .from("company_mascot_images")
        .select("image_url")
        .eq("company_id", demand.client_id)
        .order("position", { ascending: true })
        .limit(2);

      if (mascotImages && mascotImages.length > 0) {
        for (const mi of mascotImages) {
          try {
            const imgResp = await fetch(mi.image_url);
            if (imgResp.ok) {
              const imgBuffer = await imgResp.arrayBuffer();
              const bytes = new Uint8Array(imgBuffer);
              let binary = "";
              const chunkSize = 8192;
              for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
              }
              mascotInlineImages.push({
                mimeType: imgResp.headers.get("content-type") || "image/png",
                data: btoa(binary),
              });
              console.log("  → Mascot reference image pre-fetched from gallery");
            }
          } catch (e) {
            console.error("Failed to fetch mascot image:", e);
          }
        }
      }
    }

    // 5. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", demand.tenant_id)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    // 6. Fetch active strategy
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // 7. Parse slides — try description first, then instructions
    let allSlides = parseSlides(demand.description || "");
    if (allSlides.length <= 1) {
      const fromInstructions = parseSlides(demand.instructions || "");
      if (fromInstructions.length > allSlides.length) {
        allSlides = fromInstructions;
        console.log(`Slides parsed from instructions field: ${allSlides.length} slides found`);
      }
    }
    if (allSlides.length === 0) {
      const fallbackText = demand.title || "Post";
      const fallbackBody = stripHtml(demand.description) || stripHtml(demand.instructions) || demand.objective || "";
      allSlides = [{ slideNumber: 1, title: fallbackText, body: fallbackBody }];
    }

    const slidesToGenerate = slideNumber
      ? (() => {
          const exact = allSlides.filter((s) => s.slideNumber === slideNumber);
          if (exact.length > 0) return exact;
          const idx = slideNumber - 1;
          if (idx >= 0 && idx < allSlides.length) return [allSlides[idx]];

          // Fallback for legacy cards where description does not contain parsable slide blocks.
          // Allows single-slide regeneration to proceed instead of returning 400.
          if (replaceSlide) {
            const fallbackTitle = demand.title?.trim() || `Slide ${slideNumber}`;
            const fallbackBody = [
              stripHtml(demand.description),
              stripHtml(demand.objective),
              stripHtml(demand.instructions),
              stripHtml(demand.observations),
            ].find(Boolean) || "";

            console.warn(`Slide ${slideNumber} not found in parsed description, using fallback content.`);
            return [{ slideNumber, title: fallbackTitle, body: fallbackBody }];
          }

          return [];
        })()
      : allSlides;

    if (slidesToGenerate.length === 0) {
      return new Response(
        JSON.stringify({ error: "Slide específico não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aspectInfo = getAspectRatioInfo(demand.demand_type, demand.channel);
    const brandName = client?.fantasy_name || client?.name || "Marca";
    const basePrompt = promptData?.prompt_content || "";
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}`
      : "";

    const contentReqsSection = client?.content_requirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${client.content_requirements}\n`
      : "";

    const mascotSection = mascotInlineImages.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas. NÃO altere nenhuma característica do mascote. O mascote DEVE aparecer no design de forma integrada e harmoniosa como protagonista visual.`
      : hasMascot
        ? `- A marca possui um mascote (${client?.mascot_description || "sem descrição"}), mas nenhuma imagem de referência está disponível. Tente incluí-lo se possível baseado na descrição.`
        : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    const generatedAttachments: any[] = [];
    const existingAttachments = demand.attachments || [];
    const errors: string[] = [];
    const totalSlidesForPrompt = slideNumber ? Math.max(allSlides.length, slideNumber) : allSlides.length;

    // 8. Generate images for each slide
    for (const slide of slidesToGenerate) {
      // When regenerating a single slide, use ONLY that slide's specific content
      // When generating all slides, include full card context for richer prompts
      const isSingleSlideRegen = !!slideNumber;

      const slideContentSection = isSingleSlideRegen
        ? `CONTEÚDO DESTE SLIDE (use EXCLUSIVAMENTE este conteúdo para gerar a imagem, NÃO use conteúdo de outros slides):
Texto principal: "${slide.title}"
${slide.body ? `Texto complementar/detalhes: "${slide.body}"` : ""}`
        : (() => {
            const cardContent = [
              demand.title ? `Título: ${demand.title}` : "",
              demand.objective ? `Objetivo: ${demand.objective}` : "",
              demand.instructions ? `Instruções: ${demand.instructions.replace(/<[^>]*>/g, " ").trim()}` : "",
              demand.description ? `Descrição: ${demand.description.replace(/<[^>]*>/g, " ").trim()}` : "",
              demand.observations ? `Observações: ${demand.observations?.replace(/<[^>]*>/g, " ").trim()}` : "",
            ].filter(Boolean).join("\n");
            return `CONTEÚDO DO SLIDE ${slide.slideNumber}/${totalSlidesForPrompt}:
Texto principal: "${slide.title}"
${slide.body ? `Texto complementar: "${slide.body}"` : ""}

CONTEÚDO COMPLETO DO CARD:
${cardContent}`;
          })();

      const isFirstSlide = slide.slideNumber === 1;
      const firstSlideHook = isFirstSlide && totalSlidesForPrompt > 1
        ? `\nREGRA OBRIGATÓRIA PARA O PRIMEIRO SLIDE (GANCHO):
- Este é o PRIMEIRO slide de um carrossel com ${totalSlidesForPrompt} slides.
- Ele DEVE funcionar como um GANCHO visual para prender a atenção do usuário.
- Use uma frase curta, impactante e que faça sentido com o tema do carrossel.
- A frase NÃO precisa ser provocativa, mas DEVE despertar curiosidade e ter conexão clara com o conteúdo que virá nos próximos slides.
- DESIGN VISUAL DO GANCHO (OBRIGATÓRIO): O texto do gancho DEVE ser apresentado de forma visualmente impactante e artística, NÃO como texto simples sobre o fundo. Use recursos visuais como:
  * Caixas/boxes coloridos com bordas arredondadas envolvendo o texto (estilo speech bubble ou card)
  * Faixas ou banners com cor de destaque por trás do texto
  * Elementos gráficos decorativos (ícones, emojis 3D, setas, formas geométricas) ao redor do texto
  * Contraste forte entre o fundo do box e o texto para máxima legibilidade
  * Camadas visuais com profundidade (sombras, gradientes nos boxes)
- Tipografia GRANDE, BOLD e bem posicionada dentro dos elementos visuais.
- NÃO inclua informações detalhadas — apenas o gancho visual e textual.
- O objetivo é fazer o usuário querer deslizar para o próximo slide.
- REFERÊNCIA DE ESTILO: Pense em posts profissionais de Instagram onde o texto principal aparece dentro de balões coloridos ou cards estilizados com ícones temáticos, criando uma composição rica e chamativa.\n`
        : "";

      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}${contentReqsSection}${firstSlideHook}Crie uma imagem profissional de post para rede social.

${slideContentSection}

PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):
- Marca: "${brandName}" | ${client?.sector || "N/A"} | ${client?.products_services || "N/A"}
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
- O texto do post DEVE aparecer legível e bem posicionado na imagem

REGRAS OBRIGATÓRIAS:
- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem
- Design profissional para redes sociais
- Formato/Proporção: ${aspectInfo.label}
- IMPORTANTE: Gere um POST COMPLETO para rede social, não apenas um elemento isolado
- IMPORTANTE: Siga EXATAMENTE o cenário, ambiente e background descritos na atividade
`.trim();

      console.log(`Generating image for slide ${slide.slideNumber} via Gemini 3 Pro Image...${mascotInlineImages.length > 0 ? " (with mascot reference)" : ""}`);

      try {
        const parts: any[] = [{ text: imagePrompt }];

        // Attach mascot reference images
        for (const mascotImg of mascotInlineImages) {
          parts.push({ inlineData: mascotImg });
        }

        const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_API_KEY}`;

        const response = await fetch(googleApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini 3 Pro error for slide ${slide.slideNumber}:`, response.status, errorText);
          if (response.status === 429) {
            errors.push(`Slide ${slide.slideNumber}: Rate limit excedido. Tente novamente em alguns minutos.`);
            continue;
          }
          errors.push(`Slide ${slide.slideNumber}: Erro ${response.status}`);
          continue;
        }

        const data = await response.json();

        let imageBase64 = "";
        let imageMimeType = "image/png";
        for (const candidate of (data.candidates || [])) {
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
          console.error(`No image in response for slide ${slide.slideNumber}`);
          errors.push(`Slide ${slide.slideNumber}: Nenhuma imagem retornada pelo modelo`);
          continue;
        }

        const imageBytes = decodeBase64(imageBase64);
        imageBase64 = "";

        const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
        const fileName = `ai-generated-slide-${slide.slideNumber}-${Date.now()}.${ext}`;
        const storagePath = `${demand.client_id}/${demand.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(storagePath, imageBytes, { contentType: imageMimeType, upsert: true });

        if (uploadError) {
          console.error(`Upload error for slide ${slide.slideNumber}:`, uploadError);
          errors.push(`Slide ${slide.slideNumber}: Erro ao fazer upload`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("card-attachments")
          .getPublicUrl(storagePath);

        generatedAttachments.push({
          url: urlData.publicUrl,
          name: `Slide ${slide.slideNumber} - ${brandName}.${ext}`,
          type: imageMimeType,
          size: imageBytes.length,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "ai-generator", email: "system@ai", name: "IA - Gemini 3 Pro Image" },
          cardId: demand.id,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        });

        console.log(`✅ Slide ${slide.slideNumber} generated successfully`);
      } catch (slideError) {
        console.error(`Exception generating slide ${slide.slideNumber}:`, slideError);
        errors.push(`Slide ${slide.slideNumber}: ${slideError instanceof Error ? slideError.message : "Erro desconhecido"}`);
      }
    }

    if (generatedAttachments.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem foi gerada.", details: errors }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Update demand attachments
    let updatedAttachments;
    if (replaceSlide && slideNumber && generatedAttachments.length === 1) {
      const slidePattern = new RegExp(`Slide\\s*${slideNumber}\\b`, 'i');
      const rejectedAttachment = existingAttachments.find((a: any) =>
        slidePattern.test(a.name || '') && (a.uploadedBy?.id === 'ai-generator' || a.uploadedBy?.id === 'auto-generator')
      );

      if (rejectedAttachment) {
        const { data: currentDemand } = await supabase
          .from("demands")
          .select("rejected_attachments")
          .eq("id", demandId)
          .single();

        const existingRejected = (currentDemand?.rejected_attachments as any[]) || [];
        await supabase
          .from("demands")
          .update({
            rejected_attachments: [...existingRejected, {
              rejected_at: new Date().toISOString(),
              attachments: [rejectedAttachment],
            }]
          })
          .eq("id", demandId);
      }

      updatedAttachments = existingAttachments.map((a: any) => {
        if (slidePattern.test(a.name || '') && (a.uploadedBy?.id === 'ai-generator' || a.uploadedBy?.id === 'auto-generator')) {
          return generatedAttachments[0];
        }
        return a;
      });
      if (JSON.stringify(updatedAttachments) === JSON.stringify(existingAttachments)) {
        updatedAttachments = [...existingAttachments, ...generatedAttachments];
      }
    } else {
      updatedAttachments = [...existingAttachments, ...generatedAttachments];
    }

    const { error: updateError } = await supabase
      .from("demands")
      .update({ attachments: updatedAttachments })
      .eq("id", demandId);

    if (updateError) {
      console.error("Error updating demand attachments:", updateError);
      return new Response(
        JSON.stringify({ error: "Imagens geradas mas erro ao salvar nos anexos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: generatedAttachments.length,
        total_slides: allSlides.length,
        message: `${generatedAttachments.length} imagem(ns) gerada(s) com sucesso`,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-post-image error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
