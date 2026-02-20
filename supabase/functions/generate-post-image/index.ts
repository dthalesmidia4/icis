import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODEL = "gemini-2.0-flash-exp-image-generation";

// Keywords that indicate mascot usage in the activity text
const MASCOT_KEYWORDS = [
  "mascote", "mascot", "personagem", "character",
  "boneco", "avatar da marca", "figura da marca",
  "usar o mascote", "com mascote", "com o mascote",
  "incluir mascote", "incluir o mascote",
];

function textMentionsMascot(text: string): boolean {
  if (!text) return false;
  const lower = text.replace(/<[^>]*>/g, " ").toLowerCase();
  return MASCOT_KEYWORDS.some((kw) => lower.includes(kw));
}

// Parse slides from description
function parseSlides(description: string): { slideNumber: number; title: string; body: string }[] {
  if (!description) return [];

  const text = description.replace(/<[^>]*>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

  const slideRegex = /(?:SLIDE|FRAME|CENA|IMAGEM)\s*(\d+)\s*[—\-:]\s*(.*?)(?=(?:SLIDE|FRAME|CENA|IMAGEM)\s*\d+|$)/gis;
  const slides: { slideNumber: number; title: string; body: string }[] = [];
  let match;

  while ((match = slideRegex.exec(text)) !== null) {
    const slideNumber = parseInt(match[1]);
    const content = match[2].trim();
    const lines = content.split(/\n+/).filter((l: string) => l.trim());
    const title = lines[0] || "";
    const body = lines.slice(1).join("\n").trim();
    slides.push({ slideNumber, title, body });
  }

  if (slides.length === 0 && text.trim()) {
    slides.push({ slideNumber: 1, title: text.trim().substring(0, 100), body: text.trim() });
  }

  return slides;
}

// Determine aspect ratio label based on demand type/channel
function getAspectRatio(demandType: string | null, _channel: string | null): string {
  const type = (demandType || "").toLowerCase();

  if (type.includes("reel") || type.includes("stories") || type.includes("story") || type.includes("video curto")) {
    return "9:16 (portrait, 1024x1536)";
  }
  if (type.includes("cover") || type.includes("banner") || type.includes("capa")) {
    return "16:9 (landscape, 1536x1024)";
  }
  return "1:1 (square, 1024x1024)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { demandId, slideNumber } = await req.json();

    if (!demandId) {
      return new Response(JSON.stringify({ error: "demandId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch Google AI Studio API key from api_keys table
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "Google AI Studio")
      .single();

    if (apiKeyError || !apiKeyData?.key_value) {
      console.error("Google AI Studio API key not found in api_keys table");
      return new Response(
        JSON.stringify({ error: "Chave 'Google AI Studio' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const GOOGLE_API_KEY = apiKeyData.key_value;

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
      return new Response(JSON.stringify({ error: "Demanda não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, logo_url, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_url, mascot_description")
      .eq("id", demand.client_id)
      .single();

    // 3. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", demand.tenant_id)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    // 4. Fetch active strategy for tone of voice
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // 5. Parse slides
    let allSlides = parseSlides(demand.description || "");

    if (allSlides.length === 0) {
      const fallbackText = demand.title || "Post";
      const fallbackBody = demand.description?.replace(/<[^>]*>/g, "").trim() || demand.objective || "";
      allSlides = [{ slideNumber: 1, title: fallbackText, body: fallbackBody }];
    }

    const slidesToGenerate = slideNumber
      ? (() => {
          const exact = allSlides.filter((s) => s.slideNumber === slideNumber);
          if (exact.length > 0) return exact;
          const idx = slideNumber - 1;
          return idx >= 0 && idx < allSlides.length ? [allSlides[idx]] : [];
        })()
      : allSlides;

    if (slidesToGenerate.length === 0) {
      return new Response(
        JSON.stringify({ error: "Slide específico não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aspectRatio = getAspectRatio(demand.demand_type, demand.channel);
    const brandName = client?.fantasy_name || client?.name || "Marca";
    const primaryColor = client?.brand_primary_color || "#000000";
    const secondaryColor = client?.brand_secondary_color || "#FFFFFF";
    const brandFont = client?.brand_font || "Montserrat";
    const hasMascot = client?.has_mascot || false;
    const mascotUrl = client?.mascot_url || null;
    const mascotDescription = client?.mascot_description || null;

    // Check if the activity text mentions the mascot
    const fullText = [demand.description, demand.instructions, demand.observations, demand.title].join(" ");
    const mentionsMascot = textMentionsMascot(fullText);
    const useMascotReference = hasMascot && mentionsMascot && mascotUrl;

    const basePrompt = promptData?.prompt_content || "";
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz: ${strategy.strategy_text.substring(0, 300)}`
      : "";

    const generatedAttachments: any[] = [];
    const existingAttachments = demand.attachments || [];
    const errors: string[] = [];

    // 6. Generate images for each slide using Gemini via Google AI Studio
    for (const slide of slidesToGenerate) {
      const mascotInstruction = hasMascot
        ? mentionsMascot
          ? `- MASCOTE: A marca possui um mascote oficial que DEVE aparecer neste design.${mascotDescription ? `\n  DESCRIÇÃO DETALHADA DO MASCOTE: ${mascotDescription}` : ""}${useMascotReference ? `\n  REFERÊNCIA VISUAL: Uma imagem de referência do mascote foi anexada. Reproduza fielmente suas características visuais, cores e estilo conforme a imagem de referência e a descrição acima.` : ""}\n  O mascote deve ser um elemento de DESTAQUE no design, integrado harmoniosamente à composição do post. NÃO gere apenas o mascote isolado — crie o POST COMPLETO para rede social com o mascote como parte da composição.`
          : `- A marca possui um mascote, mas ele NÃO foi solicitado neste slide. NÃO inclua personagens ou mascotes.`
        : `- NÃO inclua personagens ou mascotes no design.`;

      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional para post de rede social.

CONTEÚDO DO SLIDE ${slide.slideNumber}/${allSlides.length}:
Texto principal: "${slide.title}"
${slide.body ? `Texto complementar: "${slide.body}"` : ""}
${demand.instructions ? `\nINSTRUÇÕES DA DEMANDA:\n${demand.instructions}` : ""}
${demand.observations ? `\nOBSERVAÇÕES ADICIONAIS:\n${demand.observations}` : ""}

BRANDING:
- Marca: "${brandName}"
- Cor primária: ${primaryColor}
- Cor secundária: ${secondaryColor}
- Tipografia: ${brandFont}
- Incluir nome da marca sutilmente no canto inferior
${mascotInstruction}

ESTILO:
- Design limpo, moderno e profissional para redes sociais
- Texto centralizado com hierarquia visual clara
- Fundo com gradiente sutil usando as cores da marca
- Formato/Proporção: ${aspectRatio}
- IMPORTANTE: Gere um POST COMPLETO para rede social, não apenas um elemento isolado
`.trim();

      console.log(`Generating image for slide ${slide.slideNumber} using ${GEMINI_MODEL}...${useMascotReference ? " (with mascot reference)" : ""}`);

      try {
        // Build Gemini API request parts
        const parts: any[] = [{ text: imagePrompt }];

        if (useMascotReference) {
          // Fetch mascot image and send as inline data
          try {
            const mascotResponse = await fetch(mascotUrl);
            if (mascotResponse.ok) {
              const mascotBuffer = await mascotResponse.arrayBuffer();
              const mascotBytes = new Uint8Array(mascotBuffer);
              let mascotB64 = "";
              const chunkSize = 8192;
              for (let i = 0; i < mascotBytes.length; i += chunkSize) {
                const chunk = mascotBytes.subarray(i, i + chunkSize);
                mascotB64 += String.fromCharCode(...chunk);
              }
              mascotB64 = btoa(mascotB64);
              const mascotMime = mascotResponse.headers.get("content-type") || "image/png";
              parts.push({
                inline_data: { mime_type: mascotMime, data: mascotB64 },
              });
              console.log(`  → Mascot reference image attached as inline_data`);
            }
          } catch (mascotErr) {
            console.warn("Failed to fetch mascot image:", mascotErr);
          }
        }

        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;

        const geminiResponse = await fetch(GEMINI_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
            },
          }),
        });

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error(`Gemini error for slide ${slide.slideNumber}:`, geminiResponse.status, errorText);

          if (geminiResponse.status === 429) {
            errors.push(`Slide ${slide.slideNumber}: Rate limit excedido. Tente novamente em alguns minutos.`);
            continue;
          }

          errors.push(`Slide ${slide.slideNumber}: Erro ${geminiResponse.status}`);
          continue;
        }

        const geminiData = await geminiResponse.json();
        
        // Extract image from Gemini response
        const responseParts = geminiData.candidates?.[0]?.content?.parts || [];
        const imagePart = responseParts.find((p: any) => p.inlineData);

        if (!imagePart) {
          console.error(`No image in response for slide ${slide.slideNumber}:`, JSON.stringify(geminiData).substring(0, 500));
          errors.push(`Slide ${slide.slideNumber}: Nenhuma imagem retornada pelo modelo`);
          continue;
        }

        const b64Image = imagePart.inlineData.data;
        const mimeType = imagePart.inlineData.mimeType || "image/png";
        const imageFormat = mimeType.split("/")[1] || "png";
        const contentType = mimeType;
        const extension = imageFormat === "jpeg" ? "jpg" : imageFormat;

        // Decode base64
        const binaryString = atob(b64Image);
        const imageBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imageBytes[i] = binaryString.charCodeAt(i);
        }

        const fileName = `ai-generated-slide-${slide.slideNumber}-${Date.now()}.${extension}`;
        const storagePath = `${demand.client_id}/${demand.id}/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(storagePath, imageBytes, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error(`Upload error for slide ${slide.slideNumber}:`, uploadError);
          errors.push(`Slide ${slide.slideNumber}: Erro ao fazer upload`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("card-attachments")
          .getPublicUrl(storagePath);

        const attachment = {
          url: urlData.publicUrl,
          name: `Slide ${slide.slideNumber} - ${brandName}.${extension}`,
          type: contentType,
          size: imageBytes.length,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "ai-generator", email: "system@ai", name: "IA - Gemini (Google AI Studio)" },
          cardId: demand.id,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        };

        generatedAttachments.push(attachment);
        console.log(`✅ Slide ${slide.slideNumber} generated and uploaded successfully (${imageFormat})`);
      } catch (slideError) {
        console.error(`Exception generating slide ${slide.slideNumber}:`, slideError);
        errors.push(`Slide ${slide.slideNumber}: ${slideError instanceof Error ? slideError.message : "Erro desconhecido"}`);
      }
    }

    // 7. If no images were generated, return error
    if (generatedAttachments.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Nenhuma imagem foi gerada. Verifique os logs para mais detalhes.",
          details: errors,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Update demand attachments
    const updatedAttachments = [...existingAttachments, ...generatedAttachments];
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
        used_mascot_reference: !!useMascotReference,
        used_mascot_in_prompt: !!(hasMascot && mentionsMascot),
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
