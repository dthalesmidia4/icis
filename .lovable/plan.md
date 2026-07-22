# Pesquisa de tendências para Demandas Ultra (aprovado)

## Confirmação técnica
- OpenAI **Responses API** (`/v1/responses`) com `tools: [{ type: "web_search" }]`, `tool_choice: "auto"`, usando a `OPENAI_API_KEY` já em `api_keys`.
- Chat Completions **só** como fallback (sem web search, marca `research_mode: "inferred"`).
- Zero migration. Cache no `period_plans.form_draft.ultra_research` via **merge** (jamais sobrescrever `form_draft`).
- Só toca no pipeline Ultra.

## Arquivos

**Novo — `supabase/functions/_shared/ultra-trend-research.ts`**
- Exporta `researchUltraTrends(input)` e `formatResearchForPrompt(result)`.
- Monta 4–6 queries dinâmicas a partir de segmento, produtos/serviços, região, canal prioritário, objetivo do período, datas de alta prioridade já ranqueadas, snippet de estratégia e trechos da anamnese.
- Primeira tentativa: Responses API + `web_search` (timeout 45s, sem retry — o próprio fallback é o "retry").
- Fallback: mesma `gpt-5-mini` via Chat Completions + `response_format: json_object`, marcando `research_mode: "inferred"`.
- Retorna objeto no formato pedido: `research_mode`, `niche`, `queries_used`, `trend_summary`, `relevant_trends[]` (com `priority: alta|media|baixa`), `irrelevant_or_weak_trends[]`, `recommended_angles_for_ultra[]`, `generated_at`.
- Curadoria é feita pelo próprio prompt de pesquisa; a Ultra recebe só tendências curadas.
- Falha total nunca lança — devolve `research_mode: "inferred"` vazio com `error`.

**Editado — `supabase/functions/generate-ultra-demands/index.ts`**
1. Carregar `OPENAI_API_KEY` (já feito).
2. Antes do loop de geração:
   - Ler `periodPlan.form_draft?.ultra_research`.
   - Se existir e `generated_at < 24h` e `body.refreshResearch !== true`, reutilizar.
   - Caso contrário, chamar `researchUltraTrends({ openaiApiKey, company, periodPlan, strategySnippet, topAnamneseSnippets, highPriorityDates })`.
   - Persistir com **merge seguro**: `form_draft: { ...(periodPlan.form_draft || {}), ultra_research: research }`.
3. Injetar `formatResearchForPrompt(research)` como nova seção do `systemPrompt`, antes do `antiRepetitionSection`.
4. Estender `jsonInstruction` para exigir os campos extras por item Ultra:
   - `tendencia_usada`, `insight_de_pesquisa`, `fonte_ou_contexto`, `por_que_e_relevante_para_o_cliente`.
   - Preservar todos os campos atuais (`conceito_ultra`, `por_que_e_ultra`, `evidencias_usadas`, `anti_repeticao`, `tipo`, `type_key`, `titulo`, `objetivo`, `conteudo`, `instrucoes_de_producao`, `legenda`, `cta_recomendado`, `canal`, `data_sugerida`).
   - Regra explícita: proibido "vídeos curtos porque estão em alta" — tendência precisa virar ideia própria do cliente amarrada a dor/objeção/posicionamento.
   - Se `research_mode = "inferred"` ou `relevant_trends` vazio, `tendencia_usada` pode ficar `""` — mas o item ainda precisa passar no filtro anti-genericidade existente.
5. Mapeamento pós-parse: preservar os quatro campos novos verbatim (defaults `""`), sem tocar nos existentes.
6. Resposta ganha campo extra `research: { mode, trend_count }` para observabilidade. Contrato principal (`success`, `planType`, `plan`, `summary`) intacto.

**Nenhum outro arquivo alterado.** `_shared/models.ts` fica como está (a URL do Responses vive dentro do helper novo, isolada, para não impactar outros callers).

## Cache — merge seguro (crítico)
```ts
const nextDraft = { ...(periodPlan.form_draft || {}), ultra_research: research };
await admin.from("period_plans").update({ form_draft: nextDraft }).eq("id", periodPlanId);
```
Nunca `update({ form_draft: { ultra_research: ... } })`.

## Segurança
- `verify_jwt` já ativo; `requireTenantAndPlanAccess` mantém validação de user + tenant + `period_plan_id` + `company_id`.
- OpenAI key só server-side.
- 1 chamada de pesquisa por geração Ultra (não por demanda).
- Timeout 45s, sem loop de retry; fallback direto para `inferred`.
- Cache 24h por `period_plan_id`; `refreshResearch: true` força atualização.

## Como as Ultras ficam menos genéricas
1. Prompt Ultra recebe tendências reais **curadas** com `priority`, motivo, oportunidade e cuidado.
2. Cada Ultra tem que preencher `tendencia_usada` + `insight_de_pesquisa` + `por_que_e_relevante_para_o_cliente`, ancorando em evidência externa em vez de frase pronta.
3. Bloco de tendências fracas e ângulos recomendados guia a curadoria criativa antes do JSON.
4. Filtro anti-genericidade e anti-repetição vs plano normal continuam ativos e obrigatórios — tendência não substitui, soma.
5. Fallback inferido preserva o fluxo mesmo com API instável.

## Teste manual pós-implementação
Cliente de nicho claro (ex.: clínica veterinária) em agosto:
1. Rodar Normais → depois Ultra.
2. Log deve mostrar `research.mode = "openai_web_search"`, 4–6 queries.
3. Cada Ultra traz `tendencia_usada` e `insight_de_pesquisa` distintos e coerentes.
4. Regerar Ultra sem `refreshResearch` reaproveita cache (sem chamar Responses de novo).
5. Simular falha (chave inválida) → cai em `inferred` e Ultra ainda é gerada.
