import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAiKey, getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { getSystemPrompt } from "../_shared/system-prompts.ts";
import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, type ImageAiModel } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { buildStaticPostPrompt } from "../_shared/image-prompts.ts";
import { fetchInlineImage, fetchInlineImages } from "../_shared/fetch-image.ts";
import { generateImageWithModel } from "../_shared/image-generation.ts";
import { aspectFromDemandType, aspectPromptLabel, normalizeAspectRatio } from "../_shared/aspect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { demandId, aiModel: aiModelInput, source, minimalText, aspectRatio } = await req.json();
    const isPlanned = source === 'planned' || minimalText === true;

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
    const key = (demand.demand_type_key || "").toString().trim();
    const isPostEstatico = demandType.includes("post") && demandType.includes("est");
    const isStaticPost =
      key === "criativo_estatico" ||
      (!key && (
        isPostEstatico ||
        demandType === "post estático" ||
        demandType === "post estatico" ||
        demandType === "post"
      ));

    if (!isStaticPost) {
      console.log(
        `[auto-generate-post] Skipped demandId=${demandId} demand_type="${demand.demand_type}" demand_type_key="${demand.demand_type_key}" reason="tipo não é Post Estático"`
      );
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Tipo "${demand.demand_type}" (key="${demand.demand_type_key}") não é Post Estático` }),
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

    // `content_brief` é a FONTE CANÔNICA: textos de arte definidos no briefing devem ser usados como estão.
    // Estático = UMA peça = UMA imagem: todo `art_text` pertence à MESMA arte.
    const brief = (demand.content_brief && typeof demand.content_brief === "object")
      ? demand.content_brief as Record<string, any>
      : null;
    /** Contexto (pode ser normalizado em linha única). */
    const bText = (v: unknown) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    /** Texto RENDERIZÁVEL canônico — preserva quebras de linha e parágrafos. */
    const bCopy = (v: unknown) =>
      String(v ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    const bList = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.map((i: any) => (typeof i === "string" ? bCopy(i) : bCopy(i?.text ?? i?.texto ?? ""))).filter(Boolean)
        : [];
    // Fragmentos legados de `art_text` são UNIDOS numa única unidade renderizável.
    const artUnit = brief ? bList(brief.art_text).join("\n\n").trim() : "";
    const slidesUnit = brief ? bList(brief.slides).join("\n\n").trim() : "";
    const canonicalArt = artUnit || slidesUnit;
    const isStructured = !!brief && (!!brief.delivery_kind || !!artUnit || !!slidesUnit);
    const briefScreenTexts = brief ? [bCopy(brief.cover_text), ...bList(brief.screen_texts)].filter(Boolean) : [];
    const briefVisualDirection = brief ? bList(brief.visual_direction) : [];
    const briefSection = brief
      ? [
          `BRIEFING CANÔNICO (fonte de verdade — prevalece sobre legenda e instruções):`,
          brief.message_central ? `- Mensagem central: ${bText(brief.message_central)}` : "",
          brief.concept_format ? `- Conceito/formato: ${bText(brief.concept_format)}` : "",
          canonicalArt
            ? `- TEXTO DA ARTE — PEÇA ÚNICA (renderize EXATAMENTE este texto nesta MESMA arte, preservando quebras de linha):\n${canonicalArt}`
            : "",
          briefScreenTexts.length ? `- Textos de tela definidos: ${briefScreenTexts.join(" | ")}` : "",
          briefVisualDirection.length
            ? `- DIREÇÃO VISUAL (contexto de composição — NÃO É TEXTO RENDERIZÁVEL, nunca escreva essas frases na arte):\n${briefVisualDirection.map((v) => `  • ${v}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n")
      : "";

    const contentSection = [
      `TÍTULO INTERNO DO CARD (apenas referência de nomenclatura — PROIBIDO renderizar este texto na imagem):\n"${demandTitle}"`,
      briefSection ? `\n${briefSection}` : "",
      demandObjective ? `\nOBJETIVO DO POST (contexto temático para o design):\n${demandObjective}` : "",
      demandDescription ? `\nCONTEXTO TEMÁTICO (NÃO inclua este texto na imagem — é a legenda para a descrição da rede social):\n${demandDescription}` : "",
      demandInstructions ? `\nINSTRUÇÕES DE PRODUÇÃO VISUAL (siga estas diretrizes para o design):\n${demandInstructions}` : "",
      "",
      `REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO:`,
      canonicalArt ? `- Esta é UMA ÚNICA peça/arte: todo o "TEXTO DA ARTE" pertence à MESMA imagem, na hierarquia definida pelas quebras de linha.` : "",
      canonicalArt ? `- Use esse texto EXATAMENTE como tipografia da peça, sem reescrever, resumir ou inventar novas frases.` : "",
      isStructured ? `- NÃO derive copy da legenda, do objetivo ou das instruções: o briefing canônico é a única fonte de texto da arte.` : "",
      `- O "TÍTULO INTERNO DO CARD" é nomenclatura interna do sistema (identificador da tarefa). NUNCA renderize esse texto na imagem, nem parcialmente, nem parafraseado literalmente.`,
      `- O campo "CONTEXTO TEMÁTICO" contém a LEGENDA que será publicada na DESCRIÇÃO do post na rede social. Este texto NÃO deve aparecer na imagem.`,
      canonicalArt
        ? `- Não crie títulos visuais alternativos: o texto do briefing é o título visual.`
        : `- Crie um TÍTULO VISUAL CURTO e original (2-6 palavras impactantes) derivado do OBJETIVO/INSTRUÇÕES/CONTEXTO para usar como tipografia principal da arte — não copie o título interno do card.`,
      canonicalArt ? "" : `- Apenas esse título visual curto e eventuais textos de gancho/CTA curtos devem aparecer como tipografia na imagem.`,
      `- A legenda e o título interno servem apenas para você entender o tema e tom do post.`,
    ].filter(Boolean).join("\n");


    // Proporção autoritativa: request > campo persistido na demand > default do tipo.
    const ratio = normalizeAspectRatio(
      aspectRatio || demand.image_aspect_ratio || aspectFromDemandType(demand.demand_type),
    );
    const aspectLabel = aspectPromptLabel(ratio);
    const authoritativeAspectRule = `\n\nFORMATO DE SAÍDA AUTORITATIVO: ${aspectLabel}. A proporção selecionada na interface prevalece sobre qualquer dimensão ou proporção diferente mencionada em textos antigos de planejamento/instruções. Não mude o canvas para seguir referências legadas.`;

    const minimalTextRule = isPlanned
      ? `\n\n========================================\n🚨 MODO "DEMANDA PLANEJADA" — TEXTO MÍNIMO NA IMAGEM (OBRIGATÓRIO):\n- A imagem deve ser VISUALMENTE CHAMATIVA, SIMPLES e de leitura instantânea.\n- TEXTO TOTAL na arte: no MÁXIMO 6 PALAVRAS (idealmente 2-4 palavras grandes e impactantes).\n- NÃO inclua parágrafos, frases longas, subtítulos, listas, descrições ou explicações na imagem.\n- NÃO escreva a legenda/descrição do post dentro da arte — isso vai apenas na descrição da rede social.\n- Use tipografia GRANDE, em destaque, com hierarquia clara (uma palavra-chave dominante).\n- Priorize ELEMENTO VISUAL (mascote, objeto, ilustração, ícone) ocupando a maior parte da composição.\n- Sem CTAs longos, sem "saiba mais", sem URLs, sem hashtags na imagem.\n========================================\n`
      : "";
    const imagePrompt = buildStaticPostPrompt({
      vi,
      basePrompt: basePrompt + minimalTextRule,
      strategySnippet,
      contentSection: contentSection + minimalTextRule + authoritativeAspectRule,
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
