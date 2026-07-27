import { createClient } from "npm:@supabase/supabase-js@2";
import { getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const isImage = (att: any) => {
  const t = (att?.type || "").toLowerCase();
  const n = (att?.name || "").toLowerCase();
  return t.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(n);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { demandId } = await req.json();
    if (!demandId) {
      return new Response(JSON.stringify({ error: "demandId é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let OPENAI_API_KEY: string;
    try {
      OPENAI_API_KEY = await getOpenAiKey(supabase);
    } catch (e) {
      const msg = e instanceof MissingApiKeyError ? e.message : "Erro ao carregar OPENAI_API_KEY.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: demand, error: demandError } = await supabase
      .from("demands")
      .select("id, title, objective, description, attachments, client_id")
      .eq("id", demandId)
      .single();

    if (demandError || !demand) {
      return new Response(JSON.stringify({ error: "Demanda não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attachments = Array.isArray(demand.attachments) ? demand.attachments : [];
    const images = attachments.filter(isImage).slice(0, 10);

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma imagem encontrada nos anexos deste card." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextParts: string[] = [];
    if (demand.title) contextParts.push(`Título: ${demand.title}`);
    if (demand.objective) contextParts.push(`Objetivo: ${String(demand.objective).replace(/<[^>]*>/g, " ").slice(0, 500)}`);
    const context = contextParts.join("\n");

    const systemPrompt = `Você gera uma descrição CURTA e OBJETIVA dos anexos de um card, para ajudar o usuário a entender rapidamente o que é o anexo e para que serve na demanda.

REGRAS OBRIGATÓRIAS:
- Máximo 240 caracteres, em UMA única frase (no máximo duas frases curtas).
- Português do Brasil, tom neutro e funcional.
- Formato ideal: [Tipo do anexo] + [conteúdo principal] + [uso no card].
- NÃO descreva cores, posições, elementos visuais em detalhe, nem faça análise criativa.
- NÃO use markdown, listas, títulos, aspas, emojis, hashtags nem CTA.
- Se houver múltiplas imagens, gere UMA descrição única e resumida do conjunto.
- Retorne APENAS o texto da descrição.`;

    const userContent: any[] = [
      { type: "text", text: `Escreva a legenda para este post de Instagram com base nas imagens em anexo.${context ? `\n\nContexto auxiliar:\n${context}` : ""}` },
      ...images.map((img: any) => ({ type: "image_url", image_url: { url: img.url } })),
    ];

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.8,
        max_tokens: 800,
      }),
    });

    if (!openaiResp.ok) {
      const errTxt = await openaiResp.text();
      console.error("OpenAI error:", openaiResp.status, errTxt);
      return new Response(JSON.stringify({ error: `OpenAI: ${openaiResp.status}`, details: errTxt }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await openaiResp.json();
    const caption: string = (data?.choices?.[0]?.message?.content || "").trim();

    if (!caption) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await supabase
      .from("demands")
      .update({ post_caption: caption, updated_at: new Date().toISOString() })
      .eq("id", demandId);

    if (updErr) {
      console.error("Update error:", updErr);
      return new Response(JSON.stringify({ error: "Erro ao salvar legenda", details: updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, caption }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-post-caption error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
