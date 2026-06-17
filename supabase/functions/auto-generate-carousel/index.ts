import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAiKey, getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { MODELS, OPENAI_CHAT_URL } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { getCarouselPrompt } from "../_shared/system-prompts.ts";
import { fetchInlineImage } from "../_shared/fetch-image.ts";
import { generateCarouselSlideImages, type SlideRunResult } from "../_shared/carousel-image-runner.ts";

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

    // Step 0: previous AI slides are preserved alongside the new ones (no archiving)
    const archivedCount = 0;

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
3. Slide 1: gancho de atenção (máximo 1 frase curta, idealmente 3 a 7 palavras)
4. Slides do meio: 1 frase curta por slide — nada de parágrafos, listas ou explicações longas
5. Último slide: CTA direto e curto
6. Use a função "create_carousel_slides"

REGRA CRÍTICA DE MINIMALISMO TEXTUAL (OBRIGATÓRIO — DEMANDA PLANEJADA):
- Cada slide deve ter o MÍNIMO de texto possível. O carrossel é visual, não um artigo.
- PROIBIDO parágrafos, listas, bullet points, explicações extensas, dados numerados ou frases longas em qualquer slide.
- O texto de cada slide deve ser um gancho curto, direto e impactante — idealmente uma única frase.
- Se precisar de mais contexto, ele vai na LEGENDA do post (descrição da rede social), nunca dentro dos slides.`;

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

    // ============ STEP 2: slide images (parallel batches via shared runner) ============
    console.log(`Step 2: Generating ${slides.length} slide images via ${MODELS.IMAGE} (parallel batches)...`);

    const mascotInlineSingle = vi.mascot.galleryUrls[0]
      ? await fetchInlineImage(vi.mascot.galleryUrls[0])
      : null;
    const logoInline = vi.logo.url ? await fetchInlineImage(vi.logo.url) : null;
    if (mascotInlineSingle) console.log("  → Mascot reference image pre-fetched");
    if (logoInline) console.log("  → Logo reference image pre-fetched");
    const mascotInline = mascotInlineSingle ? [mascotInlineSingle] : [];

    const strategySnippet = strategyText ? `ESTRATÉGIA:\n${strategyText}` : undefined;

    // Persist each successful slide incrementally so partial failures still show progress.
    const persistSlide = async (r: SlideRunResult) => {
      if (!r.ok) return;
      const newAttachment = {
        url: r.attachment.url,
        name: `Carrossel Slide ${r.slideNumber} - ${vi.brandName}.${r.attachment.ext}`,
        type: r.attachment.mimeType,
        size: r.attachment.bytesLength,
        storagePath: r.attachment.storagePath,
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

      await supabase
        .from("demands")
        .update({ attachments: [...currentAttachments, newAttachment] })
        .eq("id", demandId);
      console.log(`  ↳ Slide ${r.slideNumber} attached to demand`);
    };

    const BATCH_SIZE = 2;
    let totalGenerated = 0;

    for (let batchStart = 0; batchStart < slides.length; batchStart += BATCH_SIZE) {
      const batch = slides.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`  → Batch ${batchStart + 1}-${batchStart + batch.length}/${slides.length}`);

      const { results } = await generateCarouselSlideImages({
        supabase,
        googleApiKey: GOOGLE_API_KEY,
        vi,
        basePrompt,
        strategySnippet,
        slides: batch,
        allSlides: slides,
        batchOffset: batchStart,
        mascotInline,
        logoInline,
        storagePathBuilder: (slideNumber, ext) =>
          `auto-generated/${demand.client_id}/${demandId}/carousel-slide-${slideNumber}-${crypto.randomUUID()}.${ext}`,
        onSlideDone: persistSlide,
      });

      totalGenerated += results.filter((r) => r.ok).length;
    }

    if (totalGenerated === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem de carrossel foi gerada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`✅ Auto-generated ${totalGenerated} carousel slides for demand ${demandId} (archived ${archivedCount} previous)`);

    // Gera a legenda automaticamente com base nos slides recém criados
    try {
      const { error: capErr } = await supabase.functions.invoke("generate-post-caption", {
        body: { demandId },
      });
      if (capErr) console.error("[auto-generate-carousel] caption invoke error:", capErr);
      else console.log(`✅ Caption auto-generated for carousel ${demandId}`);
    } catch (e) {
      console.error("[auto-generate-carousel] caption generation failed:", e);
    }

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
