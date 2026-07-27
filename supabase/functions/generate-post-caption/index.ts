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

const stripHtml = (s: string) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

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
      .select("id, title, objective, description, instructions, observations, demand_type, post_caption, attachments, client_id, tenant_id")
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

    const isCarousel = images.length > 1;

    let clientContext = "";
    if (demand.client_id) {
      const { data: client } = await supabase
        .from("tenant_companies")
        .select("name, fantasy_name, segment")
        .eq("id", demand.client_id)
        .maybeSingle();
      if (client) {
        const parts = [client.fantasy_name || client.name, client.segment].filter(Boolean);
        if (parts.length) clientContext = `Cliente: ${parts.join(" • ")}`;
      }
    }

    const contextParts: string[] = [];
    if (clientContext) contextParts.push(clientContext);
    if (demand.demand_type) contextParts.push(`Tipo: ${demand.demand_type}`);
    if (demand.title) contextParts.push(`Título: ${demand.title}`);
    if (demand.objective) contextParts.push(`Objetivo: ${stripHtml(demand.objective).slice(0, 600)}`);
    if (demand.description) contextParts.push(`Descrição: ${stripHtml(demand.description).slice(0, 600)}`);
    if (demand.instructions) contextParts.push(`Instruções: ${stripHtml(demand.instructions).slice(0, 400)}`);
    if (demand.observations) contextParts.push(`Observações: ${stripHtml(demand.observations).slice(0, 300)}`);
    if (demand.post_caption) contextParts.push(`Legenda atual (reescrever/melhorar): ${stripHtml(demand.post_caption).slice(0, 400)}`);
    const context = contextParts.join("\n");

    const systemPrompt = `Você é copywriter de Instagram. Gere uma LEGENDA pronta para publicação — nunca uma descrição visual dos anexos.

REGRAS ABSOLUTAS:
- NUNCA descreva o que aparece nas imagens. Nada de "a imagem mostra", "no anexo aparece", "este post apresenta", cores, posições, elementos visuais.
- Use os anexos apenas como pista do TEMA. O contexto do card é a fonte principal.
- Português do Brasil, linguagem natural de rede social, tom humano e direto.
- Sem markdown, sem títulos, sem aspas, sem "Legenda:". Sem hashtags automáticas (no máx. 3 hashtags e só se fizer muito sentido — na dúvida, nenhuma).
- Poucos ou nenhum emoji. Não use listas nem bullets.
- Parágrafos curtos, separados por uma linha em branco.

${isCarousel ? `MODO: CARROSSEL (${images.length} slides)
Estrutura em 3 a 5 parágrafos curtos:
1) Apresente o tema.
2) Abra curiosidade / traga a dúvida ou problema que o carrossel responde — NÃO entregue a resposta completa.
3) Convide a pessoa a passar para o lado / ver todos os slides.
Objetivo: gerar curiosidade, não substituir o conteúdo dos slides.`
: `MODO: POST ESTÁTICO (1 anexo)
Estrutura em 2 a 4 parágrafos curtos:
1) Frase inicial chamativa conectada ao tema.
2) Desenvolvimento breve com a ideia central.
3) CTA simples (pergunta, convite, chamada suave).
Não descreva a imagem; fale do TEMA.`}

Retorne APENAS o texto da legenda, pronto para colar no Instagram.`;

    const userText = `${isCarousel ? `Gere a LEGENDA de CARROSSEL (${images.length} slides).` : "Gere a LEGENDA de POST ESTÁTICO (1 anexo)."}
Use os anexos apenas para captar o tema — não os descreva.

Contexto do card:
${context || "(sem contexto adicional — inferir tema pelos anexos)"}`;

    const userContent: any[] = [
      { type: "text", text: userText },
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
        max_tokens: 550,
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
    let caption: string = (data?.choices?.[0]?.message?.content || "").trim();
    // strip surrounding quotes and "Legenda:" prefixes, normalize blank lines
    caption = caption
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^\s*legenda\s*:\s*/i, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

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

    return new Response(JSON.stringify({ success: true, caption, mode: isCarousel ? "carousel" : "static" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-post-caption error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
