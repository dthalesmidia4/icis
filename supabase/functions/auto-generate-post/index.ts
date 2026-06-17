import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAiKey, getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { getSystemPrompt } from "../_shared/system-prompts.ts";
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, type ImageAiModel } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { buildStaticPostPrompt } from "../_shared/image-prompts.ts";
import { fetchInlineImage, fetchInlineImages } from "../_shared/fetch-image.ts";
import { generateImageWithModel } from "../_shared/image-generation.ts";
import { aspectFromDemandType, aspectPromptLabel } from "../_shared/aspect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { demandId, aiModel: aiModelInput } = await req.json();

    if (!demandId) {
      return new Response(JSON.stringify({ error: "demandId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiModel: ImageAiModel = (aiModelInput && IMAGE_MODELS[aiModelInput as ImageAiModel])
      ? (aiModelInput as ImageAiModel)
      : DEFAULT_IMAGE_MODEL;
    const provider = IMAGE_MODELS[aiModel].provider;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let GOOGLE_API_KEY: string | undefined;
    let OPENAI_API_KEY: string | undefined;
    try {
      if (provider === "google") GOOGLE_API_KEY = await getGoogleAiKey(supabase);
      else OPENAI_API_KEY = await getOpenAiKey(supabase);
    } catch (e) {
      const msg = e instanceof MissingApiKeyError ? e.message : "Erro ao carregar chave de API.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: demand, error: demandError } = await supabase
      .from("demands").select("*").eq("id", demandId).single();

    if (demandError || !demand) {
      console.error("Demand not found:", demandId, demandError);
      return new Response(JSON.stringify({ error: "Demanda não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    console.log(`Auto-generating post image for demand ${demandId} (type: ${demand.demand_type}) via ${IMAGE_MODELS[aiModel].id}`);

    const vi = await loadVisualIdentity(supabase, demand.client_id, { mascotImageLimit: 2 });
    const brandName = vi.brandName;
    const mascotImageUrls = vi.mascot.galleryUrls;

    const basePrompt = await getSystemPrompt(supabase, demand.tenant_id, "generate_posts_prompt");

    const { data: strategy } = await supabase
      .from("strategies").select("strategy_text")
      .eq("company_id", demand.client_id).eq("status", "Ativa")
      .order("created_at", { ascending: false }).limit(1).single();
    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}` : "";

    const demandTitle = demand.title || "";
    const demandDescription = demand.description ? demand.description.replace(/<[^>]*>/g, " ").trim() : "";
    const demandInstructions = demand.instructions ? demand.instructions.replace(/<[^>]*>/g, " ").trim() : "";
    const demandObjective = demand.objective || "";

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

    const ratio = aspectFromDemandType(demand.demand_type);
    const aspectLabel = aspectPromptLabel(ratio);

    const imagePrompt = buildStaticPostPrompt({
      vi,
      basePrompt,
      strategySnippet,
      contentSection,
      hasMascotReference: mascotImageUrls.length > 0,
      aspectLabel,
    });

    const mascotInline = await fetchInlineImages(mascotImageUrls);
    const logoInline = vi.logo.url ? await fetchInlineImage(vi.logo.url) : null;

    const result = await generateImageWithModel({
      aiModel,
      prompt: imagePrompt,
      mascotInline,
      logoInline,
      aspectLabel: ratio,
      googleApiKey: GOOGLE_API_KEY,
      openaiApiKey: OPENAI_API_KEY,
    });

    if (!result.ok) {
      console.error("Image API error:", result.status, result.error);
      if (result.rateLimited) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Erro na geração de imagem: ${result.error}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBytes, mimeType: imageMimeType, ext } = result;
    const fileName = `auto-generated/${demand.client_id}/${demandId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("card-attachments")
      .upload(fileName, imageBytes, { contentType: imageMimeType, upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Falha ao salvar imagem gerada." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: publicUrlData } = supabase.storage.from("card-attachments").getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;

    const existingAttachments = Array.isArray(demand.attachments) ? demand.attachments : [];
    const newAttachment = {
      url: imageUrl,
      name: `Post Gerado - ${brandName}.${ext}`,
      type: imageMimeType,
      size: imageBytes.length,
      storagePath: fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: "auto-generator", email: "system@ai", name: `IA - ${IMAGE_MODELS[aiModel].id} (Auto)` },
      cardId: demandId,
      tenantId: demand.tenant_id,
      clientId: demand.client_id,
    };
    const updatedAttachments = [...existingAttachments, newAttachment];

    const { error: updateError } = await supabase.from("demands")
      .update({ attachments: updatedAttachments }).eq("id", demandId);

    if (updateError) {
      console.error("Error updating demand attachments:", updateError);
      return new Response(JSON.stringify({ error: "Imagem gerada mas erro ao anexar à demanda" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Auto-generated post image attached to demand ${demandId} (ratio=${ratio})`);

    // Gera a legenda automaticamente a partir da imagem recém anexada
    try {
      const { error: capErr } = await supabase.functions.invoke("generate-post-caption", {
        body: { demandId },
      });
      if (capErr) console.error("[auto-generate-post] caption invoke error:", capErr);
      else console.log(`✅ Caption auto-generated for demand ${demandId}`);
    } catch (e) {
      console.error("[auto-generate-post] caption generation failed:", e);
    }

    return new Response(JSON.stringify({
      success: true, imageUrl, demandId,
      message: "Post gerado e anexado automaticamente!",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("auto-generate-post error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
