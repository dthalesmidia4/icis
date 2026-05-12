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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { idea, presetId, mascotImageUrls, clientId, tenantId } = await req.json();
    if (!idea || !clientId || !tenantId) {
      return new Response(JSON.stringify({ error: "idea, clientId e tenantId são obrigatórios" }), {
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

    // Load visual identity (uses presetId if explicitly chosen by user, else most recent)
    const vi = await loadVisualIdentity(supabase, clientId, { presetId, mascotImageLimit: 2 });

    const basePrompt = await getSystemPrompt(supabase, tenantId, "generate_posts_prompt");

    const { data: strategy } = await supabase
      .from("strategies").select("strategy_text")
      .eq("company_id", clientId).eq("status", "Ativa")
      .order("created_at", { ascending: false }).limit(1).single();
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}` : "";

    // Mascot reference: prefer explicit URLs from caller, fallback to gallery from VI
    const effectiveMascotUrls = (mascotImageUrls && mascotImageUrls.length > 0)
      ? mascotImageUrls
      : vi.mascot.galleryUrls;
    const mascotInline = await fetchInlineImages(effectiveMascotUrls);
    const logoInline = vi.logo.url ? await fetchInlineImage(vi.logo.url) : null;

    const contentSection = [
      `IDEIA DO USUÁRIO (use como tema/contexto, NÃO reproduza este texto integralmente na imagem): "${idea}"`,
      "",
      `REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO:`,
      `- A ideia acima descreve o TEMA do post. NÃO copie o texto da ideia literalmente na imagem.`,
      `- Crie um TÍTULO CURTO e impactante baseado na ideia para usar como tipografia na imagem.`,
      `- Apenas títulos curtos e textos de gancho/CTA devem aparecer como tipografia na imagem.`,
    ].join("\n");

    const imagePrompt = buildStaticPostPrompt({
      vi,
      basePrompt,
      strategySnippet,
      contentSection,
      hasMascotReference: mascotInline.length > 0,
    });

    console.log(`Generating standalone post via ${MODELS.IMAGE}...`);

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
      console.error("Image API error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Erro na geração de imagem: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Nenhuma imagem foi retornada pelo modelo." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageBytes = decodeBase64(imageBase64);
    const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
    const fileName = `standalone-posts/${clientId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("card-attachments")
      .upload(fileName, imageBytes, { contentType: imageMimeType, upsert: false });

    if (uploadError) {
      return new Response(JSON.stringify({ error: "Falha ao salvar imagem gerada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: publicUrlData } = supabase.storage.from("card-attachments").getPublicUrl(fileName);
    return new Response(JSON.stringify({
      success: true,
      imageUrl: publicUrlData.publicUrl,
      message: "Post gerado com sucesso!",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-standalone-post error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
