import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { getGoogleAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { getSystemPrompt } from "../_shared/system-prompts.ts";
import { MODELS, GOOGLE_API_BASE } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { buildStaticPostPrompt } from "../_shared/image-prompts.ts";
import { fetchInlineImage, fetchInlineImages } from "../_shared/fetch-image.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseSlides(description: string): { slideNumber: number; title: string; body: string }[] {
  if (!description) return [];
  const text = description.replace(/<[^>]*>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const normalizedText = text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
  const slideRegex = /(?:SLIDE|FRAME|CENA|IMAGEM)\s*(\d+)\b\s*(?:[—\-:]\s*)?([\s\S]*?)(?=(?:SLIDE|FRAME|CENA|IMAGEM)\s*\d+\b|$)/gi;
  const slides: { slideNumber: number; title: string; body: string }[] = [];
  let match;
  while ((match = slideRegex.exec(normalizedText)) !== null) {
    const slideNumber = parseInt(match[1]);
    const content = match[2].trim();
    const lines = content.split(/\n+/).filter((l: string) => l.trim());
    const title = lines[0] || "";
    const body = lines.slice(1).join("\n").trim();
    slides.push({ slideNumber, title, body });
  }
  if (slides.length === 0 && normalizedText.trim()) {
    slides.push({ slideNumber: 1, title: normalizedText.trim().substring(0, 100), body: normalizedText.trim() });
  }
  return slides;
}

function getAspectLabel(demandType: string | null): string {
  const type = (demandType || "").toLowerCase();
  if (type.includes("reel") || type.includes("stories") || type.includes("story") || type.includes("video curto")) {
    return "9:16 (portrait, 1024x1536)";
  }
  if (type.includes("cover") || type.includes("banner") || type.includes("capa")) {
    return "16:9 (landscape, 1536x1024)";
  }
  return "1:1 (quadrado, 1024x1024)";
}

function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { demandId, slideNumber, replaceSlide } = await req.json();

    if (!demandId) {
      return new Response(JSON.stringify({ error: "demandId é obrigatório" }), {
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

    const { data: demand, error: demandError } = await supabase.from("demands").select("*").eq("id", demandId).single();
    if (demandError || !demand) {
      return new Response(JSON.stringify({ error: "Demanda não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Visual identity (single source of truth)
    const vi = await loadVisualIdentity(supabase, demand.client_id, { mascotImageLimit: 2 });
    const brandName = vi.brandName;
    const mascotInline = await fetchInlineImages(vi.mascot.galleryUrls);
    const logoInline = vi.logo.url ? await fetchInlineImage(vi.logo.url) : null;

    const basePrompt = await getSystemPrompt(supabase, demand.tenant_id, "generate_posts_prompt");

    const { data: strategy } = await supabase
      .from("strategies").select("strategy_text")
      .eq("company_id", demand.client_id).eq("status", "Ativa")
      .order("created_at", { ascending: false }).limit(1).single();
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}` : "";

    // Parse slides — try description first, then instructions
    let allSlides = parseSlides(demand.description || "");
    if (allSlides.length <= 1) {
      const fromInstructions = parseSlides(demand.instructions || "");
      if (fromInstructions.length > allSlides.length) allSlides = fromInstructions;
    }
    if (allSlides.length === 0) {
      const fallbackText = demand.title || "Post";
      const fallbackBody = stripHtml(demand.description) || stripHtml(demand.instructions) || demand.objective || "";
      allSlides = [{ slideNumber: 1, title: fallbackText, body: fallbackBody }];
    }

    const slidesToGenerate = slideNumber
      ? (() => {
          const exact = allSlides.filter((s) => s.slideNumber === slideNumber);
          if (exact.length > 0) return exact;
          const idx = slideNumber - 1;
          if (idx >= 0 && idx < allSlides.length) return [allSlides[idx]];
          if (replaceSlide) {
            const fallbackTitle = demand.title?.trim() || `Slide ${slideNumber}`;
            const fallbackBody = [stripHtml(demand.description), stripHtml(demand.objective),
              stripHtml(demand.instructions), stripHtml(demand.observations)].find(Boolean) || "";
            return [{ slideNumber, title: fallbackTitle, body: fallbackBody }];
          }
          return [];
        })()
      : allSlides;

    if (slidesToGenerate.length === 0) {
      return new Response(JSON.stringify({ error: "Slide específico não encontrado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aspectLabel = getAspectLabel(demand.demand_type);
    const totalSlidesForPrompt = slideNumber ? Math.max(allSlides.length, slideNumber) : allSlides.length;
    const generatedAttachments: any[] = [];
    const existingAttachments = demand.attachments || [];
    const errors: string[] = [];

    for (const slide of slidesToGenerate) {
      const isSingleSlideRegen = !!slideNumber;
      const contentSection = isSingleSlideRegen
        ? [
            `CONTEÚDO DESTE SLIDE (use EXCLUSIVAMENTE este conteúdo para gerar a imagem, NÃO use conteúdo de outros slides):`,
            `Texto principal: "${slide.title}"`,
            slide.body ? `Texto complementar/detalhes: "${slide.body}"` : "",
          ].filter(Boolean).join("\n")
        : [
            `CONTEÚDO DO SLIDE ${slide.slideNumber}/${totalSlidesForPrompt}:`,
            `Texto principal: "${slide.title}"`,
            slide.body ? `Texto complementar: "${slide.body}"` : "",
            "",
            demand.title ? `TÍTULO DO POST (pode aparecer como texto na imagem):\n"${demand.title}"` : "",
            demand.objective ? `OBJETIVO DO POST (contexto temático para o design):\n${demand.objective}` : "",
            demand.description ? `CONTEXTO TEMÁTICO (NÃO inclua este texto na imagem — é a legenda para a descrição da rede social):\n${stripHtml(demand.description)}` : "",
            demand.instructions ? `INSTRUÇÕES DE PRODUÇÃO VISUAL (siga estas diretrizes para o design):\n${stripHtml(demand.instructions)}` : "",
            "",
            `REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO:`,
            `- O campo "CONTEXTO TEMÁTICO" contém a LEGENDA que será publicada na DESCRIÇÃO do post. Este texto NÃO deve aparecer na imagem.`,
            `- Apenas o TÍTULO e textos curtos de gancho/CTA devem aparecer como tipografia na imagem.`,
          ].filter(Boolean).join("\n");

      const imagePrompt = buildStaticPostPrompt({
        vi,
        basePrompt,
        strategySnippet,
        contentSection,
        hasMascotReference: mascotInline.length > 0,
        aspectLabel,
      });

      console.log(`Generating image for slide ${slide.slideNumber} via ${MODELS.IMAGE}...`);

      try {
        const parts: any[] = [{ text: imagePrompt }];
        for (const m of mascotInline) parts.push({ inlineData: m });
        if (logoInline) parts.push({ inlineData: logoInline });

        const googleApiUrl = `${GOOGLE_API_BASE}/models/${MODELS.IMAGE}:generateContent?key=${GOOGLE_API_KEY}`;
        const response = await fetch(googleApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Slide ${slide.slideNumber} error:`, response.status, errorText);
          errors.push(`Slide ${slide.slideNumber}: Erro ${response.status}`);
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

        if (!imageBase64) {
          errors.push(`Slide ${slide.slideNumber}: Nenhuma imagem retornada pelo modelo`);
          continue;
        }

        const imageBytes = decodeBase64(imageBase64);
        imageBase64 = "";
        const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
        const fileName = `ai-generated-slide-${slide.slideNumber}-${Date.now()}.${ext}`;
        const storagePath = `${demand.client_id}/${demand.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("card-attachments")
          .upload(storagePath, imageBytes, { contentType: imageMimeType, upsert: true });

        if (uploadError) {
          errors.push(`Slide ${slide.slideNumber}: Erro ao fazer upload`);
          continue;
        }

        const { data: urlData } = supabase.storage.from("card-attachments").getPublicUrl(storagePath);

        generatedAttachments.push({
          url: urlData.publicUrl,
          name: `Slide ${slide.slideNumber} - ${brandName}.${ext}`,
          type: imageMimeType,
          size: imageBytes.length,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: { id: "ai-generator", email: "system@ai", name: `IA - ${MODELS.IMAGE}` },
          cardId: demand.id,
          tenantId: demand.tenant_id,
          clientId: demand.client_id,
        });

        console.log(`✅ Slide ${slide.slideNumber} generated successfully`);
      } catch (slideError) {
        errors.push(`Slide ${slide.slideNumber}: ${slideError instanceof Error ? slideError.message : "Erro desconhecido"}`);
      }
    }

    if (generatedAttachments.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma imagem foi gerada.", details: errors }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update demand attachments (preserve existing replace-slide logic)
    let updatedAttachments;
    if (replaceSlide && slideNumber && generatedAttachments.length === 1) {
      const slidePattern = new RegExp(`Slide\\s*${slideNumber}\\b`, 'i');
      const rejectedAttachment = existingAttachments.find((a: any) =>
        slidePattern.test(a.name || '') && (a.uploadedBy?.id === 'ai-generator' || a.uploadedBy?.id === 'auto-generator')
      );

      if (rejectedAttachment) {
        const { data: currentDemand } = await supabase.from("demands")
          .select("rejected_attachments").eq("id", demandId).single();
        const existingRejected = (currentDemand?.rejected_attachments as any[]) || [];
        await supabase.from("demands").update({
          rejected_attachments: [...existingRejected, {
            rejected_at: new Date().toISOString(),
            attachments: [rejectedAttachment],
          }]
        }).eq("id", demandId);
      }

      updatedAttachments = existingAttachments.map((a: any) => {
        if (slidePattern.test(a.name || '') && (a.uploadedBy?.id === 'ai-generator' || a.uploadedBy?.id === 'auto-generator')) {
          return generatedAttachments[0];
        }
        return a;
      });
      if (JSON.stringify(updatedAttachments) === JSON.stringify(existingAttachments)) {
        updatedAttachments = [...existingAttachments, ...generatedAttachments];
      }
    } else {
      updatedAttachments = [...existingAttachments, ...generatedAttachments];
    }

    const { error: updateError } = await supabase.from("demands").update({ attachments: updatedAttachments }).eq("id", demandId);
    if (updateError) {
      return new Response(JSON.stringify({ error: "Imagens geradas mas erro ao salvar nos anexos" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      generated: generatedAttachments.length,
      total_slides: allSlides.length,
      message: `${generatedAttachments.length} imagem(ns) gerada(s) com sucesso`,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-post-image error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
