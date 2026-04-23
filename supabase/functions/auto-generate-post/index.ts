import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: fetch a remote image into a Blob (for OpenAI multipart endpoints)
async function fetchImageBlob(url: string): Promise<{ blob: Blob; filename: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/png";
    const buf = await r.arrayBuffer();
    const ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : "png";
    const filename = `ref-${crypto.randomUUID()}.${ext}`;
    return { blob: new Blob([buf], { type: ct }), filename };
  } catch (e) {
    console.error("Failed to fetch reference image:", e);
    return null;
  }
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch OpenAI API key (GPT Image 2 lives at OpenAI)
    const { data: apiKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "OPENAI_API_KEY")
      .single();

    const OPENAI_API_KEY = apiKeyData?.key_value;
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave 'OPENAI_API_KEY' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    console.log(`Auto-generating post image for demand ${demandId} (type: ${demand.demand_type}) via GPT Image 2`);

    // 3. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, sector, products_services, content_requirements, logo_url, logo_position, logo_size")
      .eq("id", demand.client_id)
      .single();

    const brandName = client?.fantasy_name || client?.name || "Marca";

    // 3b. Fetch visual identity preset (same as standalone)
    let presetColors = {
      primary: client?.brand_primary_color || "#000000",
      secondary: client?.brand_secondary_color || "#FFFFFF",
      highlight: null as string | null,
      text: null as string | null,
      font: client?.brand_font || "Montserrat",
    };

    const { data: preset } = await supabase
      .from("visual_identity_presets")
      .select("primary_color, secondary_color, highlight_color, text_color, font_name")
      .eq("company_id", demand.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (preset) {
      presetColors = {
        primary: preset.primary_color || presetColors.primary,
        secondary: preset.secondary_color || presetColors.secondary,
        highlight: preset.highlight_color,
        text: preset.text_color,
        font: preset.font_name || presetColors.font,
      };
    }

    // 4. Fetch mascot images if client has mascot
    let mascotImageUrls: string[] = [];
    if (client?.has_mascot) {
      const { data: mascotImages } = await supabase
        .from("company_mascot_images")
        .select("image_url")
        .eq("company_id", demand.client_id)
        .order("position", { ascending: true })
        .limit(2);

      if (mascotImages && mascotImages.length > 0) {
        mascotImageUrls = mascotImages.map((m: any) => m.image_url);
      }
    }

    // 5. Fetch posts prompt
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", demand.tenant_id)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

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

    // 8. Logo settings
    const logoUrl = (client as any)?.logo_url;
    const logoPosition = (client as any)?.logo_position || "bottom-right";
    const logoSize = (client as any)?.logo_size || "medium";
    const logoSizeMap: Record<string, string> = { small: "~8%", medium: "~12%", large: "~18%" };
    const logoPositionMap: Record<string, string> = {
      "top-left": "canto superior esquerdo", "top-right": "canto superior direito",
      "bottom-left": "canto inferior esquerdo", "bottom-right": "canto inferior direito",
      "bottom-center": "centro inferior",
    };
    const logoSection = logoUrl
      ? `\nLOGO DA MARCA (OBRIGATÓRIO):
- A logo da marca está fornecida como imagem de referência. INCLUA a logo no design OBRIGATORIAMENTE.
- Posição: ${logoPositionMap[logoPosition] || logoPosition}
- Tamanho: ${logoSizeMap[logoSize] || "~12%"} da área da imagem
- A logo deve ser nítida, legível e integrada harmoniosamente ao layout
- NÃO distorça, altere cores ou modifique a logo de nenhuma forma
- Reproduza a logo EXATAMENTE como na imagem de referência fornecida\n`
      : "";

    // 8b. Build image prompt
    const mascotSection = mascotImageUrls.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas. NÃO altere nenhuma característica do mascote. O mascote DEVE aparecer no design de forma integrada e harmoniosa.`
      : client?.has_mascot
        ? `- A marca possui um mascote (${client?.mascot_description || "sem descrição"}), mas nenhuma imagem de referência está disponível. Tente incluí-lo se possível.`
        : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    const contentReqsSection = (client as any)?.content_requirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${(client as any).content_requirements}\n`
      : '';

    const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}${contentReqsSection}Crie uma imagem profissional de post para rede social.

TÍTULO DO POST (pode aparecer como texto na imagem):
"${demandTitle}"

${demandObjective ? `OBJETIVO DO POST (contexto temático para o design):\n${demandObjective}\n` : ""}
${demandDescription ? `CONTEXTO TEMÁTICO (NÃO inclua este texto na imagem — é a legenda para a descrição da rede social):\n${demandDescription}\n` : ""}
${demandInstructions ? `INSTRUÇÕES DE PRODUÇÃO VISUAL (siga estas diretrizes para o design):\n${demandInstructions}\n` : ""}

REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO:
- O campo "CONTEXTO TEMÁTICO" contém a LEGENDA que será publicada na DESCRIÇÃO do post na rede social. Este texto NÃO deve aparecer na imagem.
- Apenas o TÍTULO e textos curtos de gancho/CTA devem aparecer como tipografia na imagem.
- A legenda serve apenas para você entender o tema e tom do post.

PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):
- Marca: "${brandName}" | ${client?.sector || "N/A"} | ${(client as any)?.products_services || "N/A"}
- Cor primária (${presetColors.primary}): Use em fundos, banners, boxes, shapes e elementos gráficos dominantes do layout
- Cor secundária (${presetColors.secondary}): Use em acentos, bordas, elementos complementares e variações de fundo
${presetColors.highlight ? `- Cor de destaque (${presetColors.highlight}): Use em botões, badges, CTAs, ícones e pequenos destaques visuais` : ""}
${presetColors.text ? `- Cor do texto (${presetColors.text}): Use na tipografia principal sobre os fundos` : ""}
- Tipografia: ${presetColors.font}
${mascotSection}
${logoSection}
REGRA CRÍTICA DE APLICAÇÃO DE CORES:
As cores da marca devem ser aplicadas APENAS em elementos de design gráfico (fundos, gradientes, boxes, banners, shapes, tipografia, ícones, bordas).
NUNCA aplique as cores da marca em objetos reais, pessoas, animais ou elementos figurativos.
Exemplo: se a cor primária é verde, o fundo e os boxes devem ser verdes, mas um leão deve ter cores NATURAIS realistas.
Os sujeitos e ilustrações figurativas devem manter aparência NATURAL e REALISTA.
A paleta de cores cria a identidade visual através do LAYOUT e DESIGN, não tingindo os elementos figurativos.

ESTILO VISUAL OBRIGATÓRIO:
- Crie designs com estilo de ilustração 3D estilizada, moderna e profissional
- Use cenários detalhados e realistas como background (escritórios, ambientes temáticos, paisagens relevantes ao tema)
- Tipografia bold, grande e impactante integrada ao design (não sobreposta de forma genérica)
- Composição dinâmica com profundidade e camadas visuais
- Qualidade de design de agência profissional de alto nível
- Contraste alto entre texto e fundo para legibilidade perfeita
- Elementos gráficos decorativos sutis que enriquecem o layout
- Cores vibrantes e paleta coerente com a identidade visual da marca
- Apenas o TÍTULO do post deve aparecer legível e bem posicionado na imagem

REGRAS OBRIGATÓRIAS:
${logoUrl ? "- A LOGO da marca DEVE aparecer no design conforme as instruções acima" : "- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem"}
- Design profissional para redes sociais
- Formato: 1:1 (quadrado, 1024x1024)
- IMPORTANTE: Gere um POST COMPLETO para rede social, não apenas um elemento isolado
`.trim();

    // 9. Pre-fetch reference images (mascot + logo) for GPT Image 2 /images/edits
    const referenceImages: { blob: Blob; filename: string }[] = [];
    for (const url of mascotImageUrls) {
      const ref = await fetchImageBlob(url);
      if (ref) {
        referenceImages.push(ref);
        console.log("  → Mascot reference attached");
      }
    }
    if (logoUrl) {
      const logoRef = await fetchImageBlob(logoUrl);
      if (logoRef) {
        referenceImages.push(logoRef);
        console.log("  → Logo reference attached");
      }
    }

    // 10. Call GPT Image 2 — /images/edits when refs exist, /images/generations otherwise.
    console.log(`Calling GPT Image 2 (refs: ${referenceImages.length})...`);

    let openaiResponse: Response;

    if (referenceImages.length > 0) {
      const form = new FormData();
      form.append("model", "gpt-image-2");
      form.append("prompt", imagePrompt);
      form.append("size", "1024x1024");
      form.append("quality", "high");
      // Note: gpt-image-2 does NOT support input_fidelity (gpt-image-1 only).
      form.append("n", "1");
      for (const ref of referenceImages) {
        form.append("image[]", ref.blob, ref.filename);
      }

      openaiResponse = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
    } else {
      openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: imagePrompt,
          size: "1024x1024",
          quality: "high",
          n: 1,
        }),
      });
    }

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("GPT Image 2 error:", openaiResponse.status, errorText);

      if (openaiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido na OpenAI. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (openaiResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Chave OpenAI inválida ou sem permissão para gpt-image-2." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro do GPT Image 2: ${openaiResponse.status} - ${errorText.substring(0, 300)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await openaiResponse.json();
    const imageBase64: string | undefined = data?.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.error("No image in GPT Image 2 response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem foi retornada pela OpenAI (gpt-image-2)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Upload to Supabase Storage
    console.log("Uploading generated image to storage...");

    const imageBytes = decodeBase64(imageBase64);
    const fileName = `auto-generated/${demand.client_id}/${demandId}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("card-attachments")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
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
      name: `Post Gerado - ${brandName}.png`,
      type: "image/png",
      size: imageBytes.length,
      storagePath: fileName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: "auto-generator", email: "system@ai", name: "IA - GPT Image 2 (Auto)" },
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

    console.log(`✅ Auto-generated post image attached to demand ${demandId} (GPT Image 2)`);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl,
        demandId,
        model: "gpt-image-2",
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
