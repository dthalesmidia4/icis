## Objetivo
Corrigir a sugestão automática do Planejar Período para ser realmente personalizada por cliente, respeitar o formulário preenchido, nunca inventar dados, preencher todos os blocos, **e** aplicar a `production_line` sugerida ao estado do formulário para que seja persistida em `period_plans`.

## 1. Guard de dados e logs seguros — `supabase/functions/suggest-period-config/index.ts`

- Filtro duplo `.eq('company_id', companyId).eq('tenant_id', tenantId)` em `strategies`, `question_sessions`, `period_plans`, `client_social_accounts`, `tenant_companies`.
- Assertivas anti cross-tenant: se `row.company_id !== companyId` na estratégia ou sessão → abortar.
- Flags: `strategy_len`, `answers_count`, `hasStrategy` (>200), `hasAnamnese` (≥5), `hasNamedGuidelines` (≥2 dos 7 campos nomeados).
- Log seguro: só `{companyId, tenantId, strategy_len, answers_count, hasStrategy, hasAnamnese, hasNamedGuidelines}`. **Nunca** logar estratégia inteira ou respostas.
- Se `!hasStrategy && !hasAnamnese`: retorna `confidence:"baixa"` + alerta "Não encontrei anamnese ou estratégia suficiente para uma sugestão personalizada." SEM chamar OpenAI. Devolve `dataAvailability` no payload.

## 2. Prompt reforçado — mesma edge

- Diretrizes nomeadas até 600 chars cada; QA indexada até 28 perguntas × 300 chars; estratégia truncada em 3500; `currentForm` em 2500; `activeSocialChannels` de `client_social_accounts.is_active`.
- Regras invioláveis no system prompt:
  1. Proibido genérico — citar fonte em `justificativa_estrategica`.
  2. Proibido inventar promoção, data comemorativa, novidade, produto em foco, concorrente, meta numérica. Sem fonte → vazio + `alertas`.
  3. Respeitar `currentForm`.
  4. Canais só da whitelist (`instagram|facebook|tiktok|youtube|linkedin`); fora da lista → `alertas`, nunca em `selected_channels`. Priorizar `active_channels` e `client_social_accounts`.
  5. Se `disponibilidadeVideo === "nao"` → `video_captado`+`video_gerado`=0.
  6. `production_line` soma == `bloco_4_producao.quantidadeConteudos`.
  7. `confidence`: alta/média/baixa conforme flags.
- Modelo `openai/gpt-5-mini` (mantido). `response_format: json_object`. `max_completion_tokens: 6000`. `finish_reason === 'length'` → alerta.

## 3. Contrato JSON + normalização servidor-side

Schema exato:
```ts
{
  period_title, period_days, start_date, end_date,
  selected_channels: string[],
  bloco_1_objetivo: { objetivosSelecionados, objetivoOutro, metaNumerica, porqueObjetivo },
  bloco_2_oferta: { produtoFoco, temPromocao, promocaoDescricao, comoComprar },
  bloco_3_contexto: { temDataComemorativa, dataComemorativaDescricao, temNovidade, novidadeDescricao },
  bloco_4_producao: { disponibilidadeVideo, temMateriaisNovos, materiaisNovosDescricao, quantidadeConteudos, observations },
  production_line: { post_estatico, carrossel, video_captado, video_gerado },
  canais_estrategicos: [{ canal, prioridade, justificativa }],
  sugestao_frequencia, justificativa_estrategica,
  alertas, confidence
}
```

Normalizações pós-parse:
- Canais fora whitelist → alertas.
- Objetivos fora whitelist → `objetivoOutro`.
- Flags booleanas `true` sem descrição → zeradas + alerta.
- `disponibilidadeVideo` restrito a `sim|nao|parcial|""`.
- `quantidadeConteudos` clamp 1..50.
- `production_line`: se `disponibilidadeVideo === "nao"`, redistribui vídeos para post/carrossel; sempre escala proporcional para soma == `quantidadeConteudos`.
- `confidence` derivado quando IA omitir.

## 4. `PlanPeriod.tsx` — `productionLine` vira estado real (não visual)

**Refatoração-chave:** substituir o `useMemo productionLine` (linhas 147–167) por `useState<{type:string; quantity:number}[]>`. A distribuição segue essa ordem:

