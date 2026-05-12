import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { getGoogleAiKey, getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { GOOGLE_API_BASE, MODELS, OPENAI_CHAT_URL } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { getCarouselPrompt, getSystemPrompt } from "../_shared/system-prompts.ts";
import { buildCarouselSlidePrompt } from "../_shared/image-prompts.ts";
import { fetchInlineImage } from "../_shared/fetch-image.ts";

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

async function archiveExistingCarouselSlides(
  supabase: any,
  demandId: string,
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let GOOGLE_API_KEY: string;
    let OPENAI_API_KEY: string;
    try {
      GOOGLE_API_KEY = await getGoogleAiKey(supabase);
      OPENAI_API_KEY = await getOpenAiKey(supabase);
    } catch (e) {
      const msg = e instanceof MissingApiKeyError ? e.message : "Falha ao buscar chaves de API.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch the demand
    const { data: demand, error: demandError } = await supabase
      .from("demands")
      .select("*")
      .eq("id", demandId)
      .single();

    if (demandError || !demand) {
      return new Response(
        JSON.stringify({ error: "Demanda não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Carousel guard
    const demandType = (demand.demand_type || "").toLowerCase();
    const isCarousel = demandType.includes("carrossel") || demandType.includes("carousel");
    if (!isCarousel) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Tipo "${demand.demand_type}" não é Carrossel` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Auto-generating carousel for demand ${demandId} (type: ${demand.demand_type})`);

    // Step 0: archive previous AI slides
    const { archivedCount } = await archiveExistingCarouselSlides(supabase, demandId);
    if (archivedCount > 0) {
      console.log(`✅ Step 0: Archived ${archivedCount} previous AI slides to history`);
    }

    // 3. Visual identity (single source of truth — covers auxiliary color + secondary font)
    const vi = await loadVisualIdentity(supabase, demand.client_id, { mascotImageLimit: 1 });

    // 4. Carousel prompt (canonical → legacy custom → empty)
    const { content: basePrompt, key: promptKey } = await getCarouselPrompt(supabase, demand.tenant_id);
    console.log(`📋 Carrossel usando prompt: ${promptKey || "FALLBACK_HARDCODED"}`);

    // 5. Strategy snippet (short)
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    const strategyText = strategy?.strategy_text ? strategy.strategy_text.substring(0, 800) : "";

    // 6. Card content
    const cardContent = [
      demand.title ? `Título: ${demand.title}` : "",
      demand.objective ? `Objetivo: ${demand.objective}` : "",
      demand.instructions ? `Instruções: ${demand.instructions.replace(/<[^>]*>/g, " ").trim()}` : "",
    ].filter(Boolean).join("\n");

    const slideCount = 5;

    // ============ STEP 1: slide texts via OpenAI ============
    console.log(`Step 1: Generating ${slideCount} slide texts via ${MODELS.TEXT_PLANNING}...`);

    const mascotInfo = vi.mascot.galleryUrls.length > 0
      ? `O cliente possui um mascote oficial. ${vi.mascot.description ? `Descrição: ${vi.mascot.description}.` : ""}`
      : "";
    const contentReqsSection = vi.contentRequirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${vi.contentRequirements}\n`
      : "";

    const systemPrompt = `Você é um copywriter especialista em marketing digital. Crie textos para carrosséis.

${basePrompt ? "DIRETRIZES DO SISTEMA (PROMPT DO CARROSSEL):\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA:\n" + strategyText + "\n\n" : ""}CLIENTE: ${vi.brandName} | ${vi.sector || "N/A"} | ${vi.productsServices || "N/A"}
${mascotInfo}
${contentReqsSection}
REGRAS:
1. Retorne EXATAMENTE ${slideCount} slides
2. Texto conciso e impactante, sem limite rígido de caracteres
3. Slide 1: gancho de atenção
4. Último slide: CTA
5. Use a função "create_carousel_slides"`;

    const userPrompt = `Crie ${slideCount} slides para este card:\n\n${cardContent}`;

    const contentResponse = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELS.TEXT_PLANNING,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
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
                    properties: { text: { type: "string" }, label: { type: "string" } },
                    required: ["text", "label"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["slides"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_carousel_slides" } },
      }),
    });

    if (!contentResponse.ok) {
      const errorText = await contentResponse.text();
      console.error("OpenAI error:", contentResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Erro OpenAI: ${contentResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contentData = await contentResponse.json();
    const toolCall = contentData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou os slides estruturados." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou slides válidos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`✅ Step 1 complete: ${slides.length} slide texts generated`);

    // ============ STEP 2: slide images ============
    console.log(`Step 2: Generating ${slides.length} slide images via ${MODELS.IMAGE}...`);

    const mascotInline = vi.mascot.galleryUrls[0]
      ? await fetchInlineImage(vi.mascot.galleryUrls[0])
      : null;
    const logoInline = vi.logo.url ? await fetchInlineImage(vi.logo.url) : null;
    if (mascotInline) console.log("  → Mascot reference image pre-fetched");
    if (logoInline) console.log("  → Logo reference image pre-fetched");

    const slideContextLine = slides.map((s, idx) => `S${idx + 1}: "${s.text}"`).join(" | ");
    let totalGenerated = 0;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNumber = i + 1;

      const imagePrompt = buildCarouselSlidePrompt({
        vi,
        basePrompt,
        strategySnippet: strategyText ? `ESTRATÉGIA:\n${strategyText}` : undefined,
        slideNumber,
        totalSlides: slides.length,
        slideText: slide.text,
        slideLabel: slide.label,
        slideContextLine,
        hasMascotReference: !!mascotInline,
      });

      const parts: any[] = [{ text: imagePrompt }];
      if (mascotInline) parts.push({ inlineData: mascotInline });
      if (logoInline) parts.push({ inlineData: logoInline });

      console.log(`  → Generating slide ${slideNumber}/${slides.length}...`);

      try {
        const googleApiUrl = `${GOOGLE_API_BASE}/models/${MODELS.IMAGE}:generateContent?key=${GOOGLE_API_KEY}`;
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

        let imageBase64 = "";
        let imageMimeType = "image/png";
        for (const candidate of imgData.candidates || []) {
          for (const part of candidate.content?.parts || []) {
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

        const imageBytes = decodeBase64(imageBase64);
        imageBase64 = "";

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
          name: `Carrossel Slide ${slideNumber} - ${vi.brandName}.${ext}`,
          type: imageMimeType,
          size: imageBytes.length,
          storagePath: fileName,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "auto-generator", email: "system@ai", name: "IA - Gemini 3 Pro Image (Carrossel)" },
          cardId: demandId,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        };

        const { data: currentDemand } = await supabase
          .from("demands")
          .select("attachments")
          .eq("id", demandId)
          .single();

        const currentAttachments = Array.isArray(currentDemand?.attachments) ? currentDemand.attachments : [];
        const slideNamePattern = new RegExp(`Carrossel Slide ${slideNumber}\\b`, "i");
        const filteredAttachments = currentAttachments.filter((a: any) => {
          if (!isAiCarouselSlide(a)) return true;
          return !slideNamePattern.test(a.name || "");
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

    if (totalGenerated === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem de carrossel foi gerada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("auto-generate-carousel error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
