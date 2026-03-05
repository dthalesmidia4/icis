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

    // Fetch Google AI Studio API key from api_keys table
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

    // 1. Fetch client branding
    const { data: client } = await supabase
      .from("tenant_companies")
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description")
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

    // 3. Fetch posts prompt from system_prompts
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

    // 5. Build the image prompt
    const mascotSection = mascotImageUrls && mascotImageUrls.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas. NÃO altere nenhuma característica do mascote. O mascote DEVE aparecer no design de forma integrada e harmoniosa.`
      : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional de post para rede social.

IDEIA DO USUÁRIO:
"${idea}"

BRANDING:
- Cor primária: ${presetColors.primary}
- Cor secundária: ${presetColors.secondary}
${presetColors.highlight ? `- Cor de destaque: ${presetColors.highlight}` : ""}
${presetColors.text ? `- Cor do texto: ${presetColors.text}` : ""}
- Tipografia: ${presetColors.font}
${mascotSection}

REGRAS OBRIGATÓRIAS:
- NÃO inclua o nome da empresa, logotipo ou marca d'água na imagem
- NÃO adicione texto com o nome da marca em nenhum lugar da imagem
- Design profissional para redes sociais
- Formato: 1:1 (quadrado, 1024x1024)
- IMPORTANTE: Gere um POST COMPLETO para rede social, não apenas um elemento isolado
- Cores vibrantes e contraste alto
- Texto legível e bem posicionado
`.trim();

    console.log("Generating standalone post via Google AI Studio (gemini-2.0-flash-exp-image-generation)...");

    // 6. Build request parts for Google AI Studio
    const parts: any[] = [{ text: imagePrompt }];

    if (mascotImageUrls && mascotImageUrls.length > 0) {
      for (const url of mascotImageUrls) {
        try {
          const imgResp = await fetch(url);
          if (imgResp.ok) {
            const imgBuffer = await imgResp.arrayBuffer();
            const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
            const contentType = imgResp.headers.get("content-type") || "image/png";
            parts.push({
              inline_data: {
                mime_type: contentType,
                data: imgBase64,
              },
            });
            console.log("  → Mascot reference image attached as inline_data");
          }
        } catch (e) {
          console.error("Failed to fetch mascot image:", e);
        }
      }
    }

    // 7. Call Google AI Studio directly
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${GOOGLE_API_KEY}`;

    const response = await fetch(googleApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageDimension: { width: 1024, height: 1024 },
        },
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
        JSON.stringify({ error: `Erro na geração de imagem: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract base64 image from Google AI Studio response
    let imageBase64 = "";
    let imageMimeType = "image/png";

    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const candidateParts = candidate.content?.parts || [];
      for (const part of candidateParts) {
        if (part.inline_data) {
          imageBase64 = part.inline_data.data;
          imageMimeType = part.inline_data.mime_type || "image/png";
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

    // 8. Upload to Supabase Storage
    console.log("Uploading generated image to storage...");

    const imageBytes = decodeBase64(imageBase64);
    const ext = imageMimeType.includes("jpeg") ? "jpg" : "png";
    const fileName = `standalone-posts/${clientId}/${crypto.randomUUID()}.${ext}`;

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

    console.log("✅ Post image generated and uploaded successfully via Google AI Studio");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: publicUrlData.publicUrl,
        message: "Post gerado com sucesso!",
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
