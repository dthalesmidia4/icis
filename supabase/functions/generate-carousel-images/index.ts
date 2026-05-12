import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAiKey, getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { getCarouselPrompt } from "../_shared/system-prompts.ts";
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, type ImageAiModel } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { fetchInlineImage, fetchInlineImages } from "../_shared/fetch-image.ts";
import { generateCarouselSlideImages } from "../_shared/carousel-image-runner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { slides, allSlides, batchOffset, aspectRatio, presetId, mascotImageUrls, clientId, tenantId } = await req.json();
    const contextSlides = allSlides || slides;
    const slideOffset = batchOffset || 0;

    if (!slides || !Array.isArray(slides) || slides.length === 0 || !clientId || !tenantId) {
      return new Response(JSON.stringify({ error: "slides, clientId e tenantId são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let GOOGLE_API_KEY: string;
    try { GOOGLE_API_KEY = await getGoogleAiKey(supabase); }
    catch (e) {
      const msg = e instanceof MissingApiKeyError ? e.message : "Erro ao carregar chave do Google AI Studio.";
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const vi = await loadVisualIdentity(supabase, clientId, { presetId, mascotImageLimit: 2 });
    const { content: basePrompt } = await getCarouselPrompt(supabase, tenantId);

    const { data: strategy } = await supabase
      .from("strategies").select("strategy_text")
      .eq("company_id", clientId).eq("status", "Ativa")
      .order("created_at", { ascending: false }).limit(1).single();
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}` : "";

    const effectiveMascotUrls = (mascotImageUrls && mascotImageUrls.length > 0)
      ? mascotImageUrls : vi.mascot.galleryUrls;
    const mascotInline = await fetchInlineImages(effectiveMascotUrls);
    const logoInline = vi.logo.url ? await fetchInlineImage(vi.logo.url) : null;

    const aspectLabel = aspectRatio ? `${aspectRatio} (1024x1024)` : "1:1 (1024x1024)";
    console.log(`Generating ${slides.length} carousel images via ${MODELS.IMAGE} (parallel batch), ratio: ${aspectRatio || "1:1"}`);

    const { images, anyRateLimited } = await generateCarouselSlideImages({
      supabase,
      googleApiKey: GOOGLE_API_KEY,
      vi,
      basePrompt,
      strategySnippet,
      slides,
      allSlides: contextSlides,
      batchOffset: slideOffset,
      aspectLabel,
      mascotInline,
      logoInline,
      storagePathBuilder: (_n, ext) => `carousel-posts/${clientId}/${crypto.randomUUID()}.${ext}`,
    });

    if (images.length === 0) {
      const status = anyRateLimited ? 429 : 500;
      const error = anyRateLimited
        ? "Rate limit excedido. Tente novamente em instantes."
        : "Nenhuma imagem foi gerada. Tente novamente.";
      return new Response(JSON.stringify({ error, partialImages: [] }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true, images,
      totalGenerated: images.length, totalRequested: slides.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-carousel-images error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
