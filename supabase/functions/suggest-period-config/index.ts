import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHANNEL_WHITELIST = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'];
const OBJETIVOS_WHITELIST = ['Gerar vendas', 'Atrair leads', 'Lançar produto', 'Crescer seguidores', 'Educar o mercado'];

const truncate = (v: unknown, n: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
};

const asBool = (v: any): boolean => v === true || v === 'true' || v === 'sim' || v === 1;

const emptySuggestion = () => ({
  period_title: '',
  period_days: 0,
  start_date: '',
  end_date: '',
  selected_channels: [] as string[],
  bloco_1_objetivo: { objetivosSelecionados: [] as string[], objetivoOutro: '', metaNumerica: '', porqueObjetivo: '' },
  bloco_2_oferta: { produtoFoco: '', temPromocao: false, promocaoDescricao: '', comoComprar: '' },
  bloco_3_contexto: { temDataComemorativa: false, dataComemorativaDescricao: '', temNovidade: false, novidadeDescricao: '' },
  bloco_4_producao: {
    disponibilidadeVideo: '' as '' | 'sim' | 'nao' | 'parcial',
    temMateriaisNovos: false,
    materiaisNovosDescricao: '',
    quantidadeConteudos: 0,
    observations: '',
  },
  production_line: { post_estatico: 0, carrossel: 0, video_captado: 0, video_gerado: 0 },
  canais_estrategicos: [] as { canal: string; prioridade: string; justificativa: string }[],
  sugestao_frequencia: '',
  justificativa_estrategica: '',
  alertas: [] as string[],
  confidence: 'baixa' as 'alta' | 'media' | 'baixa',
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId, companyId, currentForm } = await req.json();
    if (!tenantId || !companyId) throw new Error('tenantId e companyId são obrigatórios');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [companyRes, strategyRes, sessionRes, lastPlansRes, socialRes] = await Promise.all([
      supabase.from('tenant_companies').select('*').eq('id', companyId).eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('strategies').select('strategy_text, company_id, tenant_id')
        .eq('company_id', companyId).eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('question_sessions').select('questions, answers, company_id, tenant_id')
        .eq('company_id', companyId).eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('period_plans')
        .select('period_title, period_start, period_end, priority_channel, objective, production_line, observations')
        .eq('company_id', companyId).eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(3),
      supabase.from('client_social_accounts').select('platform, is_active')
        .eq('company_id', companyId).eq('tenant_id', tenantId),
    ]);

    const company: any = companyRes.data || {};
    const strategyRow: any = strategyRes.data || {};
    const sessionRow: any = sessionRes.data || {};
    const lastPlans: any[] = (lastPlansRes.data as any[]) || [];
    const socials: any[] = (socialRes.data as any[]) || [];

    if (strategyRow?.company_id && strategyRow.company_id !== companyId) {
      throw new Error('Strategy mismatch: company_id do registro não confere');
    }
    if (sessionRow?.company_id && sessionRow.company_id !== companyId) {
      throw new Error('Anamnese mismatch: company_id do registro não confere');
    }

    const strategyText: string = strategyRow?.strategy_text || '';
    const answers: Record<string, string> = (sessionRow?.answers && typeof sessionRow.answers === 'object')
      ? sessionRow.answers : {};
    const questions: string[] = Array.isArray(sessionRow?.questions)
      ? sessionRow.questions.map((q: any) => typeof q === 'string' ? q : (q?.question || String(q)))
      : [];

    const namedGuidelineKeys = ['tone_of_voice', 'content_pillars', 'preferred_ctas', 'forbidden_words', 'active_channels', 'offer_and_ticket', 'main_competitors'];
    const filledNamedGuidelines = namedGuidelineKeys.filter((k) => (answers[k] || '').trim().length > 0);

    const dataAvailability = {
      strategy_len: strategyText.length,
      answers_count: Object.keys(answers).length,
      hasStrategy: strategyText.length > 200,
      hasAnamnese: Object.keys(answers).length >= 5,
      hasNamedGuidelines: filledNamedGuidelines.length >= 2,
      companyId,
      tenantId,
    };
    console.log('[suggest-period-config] dataAvailability', dataAvailability);

    if (!dataAvailability.hasStrategy && !dataAvailability.hasAnamnese) {
      const s = emptySuggestion();
      s.confidence = 'baixa';
      s.alertas = ['Não encontrei anamnese ou estratégia suficiente para uma sugestão personalizada. Preencha a anamnese estratégica e gere a estratégia antes de solicitar sugestões.'];
      s.justificativa_estrategica = 'Sem base de dados do cliente — nenhuma sugestão personalizada foi gerada.';
      return new Response(JSON.stringify({ success: true, suggestion: s, dataAvailability }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const guidelineLabels: Record<string, string> = {
      tone_of_voice: 'Tom de voz',
      content_pillars: 'Pilares de conteúdo',
      preferred_ctas: 'CTAs preferidos',
      forbidden_words: 'Palavras/temas proibidos',
      active_channels: 'Canais ativos hoje',
      offer_and_ticket: 'Oferta principal e ticket médio',
      main_competitors: 'Principais concorrentes',
    };
    const guidelinesBlock = namedGuidelineKeys
      .map((k) => `- ${guidelineLabels[k]}: ${truncate(answers[k] || '', 600) || '(não informado)'}`)
      .join('\n');

    const indexedQA = questions.slice(0, 28).map((q, i) => {
      const a = truncate(answers[`question_${i}`] || '', 300);
      return a ? `${i + 1}. ${truncate(q, 160)} → ${a}` : '';
    }).filter(Boolean).join('\n');

    const lastPlansBlock = lastPlans.map((p, i) => {
      const line = Array.isArray(p.production_line)
        ? p.production_line.map((x: any) => `${x.quantity} ${x.type}`).join(', ')
        : '';
      return `Plano ${i + 1}: "${truncate(p.period_title, 80)}" (${p.period_start} → ${p.period_end}) — objetivo: ${truncate(p.objective, 80)} — canal: ${truncate(p.priority_channel, 60)}${line ? ` — mix: ${line}` : ''}`;
    }).join('\n') || '(sem planos anteriores)';

    const activeSocialChannels = socials
      .filter((s: any) => s?.is_active !== false && s?.platform)
      .map((s: any) => String(s.platform).toLowerCase())
      .filter((p: string) => CHANNEL_WHITELIST.includes(p));

    const currentFormBlock = currentForm ? truncate(JSON.stringify(currentForm), 2500) : '(vazio)';
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `Você é um estrategista de marketing sênior criando uma sugestão de configuração de período de planejamento de conteúdo para UM cliente específico.

REGRAS INVIOLÁVEIS:
1. Proibido usar recomendações genéricas. Cada campo do JSON deve estar amarrado a uma informação real presente na anamnese, estratégia, histórico de planos ou formulário atual. Cite EXPLICITAMENTE a fonte de cada decisão em "justificativa_estrategica" (ex.: "Priorizei Instagram porque a anamnese lista como canal ativo principal.").
2. Proibido INVENTAR promoção, data comemorativa, novidade, produto em foco, concorrente ou meta numérica. Se a informação não existir nos dados fornecidos, deixe o campo vazio (string vazia, false, ou 0) e adicione uma linha em "alertas" explicando o que faltou.
3. Se o usuário já preencheu campos no formulário atual, respeite as escolhas dele (não contradiga).
4. Priorize os canais listados em "Canais ativos hoje" (guideline) e em "Canais ativos no sistema". Nunca sugira um canal fora da whitelist: ${CHANNEL_WHITELIST.join(', ')}. Canais fora da whitelist vão em "alertas" e não em "selected_channels".
5. Se "disponibilidadeVideo" for "nao", "production_line.video_captado" e "production_line.video_gerado" DEVEM ser 0; o volume vai para post_estatico e carrossel.
6. "production_line.post_estatico + carrossel + video_captado + video_gerado" DEVE ser EXATAMENTE igual a "bloco_4_producao.quantidadeConteudos".
7. Confidence:
   - "alta" = estratégia robusta + anamnese completa + diretrizes nomeadas preenchidas.
   - "media" = pelo menos um dos três presente, mas com lacunas.
   - "baixa" = dados insuficientes; sugestão parcial.

Objetivos válidos em "objetivosSelecionados" (use exatamente estes textos): ${OBJETIVOS_WHITELIST.join(', ')}. Qualquer objetivo fora dessa lista vai em "objetivoOutro".
Canais válidos (ids exatos): ${CHANNEL_WHITELIST.join(', ')}.
disponibilidadeVideo: "sim" | "nao" | "parcial" | "".

RESPONDA APENAS JSON VÁLIDO (sem markdown, sem comentários) neste schema exato — todos os campos obrigatórios, use vazio quando não houver dado:

{
  "period_title": string,
  "period_days": number,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "selected_channels": string[],
  "bloco_1_objetivo": { "objetivosSelecionados": string[], "objetivoOutro": string, "metaNumerica": string, "porqueObjetivo": string },
  "bloco_2_oferta": { "produtoFoco": string, "temPromocao": boolean, "promocaoDescricao": string, "comoComprar": string },
  "bloco_3_contexto": { "temDataComemorativa": boolean, "dataComemorativaDescricao": string, "temNovidade": boolean, "novidadeDescricao": string },
  "bloco_4_producao": { "disponibilidadeVideo": "sim"|"nao"|"parcial"|"", "temMateriaisNovos": boolean, "materiaisNovosDescricao": string, "quantidadeConteudos": number, "observations": string },
  "production_line": { "post_estatico": number, "carrossel": number, "video_captado": number, "video_gerado": number },
  "canais_estrategicos": [ { "canal": string, "prioridade": "alta"|"media"|"baixa", "justificativa": string } ],
  "sugestao_frequencia": string,
  "justificativa_estrategica": string,
  "alertas": string[],
  "confidence": "alta"|"media"|"baixa"
}`;

    const userPrompt = `Data de hoje: ${today}

EMPRESA
- Nome: ${truncate(company.name, 120)} (${truncate(company.fantasy_name || '', 120)})
- Setor: ${truncate(company.sector, 120)} | Porte: ${truncate(company.size, 80)}
- Produtos/serviços: ${truncate(company.products_services, 500)}

CANAIS ATIVOS NO SISTEMA (client_social_accounts): ${activeSocialChannels.join(', ') || '(nenhum)'}

ESTRATÉGIA GLOBAL DO CLIENTE
${truncate(strategyText, 3500) || '(não definida)'}

DIRETRIZES ESTRATÉGICAS PARA IA (respostas nomeadas da anamnese)
${guidelinesBlock}

RESPOSTAS INDEXADAS DA ANAMNESE
${indexedQA || '(sem respostas)'}

HISTÓRICO DE PLANOS RECENTES
${lastPlansBlock}

FORMULÁRIO ATUAL DO USUÁRIO (respeite o que já foi preenchido)
${currentFormBlock}

Gere a sugestão estritamente amarrada aos dados acima, no schema JSON definido.`;

    const { data: apiKeyData, error: apiKeyErr } = await supabase
      .from('api_keys').select('key_value').eq('key_name', 'OPENAI_API_KEY').single();
    if (apiKeyErr || !apiKeyData) throw new Error('OPENAI_API_KEY não configurada em Dev → APIs');

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(apiKeyData as any).key_value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 6000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('[suggest-period-config] OpenAI error', aiResponse.status, errText.slice(0, 400));
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite da OpenAI excedido. Tente novamente em instantes.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Erro ao gerar sugestão com OpenAI');
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData?.choices?.[0]?.message?.content || '{}';
    const finishReason = aiData?.choices?.[0]?.finish_reason;
    let parsed: any = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const m = rawContent.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    // Normalize
    const suggestion = emptySuggestion();
    const alertas: string[] = Array.isArray(parsed.alertas)
      ? parsed.alertas.filter((x: any) => typeof x === 'string')
      : [];

    if (finishReason === 'length') {
      alertas.push('Resposta da IA foi truncada — alguns campos podem estar incompletos.');
    }

    suggestion.period_title = typeof parsed.period_title === 'string' ? parsed.period_title.trim() : '';
    suggestion.period_days = Number(parsed.period_days) > 0 ? Math.floor(Number(parsed.period_days)) : 0;
    suggestion.start_date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.start_date || '') ? parsed.start_date : '';
    suggestion.end_date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.end_date || '') ? parsed.end_date : '';

    // Channels whitelist
    const rawChans = Array.isArray(parsed.selected_channels) ? parsed.selected_channels : [];
    const cleanChans: string[] = [];
    for (const c of rawChans) {
      const id = String(c || '').toLowerCase().trim();
      if (CHANNEL_WHITELIST.includes(id)) {
        if (!cleanChans.includes(id)) cleanChans.push(id);
      } else if (id) {
        alertas.push(`Canal "${id}" fora da whitelist e ignorado (permitidos: ${CHANNEL_WHITELIST.join(', ')}).`);
      }
    }
    const activeFromAnamnese = String(answers.active_channels || '').toLowerCase();
    const preferred = new Set<string>([
      ...activeSocialChannels,
      ...CHANNEL_WHITELIST.filter((c) => activeFromAnamnese.includes(c)),
    ]);
    cleanChans.sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)));
    suggestion.selected_channels = cleanChans;

    // Bloco 1
    const b1 = parsed.bloco_1_objetivo || {};
    const objsIn: string[] = Array.isArray(b1.objetivosSelecionados) ? b1.objetivosSelecionados : [];
    suggestion.bloco_1_objetivo.objetivosSelecionados = objsIn.filter((o: string) => OBJETIVOS_WHITELIST.includes(o));
    const outros = objsIn.filter((o: string) => !OBJETIVOS_WHITELIST.includes(o));
    suggestion.bloco_1_objetivo.objetivoOutro = (typeof b1.objetivoOutro === 'string' && b1.objetivoOutro.trim())
      ? b1.objetivoOutro.trim()
      : outros.join(', ');
    suggestion.bloco_1_objetivo.metaNumerica = typeof b1.metaNumerica === 'string' ? b1.metaNumerica.trim() : '';
    suggestion.bloco_1_objetivo.porqueObjetivo = typeof b1.porqueObjetivo === 'string' ? b1.porqueObjetivo.trim() : '';

    // Bloco 2 (no invention)
    const b2 = parsed.bloco_2_oferta || {};
    suggestion.bloco_2_oferta.produtoFoco = typeof b2.produtoFoco === 'string' ? b2.produtoFoco.trim() : '';
    const temPromo = asBool(b2.temPromocao);
    const promoDesc = typeof b2.promocaoDescricao === 'string' ? b2.promocaoDescricao.trim() : '';
    if (temPromo && !promoDesc) {
      suggestion.bloco_2_oferta.temPromocao = false;
      alertas.push('IA marcou "temPromocao=true" sem descrição real — campo zerado para não inventar promoção.');
    } else {
      suggestion.bloco_2_oferta.temPromocao = temPromo;
      suggestion.bloco_2_oferta.promocaoDescricao = promoDesc;
    }
    suggestion.bloco_2_oferta.comoComprar = typeof b2.comoComprar === 'string' ? b2.comoComprar.trim() : '';

    // Bloco 3
    const b3 = parsed.bloco_3_contexto || {};
    const temData = asBool(b3.temDataComemorativa);
    const dataDesc = typeof b3.dataComemorativaDescricao === 'string' ? b3.dataComemorativaDescricao.trim() : '';
    if (temData && !dataDesc) {
      suggestion.bloco_3_contexto.temDataComemorativa = false;
      alertas.push('IA marcou "temDataComemorativa=true" sem descrição — campo zerado para não inventar data.');
    } else {
      suggestion.bloco_3_contexto.temDataComemorativa = temData;
      suggestion.bloco_3_contexto.dataComemorativaDescricao = dataDesc;
    }
    const temNov = asBool(b3.temNovidade);
    const novDesc = typeof b3.novidadeDescricao === 'string' ? b3.novidadeDescricao.trim() : '';
    if (temNov && !novDesc) {
      suggestion.bloco_3_contexto.temNovidade = false;
      alertas.push('IA marcou "temNovidade=true" sem descrição — campo zerado para não inventar novidade.');
    } else {
      suggestion.bloco_3_contexto.temNovidade = temNov;
      suggestion.bloco_3_contexto.novidadeDescricao = novDesc;
    }

    // Bloco 4
    const b4 = parsed.bloco_4_producao || {};
    const dv = String(b4.disponibilidadeVideo || '').toLowerCase();
    suggestion.bloco_4_producao.disponibilidadeVideo = (['sim', 'nao', 'parcial'].includes(dv) ? dv : '') as any;
    suggestion.bloco_4_producao.temMateriaisNovos = asBool(b4.temMateriaisNovos);
    suggestion.bloco_4_producao.materiaisNovosDescricao = typeof b4.materiaisNovosDescricao === 'string' ? b4.materiaisNovosDescricao.trim() : '';
    if (suggestion.bloco_4_producao.temMateriaisNovos && !suggestion.bloco_4_producao.materiaisNovosDescricao) {
      suggestion.bloco_4_producao.temMateriaisNovos = false;
      alertas.push('IA marcou "temMateriaisNovos=true" sem descrição — campo zerado.');
    }
    let qtd = Number(b4.quantidadeConteudos);
    if (!Number.isFinite(qtd) || qtd <= 0) qtd = 10;
    qtd = Math.max(1, Math.min(50, Math.floor(qtd)));
    suggestion.bloco_4_producao.quantidadeConteudos = qtd;
    suggestion.bloco_4_producao.observations = typeof b4.observations === 'string' ? b4.observations.trim() : '';

    // production_line: enforce sum and video rules
    const pl = parsed.production_line || {};
    let post = Math.max(0, Math.floor(Number(pl.post_estatico) || 0));
    let carr = Math.max(0, Math.floor(Number(pl.carrossel) || 0));
    let vcap = Math.max(0, Math.floor(Number(pl.video_captado) || 0));
    let vger = Math.max(0, Math.floor(Number(pl.video_gerado) || 0));

    if (suggestion.bloco_4_producao.disponibilidadeVideo === 'nao' && (vcap > 0 || vger > 0)) {
      alertas.push('disponibilidadeVideo="nao": vídeos redistribuídos para post estático e carrossel.');
      post += vcap + vger;
      vcap = 0; vger = 0;
    }
    let sum = post + carr + vcap + vger;
    if (sum === 0) {
      if (suggestion.bloco_4_producao.disponibilidadeVideo === 'nao') {
        post = Math.round(qtd / 2); carr = qtd - post;
      } else {
        post = Math.round(qtd * 0.4);
        vger = Math.round(qtd * 0.2);
        carr = qtd - post - vger;
      }
      sum = post + carr + vcap + vger;
    }
    if (sum !== qtd) {
      const parts = [
        { key: 'post_estatico', v: post },
        { key: 'carrossel', v: carr },
        { key: 'video_captado', v: vcap },
        { key: 'video_gerado', v: vger },
      ];
      const scaled = parts.map((p) => ({ key: p.key, v: Math.floor((p.v / sum) * qtd) }));
      let scaledSum = scaled.reduce((s, x) => s + x.v, 0);
      let guard = 0;
      while (scaledSum < qtd && guard < 200) {
        const pool = suggestion.bloco_4_producao.disponibilidadeVideo === 'nao'
          ? scaled.filter((x) => x.key === 'post_estatico' || x.key === 'carrossel')
          : scaled;
        pool.sort((a, b) => b.v - a.v);
        pool[0].v += 1;
        scaledSum += 1;
        guard++;
      }
      while (scaledSum > qtd && guard < 400) {
        scaled.sort((a, b) => b.v - a.v);
        if (scaled[0].v > 0) { scaled[0].v -= 1; scaledSum -= 1; }
        guard++;
      }
      post = scaled.find((x) => x.key === 'post_estatico')!.v;
      carr = scaled.find((x) => x.key === 'carrossel')!.v;
      vcap = scaled.find((x) => x.key === 'video_captado')!.v;
      vger = scaled.find((x) => x.key === 'video_gerado')!.v;
    }
    suggestion.production_line = { post_estatico: post, carrossel: carr, video_captado: vcap, video_gerado: vger };

    // Canais estratégicos
    const canaisEst = Array.isArray(parsed.canais_estrategicos) ? parsed.canais_estrategicos : [];
    suggestion.canais_estrategicos = canaisEst
      .map((c: any) => ({
        canal: String(c?.canal || '').toLowerCase().trim(),
        prioridade: ['alta', 'media', 'baixa'].includes(String(c?.prioridade || '').toLowerCase())
          ? String(c.prioridade).toLowerCase() : 'media',
        justificativa: typeof c?.justificativa === 'string' ? c.justificativa.trim() : '',
      }))
      .filter((c: any) => CHANNEL_WHITELIST.includes(c.canal));

    suggestion.sugestao_frequencia = typeof parsed.sugestao_frequencia === 'string' ? parsed.sugestao_frequencia.trim() : '';
    suggestion.justificativa_estrategica = typeof parsed.justificativa_estrategica === 'string'
      ? parsed.justificativa_estrategica.trim()
      : (typeof parsed.justificativa === 'string' ? parsed.justificativa.trim() : '');

    // Confidence
    let confidence: 'alta' | 'media' | 'baixa' = 'baixa';
    if (['alta', 'media', 'baixa'].includes(String(parsed.confidence))) {
      confidence = parsed.confidence;
    } else if (dataAvailability.hasStrategy && dataAvailability.hasAnamnese && dataAvailability.hasNamedGuidelines) {
      confidence = 'alta';
    } else if (dataAvailability.hasStrategy || dataAvailability.hasAnamnese) {
      confidence = 'media';
    }
    suggestion.confidence = confidence;
    suggestion.alertas = alertas;

    return new Response(JSON.stringify({ success: true, suggestion, dataAvailability }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[suggest-period-config] error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
