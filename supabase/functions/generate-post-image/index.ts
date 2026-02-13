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

  // Remove HTML tags
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

  // If no slides found, treat entire description as single slide
  if (slides.length === 0 && text.trim()) {
    slides.push({ slideNumber: 1, title: text.trim().substring(0, 100), body: text.trim() });
  }

  return slides;
}

// Determine aspect ratio based on demand type/channel
function getAspectRatio(demandType: string | null, channel: string | null): { size: string; label: string } {
  const type = (demandType || "").toLowerCase();
  const ch = (channel || "").toLowerCase();

  if (type.includes("reel") || type.includes("stories") || type.includes("story") || type.includes("video curto")) {
    return { size: "1024x1792", label: "9:16" };
  }
  if (type.includes("cover") || type.includes("banner") || type.includes("capa")) {
    return { size: "1792x1024", label: "16:9" };
  }
  // Default: static / post / carousel
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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

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
      .select("name, fantasy_name, logo_url, brand_primary_color, brand_secondary_color, brand_font")
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
    const allSlides = parseSlides(demand.description || "");
    const slidesToGenerate = slideNumber
      ? allSlides.filter((s) => s.slideNumber === slideNumber)
      : allSlides;

    if (slidesToGenerate.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum slide encontrado na descrição da demanda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aspectRatio = getAspectRatio(demand.demand_type, demand.channel);
    const brandName = client?.fantasy_name || client?.name || "Marca";
    const primaryColor = client?.brand_primary_color || "#000000";
    const secondaryColor = client?.brand_secondary_color || "#FFFFFF";
    const brandFont = client?.brand_font || "Montserrat";

    const basePrompt = promptData?.prompt_content || "";
    const strategySnippet = strategy?.strategy_text
      ? `\nTOM DE VOZ DA MARCA (extraído da estratégia):\n${strategy.strategy_text.substring(0, 500)}\n`
      : "";

    const generatedAttachments: any[] = [];
    const existingAttachments = demand.attachments || [];

    // 6. Generate images for each slide
    for (const slide of slidesToGenerate) {
      const imagePrompt = `
${basePrompt}

${strategySnippet}

INSTRUÇÕES DE GERAÇÃO DE IMAGEM:

Gere uma imagem profissional para o slide ${slide.slideNumber}/${allSlides.length}.

TEXTO PRINCIPAL A INCLUIR NA IMAGEM:
"${slide.title}"
${slide.body ? `\nTexto complementar: "${slide.body}"` : ""}

ESPECIFICAÇÕES TÉCNICAS:
- ASPECTRATIO: ${aspectRatio.label}
- BRANDING: Tipografia "${brandFont}", Cor primária ${primaryColor}, Cor secundária ${secondaryColor}
- LAYOUT: Design limpo e profissional, consistente para todos os clientes. Texto centralizado com hierarquia visual clara. Fundo com gradiente sutil ou textura usando as cores da marca.
- MARCA: "${brandName}" - incluir nome da marca de forma sutil no canto inferior.
- ESTILO: Moderno, profissional, adequado para redes sociais. Manter consistência visual entre todos os slides do carrossel.

Gere a imagem diretamente sem texto adicional.
`.trim();

      console.log(`Generating image for slide ${slide.slideNumber}...`);

      // Call Lovable AI Gateway (GPT-5 with image generation)
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5",
          messages: [
            {
              role: "user",
              content: imagePrompt,
            },
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`AI gateway error for slide ${slide.slideNumber}:`, aiResponse.status, errorText);
        
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        continue; // Skip this slide on error
      }

      const aiData = await aiResponse.json();
      
      // Extract image URL from response
      const choice = aiData.choices?.[0];
      const content = choice?.message?.content;
      
      // GPT-5 image generation returns inline images or URLs
      // Check for image_url in content parts
      let imageUrl: string | null = null;
      
      if (typeof content === "string") {
        // Try to extract image URL from markdown
        const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (urlMatch) {
          imageUrl = urlMatch[1];
        } else {
          // Try plain URL
          const plainUrl = content.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|webp))/i);
          if (plainUrl) {
            imageUrl = plainUrl[1];
          }
        }
      } else if (Array.isArray(content)) {
        // Content might be array of parts
        for (const part of content) {
          if (part.type === "image_url" && part.image_url?.url) {
            imageUrl = part.image_url.url;
            break;
          }
        }
      }

      if (!imageUrl) {
        console.error(`No image URL found in response for slide ${slide.slideNumber}`, JSON.stringify(aiData).substring(0, 500));
        continue;
      }

      // 7. Download and upload to storage
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error(`Failed to download image for slide ${slide.slideNumber}`);
        continue;
      }
      const imageBlob = await imageResponse.blob();
      const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());

      const fileName = `ai-generated-slide-${slide.slideNumber}-${Date.now()}.png`;
      const storagePath = `${demand.client_id}/${demand.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("card-attachments")
        .upload(storagePath, imageBytes, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error(`Upload error for slide ${slide.slideNumber}:`, uploadError);
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
    }

    // 8. Update demand attachments
    if (generatedAttachments.length > 0) {
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
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: generatedAttachments.length,
        total_slides: allSlides.length,
        message: `${generatedAttachments.length} imagem(ns) gerada(s) com sucesso`,
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
