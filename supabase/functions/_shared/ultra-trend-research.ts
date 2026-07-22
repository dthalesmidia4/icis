// Ultra trend research helper.
// Runs OpenAI Responses API with the `web_search` tool to bring real niche
// trends into the Ultra prompt. Never generates final demands; only produces
// a curated, structured research object that generate-ultra-demands injects.
//
// Fail-safe: any failure (unsupported tool, timeout, parse) degrades to
// research_mode:"inferred" — Ultra generation must never break because of it.

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const RESEARCH_MODEL = "gpt-5-mini";
const RESEARCH_TIMEOUT_MS = 45000;

export interface RelevantTrend {
  trend: string;
  why_it_matters: string;
  content_opportunity: string;
  risk_or_caution: string;
  source_hint: string;
  priority: "alta" | "media" | "baixa";
}

export interface UltraResearchResult {
  research_mode: "openai_web_search" | "inferred";
  niche: string;
  queries_used: string[];
  trend_summary: string;
  relevant_trends: RelevantTrend[];
  irrelevant_or_weak_trends: string[];
  recommended_angles_for_ultra: string[];
  generated_at: string;
  error?: string;
}

export interface UltraResearchInput {
  openaiApiKey: string;
  company: any;
  periodPlan: any;
  strategySnippet?: string;
  topAnamneseSnippets?: string[];
  highPriorityDates?: Array<{ date: string; name: string }>;
}

const truncate = (v: unknown, n: number): string => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!s) return "";
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1)).trim()}…`;
};

function buildBriefing(input: UltraResearchInput): { niche: string; briefing: string } {
  const c = input.company || {};
  const p = input.periodPlan || {};
  const niche = truncate(
    [c.sector, c.segment, c.niche, c.products_services].filter(Boolean).join(" | "),
    240,
  ) || (c.fantasy_name || c.name || "negócio local");

  const region = [c.city, c.state].filter(Boolean).join("/");
  const dates = (input.highPriorityDates || []).slice(0, 4)
    .map((d) => `${d.date} ${d.name}`).join("; ");

  const parts: string[] = [];
  parts.push(`Cliente: ${c.fantasy_name || c.name || "(sem nome)"}`);
  parts.push(`Nicho/Setor: ${niche}`);
  if (c.products_services) parts.push(`Serviços/produtos: ${truncate(c.products_services, 400)}`);
  if (region) parts.push(`Região: ${region}`);
  parts.push(`Período: ${p.period_start} → ${p.period_end}`);
  if (p.objective) parts.push(`Objetivo do período: ${truncate(p.objective, 300)}`);
  if (p.priority_channel) parts.push(`Canal prioritário: ${p.priority_channel}`);
  if (p.budget) parts.push(`Budget: ${p.budget}`);
  if (dates) parts.push(`Datas relevantes já no período: ${dates}`);
  if (input.strategySnippet) parts.push(`Estratégia (resumo): ${truncate(input.strategySnippet, 800)}`);
  if (input.topAnamneseSnippets?.length) {
    parts.push(`Dores/insights da anamnese: ${input.topAnamneseSnippets.slice(0, 4).map((s) => truncate(s, 220)).join(" | ")}`);
  }
  return { niche, briefing: parts.join("\n") };
}

const RESEARCH_JSON_INSTRUCTION = `Você é um pesquisador de tendências de marketing digital para o cliente descrito. Sua saída DEVE ser JSON válido no formato exato:
{
  "niche": "string curta descrevendo o nicho",
  "queries_used": ["4 a 6 queries específicas em português que você usaria/usou"],
  "trend_summary": "2-4 frases sintetizando o que está em alta no nicho AGORA (não copie textos)",
  "relevant_trends": [
    {
      "trend": "nome curto da tendência",
      "why_it_matters": "por que importa para ESTE cliente (não frase pronta)",
      "content_opportunity": "oportunidade de conteúdo específica para este cliente/canal",
      "risk_or_caution": "cuidado ou ressalva",
      "source_hint": "tipo de fonte/tema observado, sem URL literal se não tiver certeza",
      "priority": "alta|media|baixa"
    }
  ],
  "irrelevant_or_weak_trends": ["tendências genéricas que NÃO servem para este cliente (com micro-motivo)"],
  "recommended_angles_for_ultra": ["3-6 ângulos criativos específicos para este cliente inspirados nas tendências relevantes"]
}

