import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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
    const { data: apiKeyData } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "Google AI Studio")
      .single();

    const GOOGLE_API_KEY = apiKeyData?.key_value;
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave 'Google AI Studio' não encontrada na tabela api_keys." }),
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

    console.log(`Auto-generating post image for demand ${demandId} (type: ${demand.demand_type})`);

    // 3. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, content_requirements, logo_url, logo_position, logo_size")
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

    console.log("Calling Gemini 3 Pro Image (gemini-3-pro-image-preview) via Google AI Studio...");

    // 9. Build parts with optional mascot + logo reference images
    const parts: any[] = [{ text: imagePrompt }];

    const fetchImageInline = async (url: string): Promise<{ mimeType: string; data: string } | null> => {
      try {
        const imgResp = await fetch(url);
        if (!imgResp.ok) return null;
        const imgBuffer = await imgResp.arrayBuffer();
        const bytes = new Uint8Array(imgBuffer);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return { mimeType: imgResp.headers.get("content-type") || "image/png", data: btoa(binary) };
      } catch (e) {
        console.error("Failed to fetch image:", e);
        return null;
      }
    };

    if (mascotImageUrls.length > 0) {
      for (const url of mascotImageUrls) {
        const inline = await fetchImageInline(url);
        if (inline) {
          parts.push({ inlineData: inline });
          console.log(`  → Mascot reference image attached as inline_data`);
        }
      }
    }

    if (logoUrl) {
      const logoInline = await fetchImageInline(logoUrl);
      if (logoInline) {
        parts.push({ inlineData: logoInline });
        console.log("  → Logo reference image attached as inline_data");
      }
    }

    // 10. Call Gemini 3 Pro Image via Google AI Studio
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_API_KEY}`;

    const response = await fetch(googleApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini 3 Pro Image error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro do Google AI Studio: ${response.status}` }),
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
