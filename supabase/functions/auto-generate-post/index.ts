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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { demandId } = await req.json();

    if (!demandId) {
      return new Response(
        JSON.stringify({ error: "demandId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Google AI Studio API key
    let GOOGLE_API_KEY: string;
    try {
      GOOGLE_API_KEY = await getGoogleAiKey(supabase);
    } catch (e) {
      const msg = e instanceof MissingApiKeyError ? e.message : "Erro ao carregar chave do Google AI Studio.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch the demand
    const { data: demand, error: demandError } = await supabase
      .from("demands")
      .select("*")
      .eq("id", demandId)
      .single();

    if (demandError || !demand) {
      console.error("Demand not found:", demandId, demandError);
      return new Response(
        JSON.stringify({ error: "Demanda não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if demand type is "Post Estático"
    const demandType = (demand.demand_type || "").toLowerCase();
    const isPostEstatico = demandType.includes("post") && demandType.includes("est");
    const isStaticPost = isPostEstatico || demandType === "post estático" || demandType === "post estatico" || demandType === "post";

    if (!isStaticPost) {
      console.log(`Skipping auto-generation: demand_type="${demand.demand_type}" is not a static post`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Tipo "${demand.demand_type}" não é Post Estático` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Auto-generating post image for demand ${demandId} (type: ${demand.demand_type})`);

    // 3. Load visual identity (colors + fonts + logo + mascot) — single source of truth
    const vi = await loadVisualIdentity(supabase, demand.client_id, { mascotImageLimit: 2 });
    const brandName = vi.brandName;
    const mascotImageUrls = vi.mascot.galleryUrls;

    // 4. Fetch posts prompt
    const basePrompt = await getSystemPrompt(supabase, demand.tenant_id, "generate_posts_prompt");

    // 6. Fetch active strategy
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", demand.client_id)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}`
      : "";

    // 7. Build content from the demand card
    const demandTitle = demand.title || "";
    const demandDescription = demand.description ? demand.description.replace(/<[^>]*>/g, " ").trim() : "";
    const demandInstructions = demand.instructions ? demand.instructions.replace(/<[^>]*>/g, " ").trim() : "";
    const demandObjective = demand.objective || "";
    const logoUrl = vi.logo.url;

    const contentSection = [
      `TÍTULO DO POST (pode aparecer como texto na imagem):\n"${demandTitle}"`,
      demandObjective ? `\nOBJETIVO DO POST (contexto temático para o design):\n${demandObjective}` : "",
      demandDescription ? `\nCONTEXTO TEMÁTICO (NÃO inclua este texto na imagem — é a legenda para a descrição da rede social):\n${demandDescription}` : "",
      demandInstructions ? `\nINSTRUÇÕES DE PRODUÇÃO VISUAL (siga estas diretrizes para o design):\n${demandInstructions}` : "",
      "",
      `REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO:`,
      `- O campo "CONTEXTO TEMÁTICO" contém a LEGENDA que será publicada na DESCRIÇÃO do post na rede social. Este texto NÃO deve aparecer na imagem.`,
      `- Apenas o TÍTULO e textos curtos de gancho/CTA devem aparecer como tipografia na imagem.`,
      `- A legenda serve apenas para você entender o tema e tom do post.`,
    ].filter(Boolean).join("\n");

    const imagePrompt = buildStaticPostPrompt({
      vi,
      basePrompt,
      strategySnippet,
      contentSection,
      hasMascotReference: mascotImageUrls.length > 0,
    });

    console.log(`Calling ${MODELS.IMAGE} via Google AI Studio direct API...`);

    // Build parts (text + optional reference images)
    const parts: any[] = [{ text: imagePrompt }];
    const mascotInline = await fetchInlineImages(mascotImageUrls);
    for (const inline of mascotInline) {
      parts.push({ inlineData: inline });
      console.log("  → Mascot reference image attached");
    }
    if (logoUrl) {
      const logoInline = await fetchInlineImage(logoUrl);
      if (logoInline) {
        parts.push({ inlineData: logoInline });
        console.log("  → Logo reference image attached");
      }
    }

    if (logoUrl) {
      const logoInline = await fetchImageInline(logoUrl);
      if (logoInline) {
        parts.push({ inlineData: logoInline });
        console.log("  → Logo reference image attached");
      }
    }

    // 10. Call Gemini 3 Pro Image via Google AI Studio REST API
    const googleApiUrl = `${GOOGLE_API_BASE}/models/${MODELS.IMAGE}:generateContent?key=${GOOGLE_API_KEY}`;

    const response = await fetch(googleApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google AI Studio error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido no Google AI Studio. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro Google AI Studio: ${response.status} - ${errorText.substring(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract base64 image from Gemini response
    let imageBase64 = "";
    let imageMimeType = "image/png";
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const candidateParts = candidate.content?.parts || [];
      for (const part of candidateParts) {
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
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem foi retornada pelo modelo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Upload to Supabase Storage
    console.log("Uploading generated image to storage...");

    const imageBytes = decodeBase64(imageBase64);
    const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
    const fileName = `auto-generated/${demand.client_id}/${demandId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("card-attachments")
      .upload(fileName, imageBytes, {
        contentType: imageMimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Falha ao salvar imagem gerada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("card-attachments")
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;

    // 12. Attach image to the demand
    const existingAttachments = Array.isArray(demand.attachments) ? demand.attachments : [];
    const newAttachment = {
      url: imageUrl,
      name: `Post Gerado - ${brandName}.${ext}`,
      type: imageMimeType,
      size: imageBytes.length,
      storagePath: fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: "auto-generator", email: "system@ai", name: "IA - Gemini 3 Pro Image (Auto)" },
      cardId: demandId,
      tenantId: demand.tenant_id,
      clientId: demand.client_id,
    };

    const updatedAttachments = [...existingAttachments, newAttachment];

    const { error: updateError } = await supabase
      .from("demands")
      .update({ attachments: updatedAttachments })
      .eq("id", demandId);

    if (updateError) {
      console.error("Error updating demand attachments:", updateError);
      return new Response(
        JSON.stringify({ error: "Imagem gerada mas erro ao anexar à demanda" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Auto-generated post image attached to demand ${demandId}`);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        demandId,
        message: "Post gerado e anexado automaticamente!",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-generate-post error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
