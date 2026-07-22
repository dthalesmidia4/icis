// Shared context builder for period plan generation (normal + ultra).
// Fetches everything we know about the client and returns:
//   - a rich `contextText` block for the user message
//   - the raw pieces (company, strategy, guidelines, adaptive) if a caller
//     wants to compose extra sections (e.g. anti-repetition for ultra).
//
// This centralises the "no more 420-char truncation" rule so both functions
// send the same solid base of evidence to the model.

const truncate = (v: unknown, n: number) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (!s) return "";
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1)).trim()}…`;
};

const GUIDELINE_KEYS: Array<[string, string]> = [
  ["tone_of_voice", "Tom de voz"],
  ["content_pillars", "Pilares de conteúdo"],
  ["preferred_ctas", "CTAs preferidos"],
  ["forbidden_words", "Palavras/temas proibidos"],
  ["active_channels", "Canais ativos"],
  ["offer_and_ticket", "Oferta principal e ticket"],
  ["main_competitors", "Concorrentes/referências"],
];

export interface PlanningContext {
  company: any;
  periodPlan: any;
  strategyText: string;
  questionSession: any | null;
  adaptive: any;
  contextText: string;
}

export async function buildPlanningContext(
  supabase: any,
  periodPlanId: string,
  tenantId: string,
): Promise<PlanningContext> {
  const { data: periodPlanData, error: periodError } = await supabase
    .from("period_plans")
    .select("*")
    .eq("id", periodPlanId)
    .single();
  if (periodError || !periodPlanData) throw new Error("Plano de período não encontrado");
  const periodPlan = periodPlanData as any;

  const { data: companyData, error: companyError } = await supabase
    .from("tenant_companies")
    .select("*")
    .eq("id", periodPlan.company_id)
    .single();
  if (companyError || !companyData) throw new Error("Empresa não encontrada");
  const company = companyData as any;

  // Strategy — full text (soft-capped ~6k chars)
  let strategyText = "";
  if (periodPlan.strategy_id) {
    const { data } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("id", periodPlan.strategy_id)
      .single();
    if (data) strategyText = (data as any).strategy_text || "";
  } else {
    const { data } = await supabase
      .from("strategies")
      .select("strategy_text")
      .eq("company_id", periodPlan.company_id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) strategyText = (data as any).strategy_text || "";
  }

  // Question session (raw)
  const { data: qsData } = await supabase
    .from("question_sessions")
    .select("questions, answers")
    .eq("company_id", periodPlan.company_id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Adaptive context (RPC)
  const { data: acData } = await (supabase as any).rpc("get_contextual_planning_input", {
    p_client_id: periodPlan.company_id,
    p_period_start: periodPlan.period_start,
    p_period_end: periodPlan.period_end,
  });
  const adaptive = acData?.success ? acData : {
    calendar_events: [], successful_patterns: [], failed_patterns: [],
    recent_fingerprints: [], avoid_fingerprints: [], top_demand_types: [],
  };

  // === Build sections ===
  const strategyBlock = strategyText
    ? truncate(strategyText, 6000)
    : "(estratégia não definida)";

  // Anamnese: Q&A completos (limite por resposta 500ch, total ~5k)
  const anamneseLines: string[] = [];
  const guidelinesLines: string[] = [];
  if (qsData) {
    const answers = ((qsData as any).answers || {}) as Record<string, any>;
    const questions = Array.isArray((qsData as any).questions) ? (qsData as any).questions as string[] : [];
    // Numbered questions
    for (let i = 0; i < Math.max(28, questions.length); i++) {
      const q = questions[i];
      const a = String(answers[`question_${i}`] || "").trim();
      if (q && a) anamneseLines.push(`Q${i + 1}. ${q}\nR: ${truncate(a, 500)}`);
    }
    // Named guideline fields
    for (const [key, label] of GUIDELINE_KEYS) {
      const v = String(answers[key] || "").trim();
      if (v) guidelinesLines.push(`- ${label}: ${truncate(v, 400)}`);
    }
  }
  const anamneseBlock = anamneseLines.length
    ? anamneseLines.join("\n\n").slice(0, 5500)
    : "(anamnese vazia)";
  const guidelinesBlock = guidelinesLines.length
    ? guidelinesLines.join("\n")
    : "(sem diretrizes nomeadas preenchidas)";

  // Adaptive sub-blocks
  const cal = Array.isArray(adaptive.calendar_events) ? adaptive.calendar_events : [];
  const succ = Array.isArray(adaptive.successful_patterns) ? adaptive.successful_patterns : [];
  const fail = Array.isArray(adaptive.failed_patterns) ? adaptive.failed_patterns : [];
  const recent = Array.isArray(adaptive.recent_fingerprints) ? adaptive.recent_fingerprints : [];

  // === RANQUEAMENTO ESTRATÉGICO DE DATAS ===
  // Considera relevância comercial (priority do banco), aderência ao segmento do
  // cliente, canal, público, e estratégia. Datas fracas viram bloco "IGNORADAS"
  // com justificativa — a IA NÃO deve gerar demanda só porque a data existe.
  const sectorBlob = [
    company.sector, company.segment, company.niche, company.products_services, company.fantasy_name, company.name,
  ].filter(Boolean).join(" ").toLowerCase();

  const SEGMENT_BOOSTS: Array<{ match: RegExp; dates: RegExp; boost: number; reason: string }> = [
    { match: /(pai|família|famil|B2C|varej|saúde|saude|educa|veterin|pet|servi[çc]o local|psicolog|estét|est[eé]tica|ve[ií]cul|moda|beleza|academia|restaur|padaria)/i,
      dates: /dia dos pais/i, boost: 15, reason: "público B2C/familiar com forte apelo à data" },
    { match: /(mãe|mae|família|B2C|varej|saúde|educa|veterin|pet|psicolog|estét|moda|beleza|joalh|floricultura|restaur)/i,
      dates: /dia das mães/i, boost: 15, reason: "público B2C/familiar com forte apelo à data" },
    { match: /(namor|casal|romance|joalh|floricultura|restaur|hotel|viagem|moda|beleza|estét|presente)/i,
      dates: /dia dos namorados/i, boost: 15, reason: "segmento romance/presente" },
    { match: /(crian[çc]a|infantil|pediatr|escola|educa|brinquedo|pet|família)/i,
      dates: /dia das crian[çc]as/i, boost: 15, reason: "público infantil/familiar" },
    { match: /(varej|e-?commerce|loja|moda|eletr[oô]nic|beleza|casa|decora|marketplac|servi[çc]o)/i,
      dates: /(black friday|natal|ano novo|cyber monday)/i, boost: 20, reason: "data comercial forte para o segmento" },
    { match: /(mulher|feminin|beleza|estét|moda|academia|saúde)/i,
      dates: /dia internacional da mulher/i, boost: 10, reason: "público predominantemente feminino" },
  ];

  const rankDate = (e: any) => {
    const base = Number(e.priority) || 0;
    let bonus = 0;
    const reasons: string[] = [];
    for (const rule of SEGMENT_BOOSTS) {
      if (rule.dates.test(e.name || "") && rule.match.test(sectorBlob)) {
        bonus += rule.boost;
        reasons.push(rule.reason);
      }
    }
    // event_type marketing tem peso adicional (data comercial)
    if ((e.type || "").toLowerCase() === "marketing") bonus += 5;
    const score = base + bonus;
    let tier: "alta" | "media" | "baixa";
    if (score >= 80) tier = "alta";
    else if (score >= 50) tier = "media";
    else tier = "baixa";
    return { ...e, score, tier, matchReasons: reasons };
  };

  const rankedCal = cal.map(rankDate).sort((a: any, b: any) => b.score - a.score);
  const highDates = rankedCal.filter((e: any) => e.tier === "alta");
  const medDates = rankedCal.filter((e: any) => e.tier === "media");
  const lowDates = rankedCal.filter((e: any) => e.tier === "baixa");

  const fmtDate = (e: any) => {
    const parts: string[] = [];
    parts.push(`- ${e.date} — ${e.name}${e.priority ? ` (prioridade base ${e.priority}${e.score !== e.priority ? `, ajustada ${e.score}` : ""})` : ""}`);
    const reason = e.matchReasons?.length
      ? e.matchReasons.join("; ")
      : (e.type === "marketing" ? "data comercial nacional relevante" : "data cultural/institucional relevante");
    parts.push(`  • Motivo de relevância: ${reason}`);
    if (e.tips) parts.push(`  • Possível uso estratégico: ${truncate(e.tips, 260)}`);
    return parts.join("\n");
  };

  const highBlock = highDates.length
    ? highDates.map(fmtDate).join("\n")
    : "(nenhuma data de alta prioridade no período — não invente comemoração)";
  const medBlock = medDates.length
    ? medDates.map(fmtDate).join("\n")
    : "(nenhuma)";
  const lowBlock = lowDates.length
    ? lowDates.slice(0, 8).map((e: any) =>
        `- ${e.date} — ${e.name}: baixa relevância para este cliente/segmento; só usar se houver ângulo muito claro`).join("\n")
    : "(nenhuma)";

  const successStr = succ.length
    ? succ.filter((p: any) => p.type !== "fingerprint").slice(0, 10)
        .map((p: any) => `${p.type}:${p.value}(${p.success_rate}%)`).join(", ")
    : "(nenhum)";
  const failStr = fail.length
    ? fail.filter((p: any) => p.type !== "fingerprint").slice(0, 10)
        .map((p: any) => `${p.type}:${p.value}`).join(", ")
    : "(nenhum)";
  const recentStr = recent.length
    ? recent.slice(0, 10).map((f: any) => f.title).join("; ")
    : "(nenhum)";

  const contentReqs = company.content_requirements
    ? truncate(company.content_requirements, 1200)
    : "(nenhuma)";

  const addressParts = [company.street, company.number, company.neighborhood, company.city, company.state].filter(Boolean).join(", ");

  const contextText = `=== CLIENTE ===