REGRAS:
- Foque em tendências reais do nicho, não em conselhos genéricos de marketing.
- PROIBIDO copiar frases inteiras de artigos/posts. Apenas resumir e transformar em oportunidade.
- Máx 6 relevant_trends; qualidade > quantidade. Descarte o que não passar no filtro do cliente.
- Se não achar nada específico do nicho, retorne relevant_trends menor (até vazio) e explique em trend_summary.
- Responda APENAS o JSON, sem markdown, sem comentário.`;

async function callResponsesWithWebSearch(apiKey: string, briefing: string): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RESEARCH_TIMEOUT_MS);
  try {
    const resp = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        input: `${RESEARCH_JSON_INSTRUCTION}\n\n=== BRIEFING DO CLIENTE ===\n${briefing}`,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
      }),
      signal: abort.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    try { return { ok: true, json: JSON.parse(text) }; }
    catch { return { ok: false, error: "invalid envelope" }; }
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: e?.name === "AbortError" ? `timeout ${RESEARCH_TIMEOUT_MS}ms` : (e?.message || "fetch error") };
  }
}

async function callChatFallback(apiKey: string, briefing: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RESEARCH_TIMEOUT_MS);
  try {
    const resp = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        messages: [
          { role: "developer", content: `${RESEARCH_JSON_INSTRUCTION}\n\nATENÇÃO: web search não está disponível — deduza tendências a partir do briefing e do seu conhecimento geral do nicho. Marque priority com honestidade e descarte o que não conseguir sustentar.` },
          { role: "user", content: `=== BRIEFING ===\n${briefing}` },
        ],
        reasoning_effort: "low",
        max_completion_tokens: 3500,
        response_format: { type: "json_object" },
      }),
      signal: abort.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    let json: any; try { json = JSON.parse(text); } catch { return { ok: false, error: "invalid envelope" }; }
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return { ok: false, error: "empty content" };
    return { ok: true, content: content.trim() };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : (e?.message || "fetch error") };
  }
}

function extractResponsesText(json: any): string {
  if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  const out = json?.output;
  if (Array.isArray(out)) {
    const chunks: string[] = [];
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") chunks.push(c.text);
          else if (typeof c?.text?.value === "string") chunks.push(c.text.value);
        }
      }
    }
    if (chunks.length) return chunks.join("").trim();
  }
  const alt = json?.choices?.[0]?.message?.content;
  if (typeof alt === "string") return alt.trim();
  return "";
}

function safeParseJsonBlock(raw: string): any | null {
  if (!raw) return null;
  let s = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const m = s.match(/\{[\s\S]*\}$/);
  if (m) s = m[0];
  try { return JSON.parse(s); } catch { return null; }
}

function coerceResult(parsed: any, mode: "openai_web_search" | "inferred", niche: string, error?: string): UltraResearchResult {
  const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);
  const normPriority = (p: any): "alta" | "media" | "baixa" => {
    const s = String(p || "").toLowerCase();
    if (s.startsWith("alta") || s === "high") return "alta";
    if (s.startsWith("baix") || s === "low") return "baixa";
    return "media";
  };
  const relevant = asArr<any>(parsed?.relevant_trends).slice(0, 8).map((t) => ({
    trend: String(t?.trend || "").trim(),
    why_it_matters: String(t?.why_it_matters || "").trim(),
    content_opportunity: String(t?.content_opportunity || "").trim(),
    risk_or_caution: String(t?.risk_or_caution || "").trim(),
    source_hint: String(t?.source_hint || "").trim(),
    priority: normPriority(t?.priority),
  })).filter((t) => t.trend);

  return {
    research_mode: mode,
    niche: String(parsed?.niche || niche || "").trim(),
    queries_used: asArr<any>(parsed?.queries_used).map((q) => String(q)).filter(Boolean).slice(0, 8),
    trend_summary: String(parsed?.trend_summary || "").trim(),
    relevant_trends: relevant,
    irrelevant_or_weak_trends: asArr<any>(parsed?.irrelevant_or_weak_trends).map((s) => String(s)).filter(Boolean).slice(0, 10),
    recommended_angles_for_ultra: asArr<any>(parsed?.recommended_angles_for_ultra).map((s) => String(s)).filter(Boolean).slice(0, 8),
    generated_at: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}

function emptyInferred(niche: string, error: string): UltraResearchResult {
  return {
    research_mode: "inferred",
    niche,
    queries_used: [],
    trend_summary: "Pesquisa indisponível — Ultra deve se basear em estratégia, anamnese e calendário.",
    relevant_trends: [],
    irrelevant_or_weak_trends: [],
    recommended_angles_for_ultra: [],
    generated_at: new Date().toISOString(),
    error,
  };
}

export async function researchUltraTrends(input: UltraResearchInput): Promise<UltraResearchResult> {
  const { niche, briefing } = buildBriefing(input);
  if (!input.openaiApiKey) return emptyInferred(niche, "missing OPENAI_API_KEY");

  const primary = await callResponsesWithWebSearch(input.openaiApiKey, briefing);
  if (primary.ok) {
    const text = extractResponsesText(primary.json);
    const parsed = safeParseJsonBlock(text);
    if (parsed) return coerceResult(parsed, "openai_web_search", niche);
    console.warn("[ultra-research] responses parse failed, falling back to inferred");
  } else {
    console.warn("[ultra-research] responses failed:", primary.error);
  }

  const fb = await callChatFallback(input.openaiApiKey, briefing);
  if (fb.ok) {
    const parsed = safeParseJsonBlock(fb.content);
    if (parsed) return coerceResult(parsed, "inferred", niche, "web_search unavailable");
  }
  return emptyInferred(niche, fb.ok ? "inferred parse failed" : fb.error);
}

export function formatResearchForPrompt(r: UltraResearchResult): string {
  const cap = (s: string, n: number) => s.length <= n ? s : `${s.slice(0, n - 1)}…`;
  const rel = r.relevant_trends.length
    ? r.relevant_trends.map((t, i) =>
      `${i + 1}. [${t.priority}] ${t.trend}
   • Por que importa: ${cap(t.why_it_matters, 260)}
   • Oportunidade de conteúdo: ${cap(t.content_opportunity, 260)}
   • Cuidado: ${cap(t.risk_or_caution || "-", 200)}
   • Contexto/fonte: ${cap(t.source_hint || "-", 160)}`
    ).join("\n")
    : "(nenhuma tendência relevante identificada — trate como sinal de contenção, não invente trend)";

  const weak = r.irrelevant_or_weak_trends.length
    ? r.irrelevant_or_weak_trends.map((s) => `- ${cap(s, 200)}`).join("\n")
    : "(nenhuma)";
  const angles = r.recommended_angles_for_ultra.length
    ? r.recommended_angles_for_ultra.map((s) => `- ${cap(s, 260)}`).join("\n")
    : "(nenhum)";

  return `# TENDÊNCIAS E OPORTUNIDADES DO NICHO (pesquisa: ${r.research_mode})
Nicho identificado: ${r.niche || "-"}
Resumo: ${r.trend_summary || "-"}

TENDÊNCIAS RELEVANTES (use apenas se combinar com estratégia + anamnese + budget + canal + plano normal):
${rel}

TENDÊNCIAS DESCARTADAS / FRACAS (NÃO usar):
${weak}

ÂNGULOS RECOMENDADOS PARA ULTRA (inspiração — transformar em ideia própria do cliente):
${angles}

REGRAS DE USO DESTE BLOCO:
- Uma Ultra só pode usar uma tendência se conseguir transformar em ideia específica DESTE cliente.
- PROIBIDO copiar frases das fontes; a tendência é matéria-prima estratégica, não conteúdo final.
- PROIBIDO Ultra do tipo "vídeo curto porque vídeo curto está em alta" — precisa amarrar com dor/objeção/posicionamento reais.
- Se a tendência não passar no filtro do cliente, ignore e use o raciocínio interno.`;
}
