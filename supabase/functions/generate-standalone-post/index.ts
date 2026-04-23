import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to fetch a remote image into a Blob (for OpenAI multipart endpoints)
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
    const { idea, presetId, mascotImageUrls, clientId, tenantId } = await req.json();

    if (!idea || !clientId || !tenantId) {
      return new Response(
        JSON.stringify({ error: "idea, clientId e tenantId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch OpenAI API key from api_keys table (GPT Image 2 lives at OpenAI)
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

    // 1. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description, content_requirements, logo_url, logo_position, logo_size")
      .eq("id", clientId)
      .single();

    const brandName = client?.fantasy_name || client?.name || "Marca";

    // 2. Fetch preset colors if selected
    let presetColors = {
      primary: client?.brand_primary_color || "#000000",
      secondary: client?.brand_secondary_color || "#FFFFFF",
      highlight: null as string | null,
      text: null as string | null,
      font: client?.brand_font || "Montserrat",
    };

    if (presetId) {
      const { data: preset } = await supabase
        .from("visual_identity_presets")
        .select("primary_color, secondary_color, highlight_color, text_color, font_name")
        .eq("id", presetId)
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
    }

    // 3. Fetch posts prompt from system_prompts (always pull latest)
    const { data: promptData } = await supabase
      .from("system_prompts")
      .select("prompt_content")
      .eq("tenant_id", tenantId)
      .eq("prompt_key", "generate_posts_prompt")
      .single();

    const basePrompt = promptData?.prompt_content || "";

    // 4. Fetch active strategy for tone
    const { data: strategy } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", clientId)
      .eq("status", "Ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const strategySnippet = strategy?.strategy_text
      ? `Tom de voz e estratégia da marca: ${strategy.strategy_text.substring(0, 500)}`
      : "";

    // 5. Build logo prompt section
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

    const mascotSection = mascotImageUrls && mascotImageUrls.length > 0
      ? `A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida. O mascote DEVE aparecer no design de forma integrada e harmoniosa.`
      : `NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    const contentReqsSection = (client as any)?.content_requirements
      ? `\nEXIGÊNCIAS DE CONTEÚDO DO CLIENTE (SIGA OBRIGATORIAMENTE):\n${(client as any).content_requirements}\n`
      : '';

    const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}${contentReqsSection}Crie uma imagem profissional de post para rede social.

IDEIA DO USUÁRIO (use como tema/contexto, NÃO reproduza este texto integralmente na imagem): "${idea}"

REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO:
- A ideia acima descreve o TEMA do post. NÃO copie o texto da ideia literalmente na imagem.
- Crie um TÍTULO CURTO e impactante baseado na ideia para usar como tipografia na imagem.
- Apenas títulos curtos e textos de gancho/CTA devem aparecer como tipografia na imagem.

PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):
- Marca: "${brandName}"
- Cor primária (${presetColors.primary}): Use em fundos, banners, boxes, shapes e elementos gráficos dominantes do layout
- Cor secundária (${presetColors.secondary}): Use em acentos, bordas, elementos complementares e variações de fundo
${presetColors.highlight ? `- Cor de destaque (${presetColors.highlight}): Use em botões, badges, CTAs, ícones e pequenos destaques visuais` : ""}
${presetColors.text ? `- Cor do texto (${presetColors.text}): Use na tipografia principal sobre os fundos` : ""}
- Tipografia: ${presetColors.font}
- ${mascotSection}
${logoSection}
REGRA CRÍTICA DE APLICAÇÃO DE CORES:
As cores da marca devem ser aplicadas APENAS em elementos de design gráfico (fundos, gradientes, boxes, banners, shapes, tipografia, ícones, bordas).
NUNCA aplique as cores da marca em objetos reais, pessoas, animais ou elementos figurativos.
Os sujeitos e ilustrações figurativas devem manter aparência NATURAL e REALISTA.
A paleta de cores cria a identidade visual através do LAYOUT e DESIGN, não tingindo os elementos figurativos.

REGRAS OBRIGATÓRIAS:
${logoUrl ? "- A LOGO da marca DEVE aparecer no design conforme as instruções acima" : "- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem\n- NÃO adicione texto com o nome da marca em nenhum lugar da imagem"}
- Design profissional para redes sociais
- Formato: 1:1 quadrado (1024x1024)
- Cores vibrantes e contraste alto
- Texto legível e bem posicionado
`.trim();

    // 6. Pre-fetch reference images (mascot + logo) to send to GPT Image 2 edits endpoint
    const referenceImages: { blob: Blob; filename: string }[] = [];

    if (mascotImageUrls && Array.isArray(mascotImageUrls)) {
      for (const url of mascotImageUrls) {
        const ref = await fetchImageBlob(url);
        if (ref) {
          referenceImages.push(ref);
          console.log("  → Mascot reference attached");
        }
      }
    }

    if (logoUrl) {
      const logoRef = await fetchImageBlob(logoUrl);
      if (logoRef) {
        referenceImages.push(logoRef);
        console.log("  → Logo reference attached");
      }
    }

    // 7. Call GPT Image 2 — use /images/edits when references exist (to enforce mascot/logo fidelity),
    //    otherwise use /images/generations.
    console.log(`Generating standalone post with GPT Image 2 (refs: ${referenceImages.length})...`);

    let openaiResponse: Response;

    if (referenceImages.length > 0) {
      const form = new FormData();
      form.append("model", "gpt-image-2");
      form.append("prompt", imagePrompt);
      form.append("size", "1024x1024");
      form.append("quality", "high");
      // Note: gpt-image-2 does NOT support input_fidelity (gpt-image-1 only). References are honored via /images/edits.
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
        JSON.stringify({ error: `Erro na geração de imagem: ${openaiResponse.status} - ${errorText.substring(0, 300)}` }),
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

    // 8. Upload to Supabase Storage
    console.log("Uploading generated image to storage...");
    const imageBytes = decodeBase64(imageBase64);
    const fileName = `standalone-posts/${clientId}/${crypto.randomUUID()}.png`;

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

    console.log("✅ Post estático gerado com sucesso (GPT Image 2)");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: publicUrlData.publicUrl,
        message: "Post gerado com sucesso!",
        model: "gpt-image-2",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-standalone-post error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