Nome: ${company.name || "(sem nome)"}${company.fantasy_name ? ` (${company.fantasy_name})` : ""}
Setor/Segmento: ${company.sector || "-"} | Porte: ${company.size || "-"}
Produtos/Serviços: ${truncate(company.products_services, 800) || "-"}
Contato: ${company.corporate_email || company.email || "-"} | ${company.commercial_phone || company.phone || "-"}
${addressParts ? `Endereço: ${addressParts}` : ""}
Marca — cores: primária ${company.brand_primary_color || "-"}, secundária ${company.brand_secondary_color || "-"} | fonte: ${company.brand_font || "-"}
Mascote: ${company.has_mascot ? "sim" : "não"}${company.mascot_description ? ` — ${truncate(company.mascot_description, 300)}` : ""}

=== ESTRATÉGIA GERAL ===
${strategyBlock}

=== DIRETRIZES ESTRATÉGICAS (obrigatórias) ===
${guidelinesBlock}

=== ANAMNESE ESTRATÉGICA ===
${anamneseBlock}

=== PERÍODO ===
Título: ${periodPlan.period_title || "-"}
Datas: ${periodPlan.period_start} → ${periodPlan.period_end}
Objetivo: ${truncate(periodPlan.objective, 600) || "-"}
Canal prioritário (OBRIGATÓRIO em todas as demandas): ${periodPlan.priority_channel || "-"}
Budget: ${periodPlan.budget || "não informado"}
Linha de produção configurada: ${Array.isArray(periodPlan.production_line) ? JSON.stringify(periodPlan.production_line) : "-"}
Observações do operador (respostas do formulário):
${truncate(periodPlan.observations, 3500) || "(nenhuma)"}

