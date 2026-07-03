
# Investigação: tags/tipos de demanda (Planejar → Demanda → Fluxo)

## 1. Origem das tags

- Função: `edge function generate-period-plans` (`supabase/functions/generate-period-plans/index.ts`).
- Linhas 277–325: existe uma "linha de produção fixa" com 3 tipos hard-coded:
  - `Post Estático` (4)
  - `Vídeos Curtos` (2)
  - `Carrossel` (4)
- A geração é feita em **batches**, passando `batchType` no request. O prompt instrui a IA: `O campo "tipo" de CADA demanda DEVE ser exatamente "${batchType}"`.
- Linha 459: após a resposta, o código força `tipo: batchType` quando em modo batch. Fora do modo batch, aceita texto livre da IA (`d.tipo || d.demand_type || ''`).
- **Conclusão**: em teoria a tag vem do sistema (batchType) e é sempre uma das 3 strings acima. Na prática o histórico do banco mostra que **não é o caso**.

Tipos reais encontrados hoje em `demands.demand_type` (via SELECT DISTINCT):
- `Post Estático` (17), `Carrossel` (13), `Post` (4)
- `Carrossel (5 slides)`, `Carrossel (4 slides)`, `Carrossel educativo`, `Carrossel informativo`, `carrossel institucional / prova social`, `carrossel educativo` (minúsculo)
- `Reel / TikTok — Storytelling cliente real`, `Reels / TikTok — utilitário (Carnaval)`, `Vídeo Comercial (60s)`, `Vídeo Curto (Reel)`, `Vídeo curto / Reel (30–45s) + PDF complementar`, `video curto (reel/TikTok)`, `Vídeo depoimento`, `Vídeo informativo (60s) — teaser do feirão`, `video rápido / dicas (TikTok)`, `video (autoridade)`
- `Stories`, `Tutorial rápido`, `case summary (anônimo) — PDF`, `Outro`, `Post + Stories (oferta ponderada)`, etc.
- `NULL` em 110 demandas.

Ou seja: **há risco real** de a IA (fora do batch) ou execuções antigas gravarem qualquer string, com acento, caixa e sufixos variados.

## 2. Onde a tag fica salva

- `period_plans.default_plan` (JSONB, array de demandas geradas pelo modo Normal). Campo dentro do objeto: `tipo`. Ex.: `{ "tipo": "Post Estático", "titulo": "...", ... }`. Texto livre vindo da IA.
- `period_plans.ultra_plan` (JSONB, mesmo shape, gerado no modo Ultra).
- `period_plans.final_plan` (JSONB) = merge de default + ultra na etapa final.
- `demands.demand_type` (TEXT). Recebe o valor `tipo` no momento em que o card é aprovado e virado demanda. Também usado em criação manual e em `demand_fingerprints.demand_type`.
- Nenhum campo padronizado (enum, FK, key). Nenhuma tabela de tipos.

## 3. Conversão card → demanda

- `src/pages/ApproveCards.tsx` linha 218: `const tipo = card.tipo || card.tipo_conteudo || card.type || null;` — depois grava `demand_type: tipo` (linha 240). Cópia direta, sem normalização.
- `src/pages/PlanPeriod.tsx` linha 528–550: mesma lógica ao materializar do plano.
- `src/pages/RejectedCards.tsx` linha 374: idem.
- Não há fallback além de `null`. Não há mapeamento. Não distingue Normal vs Ultra (ambos usam o mesmo campo `tipo`).
- Portanto: `Carrossel`, `Post Estático` e `Vídeos Curtos` chegam quando o batch respeitou o prompt, mas variações de IA (ex.: `Carrossel (5 slides)`, `Reel / TikTok`) passam intactas.

## 4. Usos atuais de demand_type / tipo / tipo_conteudo

- `src/lib/proceedDemand.ts` — `normalizeDemandTypeKey()`: já faz normalização por substring (`carrossel`, `captad`, `gerad+vídeo`, `reel/tiktok/vídeo`, `estát/post/stories/imagem`, `anúncio`) para os 5 keys de `demand_type_flow_rules`. Fallback: `criativo_estatico`. Quebra: só quebra se vier `null` ou string vazia.
- `src/components/TaskCard.tsx` — usa `demand_type` para exibir e passa para `proceedDemand`.
- `src/components/FunctionPermissionsModal.tsx` — CRUD em `demand_type_flow_rules` com keys fixos (`criativo_estatico`, `carrossel`, `video_captado`, `video_gerado`, `anuncio`).
- `supabase/functions/auto-generate-post/index.ts` (l.59): `.toLowerCase().includes("post")/("estát")` — decide se dispara imagem estática.
- `supabase/functions/auto-generate-carousel/index.ts` (l.113): `.includes("carrossel")` — decide se dispara carrossel.
- `supabase/functions/generate-post-image/index.ts` + `_shared/aspect.ts`: infere aspect ratio a partir do texto (`reel/vídeo` → 9:16, `carrossel` → 1:1, etc.).
- `src/lib/createScheduleDispatch.ts`: infere `content_type` de dispatch a partir de `demand_type` + título.
- `src/pages/Home.tsx`, `KanbanCentralPage.tsx`, `CronogramaGlobal.tsx`, `CompletedDemands.tsx`, `CollaboratorDemands.tsx`, `PeriodClientList.tsx`, `RejectedCards.tsx`, `ContentHistory.tsx`: apenas exibem `demand_type` como badge/texto.
- `demand_fingerprints.demand_type`: só para dedup, aceita qualquer string.