1. Estado inicial: `[{type:'Post Estático',quantity:4},{type:'Vídeos Curtos',quantity:2},{type:'Carrossel',quantity:4}]` (proporção 4:2:4 = 10 conteúdos).
2. `useEffect([quantidadeConteudos, disponibilidadeVideo])` — recalcula automaticamente APENAS quando o usuário não aplicou uma sugestão customizada (flag `productionLineOverridden` booleano). Quando `disponibilidadeVideo === 'nao'`, zera "Vídeos Curtos" e usa proporção 5:0:5 (post/carrossel) escalada para `quantidadeConteudos`. Caso contrário, mantém 4:2:4 escalada.
3. `applySuggestion` seta `productionLine` diretamente a partir de `s.production_line`, agregando `video_captado + video_gerado` no bucket `Vídeos Curtos` (o schema salvo em `period_plans` tem 3 buckets: Post Estático / Vídeos Curtos / Carrossel), e marca `productionLineOverridden = true` para o `useEffect` parar de sobrescrever.
4. Também expor um botão pequeno "Recalcular pelos padrões" no bloco de linha de produção (linha ~1190) que reseta `productionLineOverridden` para `false` (opcional; só se a UI atual ficar confusa).

Persistência (linha 687) já usa `productionLine` filtrada — nenhuma mudança extra necessária ali; agora o mix sugerido chega até `period_plans.production_line` naturalmente.

Regra 5 do usuário garantida em dois níveis: (a) na edge (normalização) e (b) no `useEffect` do front (fallback quando o usuário mudar `disponibilidadeVideo` depois de aplicar).

## 5. `applySuggestion` — respeitar campos preenchidos manualmente

Helpers:
- `setIfEmptyStr(current, setter, value)` — só seta se `!current.trim() && value.trim()`.
- `setIfEmptyArr(current, setter, arr)` — só seta se `current.length === 0`.
- Selects (`temPromocao`, `temDataComemorativa`, `temNovidade`, `temMateriaisNovos`) — só seta se `current === ''`.
- Datas — só se `undefined`.
- `quantidadeConteudos` — só se ainda no default 10.

Aplicações:
- Título; datas (fallback: hoje + `period_days`).
- `selected_channels` (interseção CHANNEL_IDS).
- `bloco_1_objetivo` (objetivosSelecionados, objetivoOutro, metaNumerica, porqueObjetivo).
- `bloco_2_oferta` (produtoFoco, temPromocao, promocaoDescricao, comoComprar).
- `bloco_3_contexto` (todos 4 campos).
- `bloco_4_producao`: `disponibilidadeVideo` (`parcial → talvez`), `temMateriaisNovos`, `materiaisNovosDescricao`, `quantidadeConteudos`, `observations`.
- `production_line` (agregado em 3 buckets, com `productionLineOverridden = true`).

Retrocompat: aceitar campos antigos (`canais_sugeridos`, `objetivos_sugeridos`, `quantidade_conteudos`, `produto_foco`, `distribuicao`) como fallback.

Toasts:
- Sem estratégia E sem anamnese: toast forte "Sem dados suficientes — preencha anamnese e estratégia primeiro."
- Com alertas: toast neutro "Sugestão aplicada com N alertas — revise antes de gerar."

## 6. Card de sugestão

- Badge de `confidence` (verde/âmbar/vermelho).
- Bloco amarelo com `alertas` (ícone AlertTriangle).
- Preview: título, período, quantidade, `selected_channels`, `canais_estrategicos` com prioridade, `production_line` (post/carrossel/vídeo captado/vídeo gerado), objetivos, `sugestao_frequencia`, `justificativa_estrategica` em destaque.
- Botão "Aplicar sugestão":
  - **Desabilitado apenas quando** `dataAvailability.hasStrategy === false && dataAvailability.hasAnamnese === false`.
  - Confidence baixa/média com base parcial: habilitado + aviso forte acima ("Sugestão baseada em dados parciais — revise cada bloco antes de aplicar.").
- "Ignorar" e "Gerar outra" mantidos.

## 7. Validação obrigatória (regra 10)

Após build, via `supabase--curl_edge_functions` chamar `suggest-period-config` com dois `companyId` distintos do mesmo tenant e conferir:
- `period_title`, `bloco_1_objetivo.objetivosSelecionados`, `selected_channels` DIFEREM.
- `justificativa_estrategica` cita elementos reais da anamnese/estratégia de cada cliente.
- `production_line` soma == `bloco_4_producao.quantidadeConteudos`.
- Blocos preenchidos quando `confidence !== 'baixa'`.
- Logs no Supabase só mostram flags/tamanhos.

## Escopo negativo
- Sem migration.
- Sem alterar `generate-period-plans`.
- Sem alterar Kanban, cards, publicação ou agendamento.
- Sem trocar de modelo.

## Arquivos alterados
- `supabase/functions/suggest-period-config/index.ts` — reescrita (guard, prompt, schema, normalização).
- `src/pages/PlanPeriod.tsx` — `productionLine` vira `useState` + `useEffect` com flag `productionLineOverridden`; `applySuggestion` expandido com helpers "só se vazio" e aplicação real da `production_line`; card de sugestão redesenhado com confidence, alertas, blocos e regra de desabilitar Aplicar.
