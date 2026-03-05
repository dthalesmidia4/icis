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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // 2. Check if demand type is "Post Estático" (case-insensitive partial match)
    const demandType = (demand.demand_type || "").toLowerCase();
    const isPostEstatico = demandType.includes("post") && demandType.includes("est");
    // Also accept exact common variations
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
      .select("name, fantasy_name, brand_primary_color, brand_secondary_color, brand_font, has_mascot, mascot_description")
      .eq("id", demand.client_id)
      .single();

    const brandName = client?.fantasy_name || client?.name || "Marca";

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
    const cardContent = [
      demand.title ? `Título: ${demand.title}` : "",
      demand.objective ? `Objetivo: ${demand.objective}` : "",
      demand.instructions ? `Instruções: ${demand.instructions.replace(/<[^>]*>/g, " ").trim()}` : "",
      demand.description ? `Descrição: ${demand.description.replace(/<[^>]*>/g, " ").trim()}` : "",
      demand.observations ? `Observações: ${demand.observations.replace(/<[^>]*>/g, " ").trim()}` : "",
    ].filter(Boolean).join("\n");

    // 8. Build image prompt
    const mascotSection = mascotImageUrls.length > 0
      ? `- MASCOTE: A marca possui um mascote oficial. ${client?.mascot_description ? `Descrição detalhada: ${client.mascot_description}.` : ""} OBRIGATÓRIO: Reproduza o mascote EXATAMENTE como na imagem de referência fornecida — mesma aparência, cabelo, roupa, proporções e características físicas. NÃO altere nenhuma característica do mascote. O mascote DEVE aparecer no design de forma integrada e harmoniosa.`
      : client?.has_mascot
        ? `- A marca possui um mascote (${client?.mascot_description || "sem descrição"}), mas nenhuma imagem de referência está disponível. Tente incluí-lo se possível.`
        : `- NÃO inclua personagens, mascotes ou figuras humanas no design.`;

    const imagePrompt = `
${basePrompt ? basePrompt + "\n\n" : ""}${strategySnippet ? strategySnippet + "\n\n" : ""}Crie uma imagem profissional de post para rede social.

CONTEÚDO DO CARD APROVADO:
${cardContent}

BRANDING:
- Cor primária: ${client?.brand_primary_color || "#000000"}
- Cor secundária: ${client?.brand_secondary_color || "#FFFFFF"}
- Tipografia: ${client?.brand_font || "Montserrat"}
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

    console.log("Calling Nano Banana 3 (gemini-3-pro-image-preview)...");

    // 9. Build message content
    const contentParts: any[] = [{ type: "text", text: imagePrompt }];

    if (mascotImageUrls.length > 0) {
      for (const url of mascotImageUrls) {
        contentParts.push({
          type: "image_url",
          image_url: { url },
        });
      }
      console.log(`  → ${mascotImageUrls.length} mascot reference image(s) attached`);
    }

    // 10. Call Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: contentParts,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro do gateway de IA: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const base64Url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!base64Url) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem foi retornada pelo modelo." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Upload to Supabase Storage
    console.log("Uploading generated image to storage...");

    const base64Data = base64Url.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = decodeBase64(base64Data);

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
      uploadedBy: { id: "auto-generator", email: "system@ai", name: "IA - Auto Geração (Aprovação)" },
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
