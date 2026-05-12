import { createClient } from "npm:@supabase/supabase-js@2";
import { getOpenAiKey, MissingApiKeyError } from "../_shared/api-keys.ts";
import { getCarouselPrompt } from "../_shared/system-prompts.ts";
import { MODELS, OPENAI_CHAT_URL } from "../_shared/models.ts";
import { loadVisualIdentity } from "../_shared/visual-identity.ts";
import { renderBrandContextLine, renderContentRequirementsBlock } from "../_shared/visual-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { idea, slideCount, presetId, mascotImageUrls, clientId, tenantId } = await req.json();
    if (!idea || !slideCount || !clientId || !tenantId) {
      return new Response(JSON.stringify({ error: "idea, slideCount, clientId e tenantId são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let OPENAI_API_KEY: string;
    try { OPENAI_API_KEY = await getOpenAiKey(supabase); }
    catch (e) {
      const msg = e instanceof MissingApiKeyError ? e.message : "Erro ao carregar OPENAI_API_KEY.";
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const vi = await loadVisualIdentity(supabase, clientId, { presetId, mascotImageLimit: 0 });

    const { data: strategy } = await supabase
      .from("strategies").select("strategy_text")
      .eq("company_id", clientId).eq("status", "Ativa")
      .order("created_at", { ascending: false }).limit(1).single();
    const strategyText = strategy?.strategy_text ? strategy.strategy_text.substring(0, 1500) : "";

    // Carousel prompt: same canonical+legacy resolution used by período
    const { content: basePrompt } = await getCarouselPrompt(supabase, tenantId);

    const hasMascotRef = !!(mascotImageUrls && mascotImageUrls.length > 0);
    const mascotInfo = hasMascotRef
      ? `O cliente possui um mascote oficial. ${vi.mascot.description ? `Descrição: ${vi.mascot.description}.` : ""} Considere referenciá-lo nos textos quando relevante.`
      : "";

    const systemPrompt = `Você é um copywriter especialista em marketing digital e conteúdo para redes sociais. Sua função é criar textos para carrosséis de posts.

${basePrompt ? "DIRETRIZES DO SISTEMA (PROMPT DO CARROSSEL):\n" + basePrompt + "\n\n" : ""}${strategyText ? "ESTRATÉGIA GERAL DO CLIENTE:\n" + strategyText + "\n\n" : ""}${renderContentRequirementsBlock(vi)}CONTEXTO DO CLIENTE:
- Marca: ${vi.brandName}
- Setor: ${vi.sector || "N/A"}
- Produtos/Serviços: ${vi.productsServices || "N/A"}
- ${renderBrandContextLine(vi)}
${mascotInfo ? "- " + mascotInfo : ""}

REGRAS OBRIGATÓRIAS:
1. Você DEVE retornar EXATAMENTE ${slideCount} slides
2. O texto de cada slide deve ser conciso e impactante, sem limite rígido de caracteres
3. O texto deve ser direto e adequado para redes sociais
4. O Slide 1 SEMPRE deve ser o "gancho" — frase que atrai atenção
5. O último slide SEMPRE deve ser o CTA (Call to Action)
6. Os slides intermediários devem desenvolver a ideia de forma progressiva
7. Use a função "create_carousel_slides" para retornar os slides estruturados`;

    const userPrompt = `Crie o conteúdo textual para um carrossel de ${slideCount} slides sobre:\n\n"${idea}"\n\nRetorne exatamente ${slideCount} slides, cada um com texto impactante e um rótulo descritivo.`;

    const response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELS.TEXT_PLANNING,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "create_carousel_slides",
            description: "Retorna os slides do carrossel estruturados",
            parameters: {
              type: "object",
              properties: {
                slides: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "Texto do slide" },
                      label: { type: "string", description: "Rótulo descritivo do slide, ex: Gancho (Atração), Conteúdo, Chamada para Ação (CTA)" },
                    },
                    required: ["text", "label"], additionalProperties: false,
                  },
                },
              },
              required: ["slides"], additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_carousel_slides" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Erro do gateway de IA: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "A IA não retornou os slides estruturados." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let slides;
    try {
      const args = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
      slides = args.slides;
    } catch {
      return new Response(JSON.stringify({ error: "Falha ao interpretar resposta da IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return new Response(JSON.stringify({ error: "A IA não retornou slides válidos." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      slides: slides.map((s: any) => ({ text: s.text || "", label: s.label || "Conteúdo" })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("generate-carousel-content error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