=== EXIGÊNCIAS DE CONTEÚDO DO CLIENTE (PRIORIDADE MÁXIMA) ===
${contentReqs}

=== CONTEXTO ADAPTATIVO (últimos ciclos) ===
Datas comemorativas do período: ${calendarStr}
Padrões de sucesso: ${successStr}
Evitar (padrões problemáticos): ${failStr}
Títulos recentes (NÃO repetir): ${recentStr}`;

  return { company, periodPlan, strategyText, questionSession: qsData || null, adaptive, contextText };
}

export function summarizeDefaultPlanForUltra(defaultPlan: any[]): string {
  if (!Array.isArray(defaultPlan) || defaultPlan.length === 0) {
    return "(nenhuma demanda normal foi gerada ainda)";
  }
  return defaultPlan.map((d: any, i: number) => {
    const t = d.titulo || d.title || "(sem título)";
    const tipo = d.tipo || d.demand_type || "-";
    const obj = d.objetivo || d.objective || "";
    const cta = d.cta_recomendado || "";
    const data = d.data_sugerida || d.publish_date || "";
    return `${i + 1}. [${tipo}${data ? ` | ${data}` : ""}] ${t}${obj ? ` — objetivo: ${obj.slice(0, 140)}` : ""}${cta ? ` — CTA: ${cta.slice(0, 80)}` : ""}`;
  }).join("\n").slice(0, 4000);
}
