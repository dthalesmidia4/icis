import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { getGoogleAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { getCarouselPrompt } from "../_shared/system-prompts.ts";
import { MODELS, GOOGLE_API_BASE } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { buildCarouselSlidePrompt } from "../_shared/image-prompts.ts";
import { fetchInlineImage, fetchInlineImages } from "../_shared/fetch-image.ts";

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

    // Same canonical+legacy resolution used by auto-generate-carousel
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

    console.log(`Generating ${slides.length} carousel images via ${MODELS.IMAGE}, ratio: ${aspectRatio || "1:1"}`);

    const generatedImages: Array<{ slideIndex: number; imageUrl: string }> = [];
    const googleApiUrl = `${GOOGLE_API_BASE}/models/${MODELS.IMAGE}:generateContent?key=${GOOGLE_API_KEY}`;
    const slideContextLine = contextSlides.map((s: any, idx: number) => `S${idx + 1}: "${s.text}"`).join(" | ");
    const totalSlides = contextSlides.length;
    const aspectLabel = aspectRatio ? `${aspectRatio} (1024x1024)` : "1:1 (1024x1024)";

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const slideNumber = slideOffset + i + 1;

      const imagePrompt = buildCarouselSlidePrompt({
        vi,
        basePrompt,
        strategySnippet,
        slideNumber,
        totalSlides,
        slideText: slide.text,
        slideLabel: slide.label,
        slideContextLine,
        hasMascotReference: mascotInline.length > 0,
        aspectLabel,
      });

      const parts: any[] = [{ text: imagePrompt }];
      for (const m of mascotInline) parts.push({ inlineData: m });
      if (logoInline) parts.push({ inlineData: logoInline });

      try {
        const response = await fetch(googleApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Slide ${slideNumber} error:`, response.status, errText);
          if (response.status === 429) {
            return new Response(JSON.stringify({
              error: `Rate limit excedido no slide ${slideNumber}.`, partialImages: generatedImages
            }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
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
        if (!imageBase64) continue;

        const imageBytes = decodeBase64(imageBase64);
        const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
        const fileName = `carousel-posts/${clientId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(fileName, imageBytes, { contentType: imageMimeType, upsert: false });
        if (uploadError) continue;

        const { data: publicUrlData } = supabase.storage.from("card-attachments").getPublicUrl(fileName);
        generatedImages.push({ slideIndex: i, imageUrl: publicUrlData.publicUrl });
        console.log(`  ✅ Slide ${slideNumber} generated`);
      } catch (e) {
        console.error(`Exception on slide ${slideNumber}:`, e);
      }
    }

    if (generatedImages.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma imagem foi gerada. Tente novamente." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true, images: generatedImages,
      totalGenerated: generatedImages.length, totalRequested: slides.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-carousel-images error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
