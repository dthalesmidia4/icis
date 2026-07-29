import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAiKey, getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { MODELS, OPENAI_CHAT_URL, DEFAULT_IMAGE_MODEL } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { getCarouselPrompt } from "../_shared/system-prompts.ts";
import { fetchInlineImage } from "../_shared/fetch-image.ts";
import { generateCarouselSlideImages, type SlideRunResult } from "../_shared/carousel-image-runner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SAFE_RETURN_MS = 150_000;
const MIN_NEW_BATCH_BUDGET_MS = 45_000;

async function hashText(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getSlideNumberFromAttachment(att: any): number | null {
  if (!att) return null;
  if (typeof att.carouselSlideNumber === "number") return att.carouselSlideNumber;
  const name = String(att.name || "");
  const match = name.match(/(?:carrossel\s*)?slide\s*(\d+)/i) || name.match(/carousel\s*slide\s*(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getExistingCarouselSlideNumbers(attachments: any[]): Set<number> {
  const numbers = new Set<number>();
  for (const att of attachments) {
    if (!isAiCarouselSlide(att)) continue;
    const slideNumber = getSlideNumberFromAttachment(att);
    if (slideNumber) numbers.add(slideNumber);
  }
  return numbers;
}

function getCarouselGenerationMeta(reorderMeta: any): any | null {
  if (!reorderMeta || typeof reorderMeta !== "object" || Array.isArray(reorderMeta)) return null;
  const meta = reorderMeta.carouselGeneration;
  if (!meta || typeof meta !== "object" || !Array.isArray(meta.slides)) return null;
  return meta;
}

async function persistCarouselGenerationMeta(
  supabase: any,
  demandId: string,
  currentReorderMeta: any,
  meta: Record<string, unknown>,
) {
  const nextMeta = currentReorderMeta && typeof currentReorderMeta === "object" && !Array.isArray(currentReorderMeta)
    ? { ...currentReorderMeta, carouselGeneration: meta }
    : { carouselGeneration: meta };
  const { error } = await supabase
    .from("demands")
    .update({ reorder_meta: nextMeta })
    .eq("id", demandId);
  if (error) console.error("[auto-generate-carousel] failed to persist carouselGeneration meta:", error);
}

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
    const startedAt = Date.now();
    const elapsedMs = () => Date.now() - startedAt;

    const { demandId, source, minimalText, forceRegenerate } = await req.json();
    const isPlanned = source === 'planned' || minimalText === true;

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

    // 2. Carousel guard — prefere demand_type_key; fallback por substring
    const demandType = (demand.demand_type || "").toLowerCase();
    const key = (demand.demand_type_key || "").toString().trim();
    const isCarousel =
      key === "carrossel" ||
      (!key && (demandType.includes("carrossel") || demandType.includes("carousel")));
    if (!isCarousel) {
      console.log(
        `[auto-generate-carousel] Skipped demandId=${demandId} demand_type="${demand.demand_type}" demand_type_key="${demand.demand_type_key}" reason="tipo não é Carrossel"`
      );
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Tipo "${demand.demand_type}" (key="${demand.demand_type_key}") não é Carrossel` }),
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
      demand.title ? `Título interno do card (apenas referência — NÃO reproduza literalmente nos textos dos slides): ${demand.title}` : "",
      demand.objective ? `Objetivo: ${demand.objective}` : "",
      demand.instructions ? `Instruções: ${demand.instructions.replace(/<[^>]*>/g, " ").trim()}` : "",
    ].filter(Boolean).join("\n");

    const slideCount = 5;
    const contentSignature = await hashText([
      demand.title || "",
      demand.objective || "",
      demand.instructions || "",
      demand.description || "",
      demand.demand_type || "",
      demand.demand_type_key || "",
      isPlanned ? "planned" : "standard",
    ].join("\n---\n"));

    const currentAttachments = Array.isArray(demand.attachments) ? demand.attachments : [];
    const existingSlideNumbers = forceRegenerate
      ? new Set<number>()
      : getExistingCarouselSlideNumbers(currentAttachments);

    // ============ STEP 1: slide texts via OpenAI ============
    console.log(`Step 1: Generating ${slideCount} slide texts via ${MODELS.TEXT_PLANNING}...`);

    const mascotInfo = vi.mascot.galleryUrls.length > 0
      ? `O cliente possui um mascote oficial. ${vi.mascot.description ? `Descrição: ${vi.mascot.description}.` : ""}`
      : "";
    const contentReqsSection = vi.contentRequirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${vi.contentRequirements}\n`
      : "";

    const minimalTextBlock = isPlanned
      ? `\n\n🚨 MODO "DEMANDA PLANEJADA" — TEXTO MÍNIMO:\n- Cada slide deve ter NO MÁXIMO 6 PALAVRAS no campo "text" (idealmente 2-4 palavras grandes e impactantes).\n- Sem frases longas, sem parágrafos, sem listas, sem explicações.\n- Comunicação visual: simples, direta, chamativa e fácil de entender em 1 segundo.\n- A profundidade do tema vai na LEGENDA do post, NÃO nos slides.\n`
      : "";

    const systemPrompt = `Você é um copywriter especialista em marketing digital. Crie textos para carrosséis.

${basePrompt ? "DIRETRIZES DO SISTEMA (PROMPT DO CARROSSEL):\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA:\n" + strategyText + "\n\n" : ""}CLIENTE: ${vi.brandName} | ${vi.sector || "N/A"} | ${vi.productsServices || "N/A"}
${mascotInfo}
${contentReqsSection}${minimalTextBlock}
REGRAS:
1. Retorne EXATAMENTE ${slideCount} slides
2. ${isPlanned ? "Texto ULTRA conciso (máx. 6 palavras por slide), impactante e visual" : "Texto conciso e impactante, sem limite rígido de caracteres"}
3. Slide 1: gancho de atenção
4. Último slide: CTA ${isPlanned ? "curto (1-3 palavras)" : ""}
5. Use a função "create_carousel_slides"`;

    const userPrompt = `Crie ${slideCount} slides para este card:\n\n${cardContent}`;

    let slides: Array<{ text: string; label: string }>;
    const existingPlan = !forceRegenerate ? getCarouselGenerationMeta(demand.reorder_meta) : null;
    if (existingPlan?.contentSignature === contentSignature && existingPlan.slides.length > 0) {
      slides = existingPlan.slides.slice(0, slideCount);
      console.log(`↪️ Reusing saved carousel slide plan (${slides.length} slides) for continuation`);
    } else {
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
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return new Response(
        JSON.stringify({ error: "A IA não retornou slides válidos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    slides = slides.slice(0, slideCount);

    await persistCarouselGenerationMeta(supabase, demandId, demand.reorder_meta, {
      contentSignature,
      slides,
      totalSlides: slides.length,
      promptKey,
      createdAt: new Date().toISOString(),
    });

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

    const minimalImageRule = isPlanned
      ? `\n\n🚨 MODO "DEMANDA PLANEJADA" — TEXTO MÍNIMO NA IMAGEM:\n- Renderize APENAS as palavras-chave do slide (máx. 6 palavras) em tipografia GRANDE e impactante.\n- NÃO adicione textos auxiliares, subtítulos, parágrafos, listas, descrições ou explicações na arte.\n- Priorize elemento visual dominante (mascote/objeto/ilustração) ocupando a maior parte da composição.\n- Composição simples, chamativa, leitura instantânea.`
      : "";
    const strategySnippet = (strategyText ? `ESTRATÉGIA:\n${strategyText}` : "") + minimalImageRule || undefined;

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
        uploadedBy: { id: "auto-generator", email: "system@ai", name: `IA - ${MODELS.IMAGE} (Carrossel)` },
        cardId: demandId,
        tenantId: demand.tenant_id,
        clientId: demand.client_id,
        carouselSlideNumber: r.slideNumber,
      };

      const { data: currentDemand } = await supabase
        .from("demands")
        .select("attachments")
        .eq("id", demandId)
        .single();

      const currentAttachments = Array.isArray(currentDemand?.attachments) ? currentDemand.attachments : [];
      const slideAlreadyAttached = currentAttachments.some((att: any) =>
        isAiCarouselSlide(att) && getSlideNumberFromAttachment(att) === r.slideNumber
      );
      if (slideAlreadyAttached) {
        console.log(`  ↳ Slide ${r.slideNumber} already attached, skipping duplicate append`);
        return;
      }

      await supabase
        .from("demands")
        .update({ attachments: [...currentAttachments, newAttachment] })
        .eq("id", demandId);
      console.log(`  ↳ Slide ${r.slideNumber} attached to demand`);
    };

    const BATCH_SIZE = 2;
    let totalGenerated = 0;
    const totalAlreadyGenerated = existingSlideNumbers.size;
    const missingRanges: Array<{ startIndex: number; slides: Array<{ text: string; label: string }> }> = [];
    slides.forEach((slide, idx) => {
      if (existingSlideNumbers.has(idx + 1)) return;
      const last = missingRanges[missingRanges.length - 1];
      if (last && last.startIndex + last.slides.length === idx && last.slides.length < BATCH_SIZE) {
        last.slides.push(slide);
      } else {
        missingRanges.push({ startIndex: idx, slides: [slide] });
      }
    });
    const missingCount = missingRanges.reduce((sum, range) => sum + range.slides.length, 0);

    const partialResponse = (reason: string) => new Response(
      JSON.stringify({
        success: true,
        partial: true,
        reason,
        totalGenerated,
        totalAlreadyGenerated,
        totalAvailable: totalAlreadyGenerated + totalGenerated,
        totalSlides: slides.length,
        archivedSlides: archivedCount,
        demandId,
        message: `Carrossel parcialmente gerado: ${totalAlreadyGenerated + totalGenerated}/${slides.length} slides. Clique novamente para continuar.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    if (missingCount === 0) {
      console.log(`✅ Carousel already has ${totalAlreadyGenerated}/${slides.length} AI slides attached`);
      return new Response(
        JSON.stringify({
          success: true,
          totalGenerated: 0,
          totalAlreadyGenerated,
          totalSlides: slides.length,
          archivedSlides: archivedCount,
          demandId,
          message: `Carrossel já possui ${slides.length} slides gerados.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processedMissing = 0;
    for (const range of missingRanges) {
      if ((totalGenerated > 0 || totalAlreadyGenerated > 0) && elapsedMs() > SAFE_RETURN_MS - MIN_NEW_BATCH_BUDGET_MS) {
        console.log(`⏳ Returning partial carousel before next batch to avoid timeout (${elapsedMs()}ms)`);
        return partialResponse("safe_timeout_before_next_batch");
      }

      const batch = range.slides;
      console.log(`  → Batch missing ${processedMissing + 1}-${processedMissing + batch.length}/${missingCount} (slides ${range.startIndex + 1}-${range.startIndex + batch.length}, elapsed ${elapsedMs()}ms)`);

      const { results } = await generateCarouselSlideImages({
        supabase,
        googleApiKey: GOOGLE_API_KEY,
        openaiApiKey: OPENAI_API_KEY,
        aiModel: DEFAULT_IMAGE_MODEL,
        vi,
        basePrompt,
        strategySnippet,
        slides: batch,
        allSlides: slides,
        batchOffset: range.startIndex,
        mascotInline,
        logoInline,
        storagePathBuilder: (slideNumber, ext) =>
          `auto-generated/${demand.client_id}/${demandId}/carousel-slide-${slideNumber}-${crypto.randomUUID()}.${ext}`,
        onSlideDone: persistSlide,
      });

      totalGenerated += results.filter((r) => r.ok).length;
      processedMissing += batch.length;

      if (totalAlreadyGenerated + totalGenerated < slides.length && elapsedMs() > SAFE_RETURN_MS) {
        console.log(`⏳ Returning partial carousel after batch to avoid timeout (${elapsedMs()}ms)`);
        return partialResponse("safe_timeout_after_batch");
      }
    }

    if (totalGenerated === 0 && totalAlreadyGenerated === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem de carrossel foi gerada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (totalAlreadyGenerated + totalGenerated < slides.length) {
      return partialResponse("some_slides_failed_or_pending");
    }

    console.log(`✅ Auto-generated ${totalGenerated} carousel slides for demand ${demandId} (archived ${archivedCount} previous)`);

    // Gera a legenda automaticamente com base nos slides recém criados
    if (elapsedMs() < SAFE_RETURN_MS - 20_000) {
      try {
        const { error: capErr } = await supabase.functions.invoke("generate-post-caption", {
          body: { demandId },
        });
        if (capErr) console.error("[auto-generate-carousel] caption invoke error:", capErr);
        else console.log(`✅ Caption auto-generated for carousel ${demandId}`);
      } catch (e) {
        console.error("[auto-generate-carousel] caption generation failed:", e);
      }
    } else {
      console.log(`⏭️ Skipping caption generation to avoid timeout (${elapsedMs()}ms)`);
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
