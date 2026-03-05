import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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

    // 6. Generate images for each slide using Nano Banana 3 Pro
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
${demand.objective ? `\nOBJETIVO DA DEMANDA:\n${demand.objective}` : ""}
${demand.instructions ? `\nINSTRUÇÕES ESPECÍFICAS (SIGA COM PRIORIDADE MÁXIMA):\n${demand.instructions}` : ""}
${demand.observations ? `\nOBSERVAÇÕES ADICIONAIS (SIGA COM PRIORIDADE MÁXIMA):\n${demand.observations}` : ""}

DESCRIÇÃO COMPLETA DA ATIVIDADE (SIGA RIGOROSAMENTE CADA DETALHE DESCRITO ABAIXO - cenário, ambiente, estilo, cores, elementos visuais, posição dos personagens, etc.):
${demand.description ? demand.description.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim() : "Criar post profissional para rede social"}

BRANDING:
- Marca: "${brandName}"
- Cor primária: ${primaryColor}
- Cor secundária: ${secondaryColor}
- Tipografia: ${brandFont}
- Incluir nome da marca sutilmente no canto inferior
${mascotInstruction}

ESTILO:
- Design profissional para redes sociais
- Formato/Proporção: ${aspectRatio}
- IMPORTANTE: Gere um POST COMPLETO para rede social, não apenas um elemento isolado
- IMPORTANTE: Siga EXATAMENTE o cenário, ambiente e background descritos na atividade acima. NÃO substitua por fundos genéricos ou abstratos.
`.trim();

      console.log(`Generating image for slide ${slide.slideNumber} using Nano Banana 3 Pro...${useMascotReference ? " (with mascot reference)" : ""}`);

      try {
        // Build message content
        const contentParts: any[] = [{ type: "text", text: imagePrompt }];

        if (useMascotReference) {
          contentParts.push({ type: "image_url", image_url: { url: mascotUrl } });
          console.log(`  → Mascot reference image attached`);
        }

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Nano Banana 3 Pro error for slide ${slide.slideNumber}:`, response.status, errorText);

          if (response.status === 429) {
            errors.push(`Slide ${slide.slideNumber}: Rate limit excedido. Tente novamente em alguns minutos.`);
            continue;
          }
          if (response.status === 402) {
            errors.push(`Slide ${slide.slideNumber}: Créditos insuficientes.`);
            continue;
          }

          errors.push(`Slide ${slide.slideNumber}: Erro ${response.status}`);
          continue;
        }

        const data = await response.json();
        const base64Url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!base64Url) {
          console.error(`No image in response for slide ${slide.slideNumber}:`, JSON.stringify(data).substring(0, 500));
          errors.push(`Slide ${slide.slideNumber}: Nenhuma imagem retornada pelo modelo`);
          continue;
        }

        // Upload to storage
        const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
        const imageBytes = decodeBase64(base64Data);

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
          uploadedBy: { id: "ai-generator", email: "system@ai", name: "IA - Nano Banana 3 Pro" },
          cardId: demand.id,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        };

        generatedAttachments.push(attachment);
        console.log(`✅ Slide ${slide.slideNumber} generated and uploaded successfully with Nano Banana 3 Pro`);
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
