import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    return { size: "1024x1792", label: "9:16" };
  }
  if (type.includes("cover") || type.includes("banner") || type.includes("capa")) {
    return { size: "1792x1024", label: "16:9" };
  }
  return { size: "1024x1024", label: "1:1" };
}

serve(async (req) => {
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
      .select("name, fantasy_name, logo_url, brand_primary_color, brand_secondary_color, brand_font")
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
      ? allSlides.filter((s) => s.slideNumber === slideNumber)
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

    const basePrompt = promptData?.prompt_content || "";
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz: ${strategy.strategy_text.substring(0, 300)}`
      : "";

    const generatedAttachments: any[] = [];
    const existingAttachments = demand.attachments || [];
    const errors: string[] = [];

    // 7. Generate images for each slide using DALL-E 3
    for (const slide of slidesToGenerate) {
      const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional para post de rede social.

CONTEÚDO DO SLIDE ${slide.slideNumber}/${allSlides.length}:
Texto principal: "${slide.title}"
${slide.body ? `Texto complementar: "${slide.body}"` : ""}

BRANDING:
- Marca: "${brandName}"
- Cor primária: ${primaryColor}
- Cor secundária: ${secondaryColor}
- Tipografia: ${brandFont}
- Incluir nome da marca sutilmente no canto inferior

ESTILO:
- Design limpo, moderno e profissional para redes sociais
- Texto centralizado com hierarquia visual clara
- Fundo com gradiente sutil usando as cores da marca
- Formato: ${imageSize.label}
`.trim();

      console.log(`Generating DALL-E 3 image for slide ${slide.slideNumber}...`);

      try {
        const dalleResponse = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: imagePrompt,
            n: 1,
            size: imageSize.size,
            quality: "standard",
            response_format: "url",
          }),
        });

        if (!dalleResponse.ok) {
          const errorText = await dalleResponse.text();
          console.error(`DALL-E 3 error for slide ${slide.slideNumber}:`, dalleResponse.status, errorText);

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
        const imageUrl = dalleData.data?.[0]?.url;

        if (!imageUrl) {
          console.error(`No image URL in DALL-E response for slide ${slide.slideNumber}:`, JSON.stringify(dalleData).substring(0, 300));
          errors.push(`Slide ${slide.slideNumber}: Nenhuma imagem retornada`);
          continue;
        }

        // 8. Download the generated image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          console.error(`Failed to download image for slide ${slide.slideNumber}`);
          errors.push(`Slide ${slide.slideNumber}: Erro ao baixar imagem`);
          continue;
        }

        const imageBlob = await imageResponse.blob();
        const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());

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
          name: `Slide ${slide.slideNumber} - ${brandName}`,
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