Toda a lógica de decisão (proceedDemand, auto-generate-post, auto-generate-carousel, aspect, dispatch) hoje depende de **substring/toLowerCase** — funciona por sorte com variações, mas quebra silenciosamente em casos como `Post + Stories`, `case summary`, `Outro`, ou `NULL`.

## 5. Relação com o fluxo (botão Prosseguir)

- Chave usada para casar com `demand_type_flow_rules`: **`demand_type_key` fixo** (`criativo_estatico`, `carrossel`, `video_captado`, `video_gerado`, `anuncio`).
- Hoje esse key é derivado **em runtime** por `normalizeDemandTypeKey(demand_type)`.
- `demand_type` como texto **não é confiável**: 110 demandas com `NULL`, muitas com strings compostas, IA pode inventar tipos novos, não há validação.
- Faltam também `video_captado` vs `video_gerado`: a heurística atual manda quase tudo (`Reels`, `Vídeo`, `TikTok`) para `video_captado`. Não há sinal na IA que distinga os dois.
- Recomendação forte: introduzir campo técnico `demand_type_key` em `demands`, gravado no momento da aprovação, e manter `demand_type` como rótulo visual.

## 6. Perguntas críticas — respostas objetivas

- Lista oficial de tipos hoje? **Não** como catálogo; existe implicitamente em `demand_type_flow_rules` (5 keys) e no seed do `FunctionPermissionsModal`.
- Tabela dedicada? **Não** (só `demand_type_flow_rules`, que é "regras por tipo", não "catálogo de tipos").
- Normalização? **Só** em `proceedDemand.ts` (runtime, best-effort).
- Validação? **Não**.
- IA pode inventar tipo novo? **Sim**, especialmente fora do modo batch (Ultra e execuções antigas).
- Normal e Ultra usam o mesmo padrão? Ambos gravam em `tipo`, mas Ultra **não** é forçado ao batchType (linha 459 só normaliza quando `batchType` está presente, e o planType=`ultra` gera 3 livres). Portanto Ultra é a principal fonte de ruído.
- `demand_type` é confiável para Prosseguir? **Não** — funciona na maioria por causa da heurística, mas há casos que caem em fallback errado ou em `null`.
- Menor ajuste seguro? Adicionar `demand_type_key` em `demands` + normalizar no ponto de conversão (Approve/PlanPeriod/Reject) + backfill dos existentes.

## 7. Estratégia recomendada (sem implementar agora)

1. **Criar tabela catálogo** `demand_types` (por tenant ou global):
   - `type_key` (PK textual: `criativo_estatico`, `carrossel`, `video_captado`, `video_gerado`, `anuncio`).
   - `name` (rótulo visual).
   - `aliases` (text[] — ex.: `["post estático","post","imagem","stories"]`).
   - `active` (bool).
   - Seed inicial com os 5 keys existentes + aliases cobrindo o histórico.

2. **Adicionar coluna `demand_type_key` em `demands`** (texto, nullable, indexada). Manter `demand_type` como rótulo visual/texto livre.

3. **Função de normalização única** (`normalizeDemandTypeKey`) alimentada pelos aliases do catálogo. Aplicar:
   - Ao gravar demanda em ApproveCards / PlanPeriod / RejectedCards / CreateDemandModal.
   - No edge `generate-period-plans` já forçar `type_key` no objeto salvo em `default_plan`/`ultra_plan` (não só em `tipo`).
   - Fallback determinístico: `criativo_estatico` quando não bate nada, com log/console.

4. **Ultra plan**: passar `batchType` também no modo Ultra, ou forçar `type_key` via normalização no retorno. Elimina o vetor "IA inventa tipo".

5. **Backfill** dos ~65 registros com `demand_type` preenchido: rodar normalização e gravar `demand_type_key`. Os 110 com `NULL` recebem `criativo_estatico` como fallback conservador (ou ficam nulos e o Prosseguir pede que o usuário defina o tipo).

6. **Prosseguir**: `proceedDemand` passa a ler `demands.demand_type_key` diretamente; só usa a normalização como fallback quando o campo estiver vazio.

7. **UI**: onde hoje mostra `demand_type` (badges), continuar mostrando o texto visual; opcionalmente derivar do catálogo (`demand_types.name` via `type_key`) para uniformizar.

8. **Auto-generate / aspect / dispatch**: migrar as decisões (auto-post vs auto-carousel, aspect ratio, content_type) para `demand_type_key`, eliminando as heurísticas por substring.

### Riscos e mitigação

- Não quebra cards antigos: normalização + fallback garantem `type_key` para tudo.
- Não altera contrato do card no `default_plan/ultra_plan` já salvo — só adiciona `type_key` ao lado do `tipo`.
- Reversível: o campo `demand_type` continua existindo como texto.

## Próximo passo

Se aprovado, os passos concretos serão: (a) migration criando `demand_types` + coluna `demands.demand_type_key` + índice + seed + backfill; (b) refactor de `normalizeDemandTypeKey` para consultar o catálogo; (c) atualizar pontos de gravação e o `proceedDemand`; (d) opcionalmente migrar auto-generate e aspect. Nada disso será feito nesta rodada.
