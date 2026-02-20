import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// Determine image size based on demand type/channel
function getImageSize(demandType: string | null, channel: string | null): { size: string; label: string } {
  const type = (demandType || "").toLowerCase();

  if (type.includes("reel") || type.includes("stories") || type.includes("story") || type.includes("video curto")) {
    return { size: "1024x1536", label: "9:16" };
  }
  if (type.includes("cover") || type.includes("banner") || type.includes("capa")) {
    return { size: "1536x1024", label: "16:9" };
  }
  return { size: "1024x1024", label: "1:1" };
}

// Download an image from URL and return as base64
async function downloadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download image from ${url}: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error(`Error downloading image:`, err);
    return null;
  }
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch OpenAI API key from api_keys table
    const { data: apiKeyRow, error: apiKeyError } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "OPENAI_API_KEY")
      .single();

    if (apiKeyError || !apiKeyRow?.key_value) {
      console.error("OpenAI API key not found in api_keys table:", apiKeyError);
      return new Response(
        JSON.stringify({ error: "Chave da API OpenAI não encontrada. Configure em /dev/apis." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = apiKeyRow.key_value;

    // 2. Fetch the demand
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

    // 3. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, logo_url, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_url, mascot_description")
      .eq("id", demand.client_id)
      .single();

    // 4. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", demand.tenant_id)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    // 5. Fetch active strategy for tone of voice
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // 6. Parse slides
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

    const imageSize = getImageSize(demand.demand_type, demand.channel);
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

    // If mascot is mentioned and client has mascot image, download it for reference
    let mascotImageBase64: string | null = null;
    const shouldUseMascotImage = hasMascot && mascotUrl && mentionsMascot;

    if (shouldUseMascotImage) {
      console.log("🎭 Mascot mentioned in activity - downloading mascot image for reference...");
      mascotImageBase64 = await downloadImageAsBase64(mascotUrl);
      if (mascotImageBase64) {
        console.log("✅ Mascot image downloaded successfully for reference");
      } else {
        console.warn("⚠️ Could not download mascot image, will use text-only prompt");
      }
    }

    const basePrompt = promptData?.prompt_content || "";
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz: ${strategy.strategy_text.substring(0, 300)}`
      : "";

    const generatedAttachments: any[] = [];
    const existingAttachments = demand.attachments || [];
    const errors: string[] = [];

    // 7. Generate images for each slide using gpt-image-1
    for (const slide of slidesToGenerate) {
      const mascotDescriptionText = mascotDescription ? ` Características do mascote: ${mascotDescription}.` : "";
      const mascotInstruction = hasMascot
        ? mentionsMascot
          ? `- MASCOTE: A marca possui um mascote oficial.${mascotDescriptionText}${mascotImageBase64 ? " A imagem de referência do mascote foi fornecida. Reproduza FIELMENTE este mascote/personagem no design, mantendo suas características visuais (cores, forma, estilo, expressão). O mascote deve ser um elemento central e de destaque." : " Inclua um personagem/mascote simpático e carismático como elemento central ou de destaque no design, representando a marca de forma lúdica e memorável."}`
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
- Formato: ${imageSize.label}
`.trim();

      console.log(`Generating gpt-image-1 image for slide ${slide.slideNumber}...${shouldUseMascotImage && mascotImageBase64 ? " (with mascot reference image)" : ""}`);

      try {
        let dalleResponse: Response;

        if (shouldUseMascotImage && mascotImageBase64) {
          // Use gpt-image-1 with reference image via images/edits endpoint
          const formData = new FormData();
          
          // Convert mascot base64 to a File/Blob
          const mascotBinary = atob(mascotImageBase64);
          const mascotBytes = new Uint8Array(mascotBinary.length);
          for (let i = 0; i < mascotBinary.length; i++) {
            mascotBytes[i] = mascotBinary.charCodeAt(i);
          }
          const mascotBlob = new Blob([mascotBytes], { type: "image/png" });
          formData.append("image[]", mascotBlob, "mascot.png");
          formData.append("model", "gpt-image-1");
          formData.append("prompt", imagePrompt);
          formData.append("n", "1");
          formData.append("size", imageSize.size);
          formData.append("quality", "medium");

          dalleResponse = await fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openaiApiKey}`,
            },
            body: formData,
          });
        } else {
          // Standard text-only generation
          dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-image-1",
              prompt: imagePrompt,
              n: 1,
              size: imageSize.size,
              quality: "medium",
            }),
          });
        }

        if (!dalleResponse.ok) {
          const errorText = await dalleResponse.text();
          console.error(`gpt-image-1 error for slide ${slide.slideNumber}:`, dalleResponse.status, errorText);

          if (dalleResponse.status === 429) {
            errors.push(`Slide ${slide.slideNumber}: Rate limit excedido`);
            continue;
          }
          if (dalleResponse.status === 401) {
            return new Response(
              JSON.stringify({ error: "Chave da API OpenAI inválida ou expirada. Atualize em /dev/apis." }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          errors.push(`Slide ${slide.slideNumber}: Erro ${dalleResponse.status}`);
          continue;
        }

        const dalleData = await dalleResponse.json();
        const b64Image = dalleData.data?.[0]?.b64_json;

        if (!b64Image) {
          console.error(`No image data in gpt-image-1 response for slide ${slide.slideNumber}:`, JSON.stringify(dalleData).substring(0, 300));
          errors.push(`Slide ${slide.slideNumber}: Nenhuma imagem retornada`);
          continue;
        }

        // 8. Decode base64 image directly
        const binaryString = atob(b64Image);
        const imageBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imageBytes[i] = binaryString.charCodeAt(i);
        }

        const fileName = `ai-generated-slide-${slide.slideNumber}-${Date.now()}.png`;
        const storagePath = `${demand.client_id}/${demand.id}/${fileName}`;

        // 9. Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(storagePath, imageBytes, {
            contentType: "image/png",
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
          name: `Slide ${slide.slideNumber} - ${brandName}.png`,
          type: "image/png",
          size: imageBytes.length,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "ai-generator", email: "system@ai", name: "IA - Gerador de Posts" },
          cardId: demand.id,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        };

        generatedAttachments.push(attachment);
        console.log(`✅ Slide ${slide.slideNumber} generated and uploaded successfully`);
      } catch (slideError) {
        console.error(`Exception generating slide ${slide.slideNumber}:`, slideError);
        errors.push(`Slide ${slide.slideNumber}: ${slideError instanceof Error ? slideError.message : "Erro desconhecido"}`);
      }
    }

    // 10. If no images were generated, return error
    if (generatedAttachments.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Nenhuma imagem foi gerada. Verifique a configuração da API OpenAI.",
          details: errors,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Update demand attachments
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
        used_mascot_reference: !!(shouldUseMascotImage && mascotImageBase64),
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
