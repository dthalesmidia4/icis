# Diagnóstico + Melhorias do Reorganizador (Mídia × Sistemas + Captar)

## 1. O que aconteceu (com evidência de DB)

Consultei os cards dos dois prints. Fatos:

- **Nenhum** card tem `client_wait_started_at`/`client_resend_count>0`. Não foi retorno do "Aguardando cliente" — o cron às 15h nem entrou em ação.
- Todos os cards da Lúcia foram gravados em **28/07 ~17:51 BRT** (updated_at). Isso é assinatura de execução do **Reorganizador** (manual ou automático) rodada ontem à tarde.
- Todos são `work_area = midia`.

Sobreposição real observada no print 1:
```
SESMAP (enviar_cliente)   28/07 13:30 → 29/07 14:30
Pneus (revisar)           28/07 16:55 → 29/07 17:00
RAIO-X (enviar_cliente)   28/07 17:25 → 29/07 17:30
...
```
O SESMAP termina 29/07 14:30 mas os cards seguintes começam 28/07 16:55. Isso viola a regra "cursor = fim do card anterior + 5min".

### Causa raiz (com trecho do código)
`computeReorder` (`src/lib/reorderSequence.ts`) trata o **primeiro card ativo com deadline vencido** como "stuck":

```ts
if (treatAsStuck && card.due_date && card.due_time) {
  const originalStart = toVirtualUtc(card.due_date, card.due_time.slice(0,5));
  dur = baseDur + delayMin + slack;         // atraso + 30%
  ({ start, end } = allocateAcrossDays(originalStart, dur, area, ctx));
```
Ou seja, o **primeiro card** é recolocado **no seu due original** e ganha duração inflada (baseDur + minutos úteis de atraso + 30%). Para o SESMAP:
- baseDur (enviar_cliente) = 5 min
- delayMin ≈ minutos úteis entre 28/07 13:30 e "agora do reorder"
- resultado: start 28/07 13:30, end ~ dia seguinte

Só que **`cursors[cursorKey]` do card stuck é atualizado para `end + 5min` (29/07 14:35)**, e então os próximos cards deveriam começar dali. Só que não começam — começam em 28/07 16:55+. **Isso só é explicado se o reorganizador foi rodado em lotes separados** (ex.: modal de reordenar aplicado por sub-agrupamento — Em Revisão vs Aguardando Clientes vs coluna principal — cada execução recalculando com "agora" como base). Cada lote gera sua própria timeline e todos convivem sobrepostos no card da Lúcia.

Além disso, no print 2 (Eric) o SmartVety (sistemas, `planejar`) foi alocado 28/07 14:35→04/08 14:35 e o Hospital Leal (mídia, `captar`) foi mantido fixo 29/07 08:00→30/07 10:00 — os dois **coexistem sobrepostos porque cursores de Mídia e Sistemas são independentes**.

**Não foi bug de "Aguardando cliente".** Foi combinação de:
1. Cursores separados por área (mídia × sistemas) não conversam.
2. Cards fixos (Captar, Daily, Aguardando) são **skipped mas não bloqueiam** o cursor — o alocador aloca "por cima" deles.
3. Reorder aplicado em subconjuntos (sub-agrupamentos filtrados) gera timelines independentes que se sobrepõem quando somadas na coluna.

## 2. Como o reorganizador deve se comportar

### R1. Cursor único por responsável, respeitando expediente da área do card
Trocar o dicionário `cursors[area]` por um **único cursor por responsável**. Ao alocar o próximo card, aplicar os blocos de expediente da **área daquele card específico**. Assim Mídia e Sistemas nunca produzem horários sobrepostos no mesmo colaborador.

### R2. Cards fixos ocupam a agenda (não só são skipped)
Antes do laço de alocação, montar uma lista de **intervalos ocupados** com todos os cards `captar`, `is_daily_card` e `aguardando_cliente` do responsável (usando due/delivery atuais). O `allocateAcrossDays` passa a subtrair esses intervalos dos blocos disponíveis. Efeito: o reorganizador contorna os Captar/Daily em vez de agendar por cima.

### R3. Prioridade de Captar quando o horário chega
Regra visual + de ordenação (não move horário do Captar):
- Se `now ≥ captar.due_datetime` e o captar ainda não foi entregue, o card sobe para o **topo da coluna do responsável** — acima de qualquer não-captar em andamento.
- No reorganizador, ao encontrar essa condição, os cards não-captar cujo intervalo colidiria com o Captar iminente são **empurrados** para depois do fim do Captar (aplicação natural da R2).

### R4. Card "stuck" não pode gerar cauda infinita
Limitar a inflação por atraso do primeiro card:
- `dur = min(baseDur + delayMin*0.5 + slack30%, workingMinutesInDay(area) * 2)`
- Se o card stuck vazar para o dia seguinte, o cursor do responsável começa dali (já está correto). O que falta é a **regra R5**.

### R5. Reorganizar sempre o conjunto completo do responsável
Hoje o modal permite reordenar por sub-agrupamento (Em Revisão, Aguardando Clientes, coluna principal), e cada execução parte do "agora". Mudar para: **sempre computar a timeline considerando todos os cards ativos do responsável em todas as áreas**, e só aplicar diffs aos IDs realmente selecionados. Isso mata a sobreposição vista no print 1.

### R6. Sinalização visual de "área alterna" na coluna
Quando um card de Sistemas aparece entre dois de Mídia (ou vice-versa), pintar uma faixa lateral com a cor da área. É apenas UX — deixa claro por que o horário "pula" (bloco de outra área ocupou o intervalo).

## 3. Escopo técnico

Arquivos:
- `src/lib/reorderSequence.ts`
  - Refatorar `computeReorder` para cursor único por responsável + lista de intervalos bloqueados.
  - Nova função `buildBlockedIntervals(fixedCards, ctx)` retornando `Array<{ start: Date; end: Date }>`.
  - `allocateAcrossDays` recebe `blocked` e trata cada intervalo como buraco no bloco do dia.
  - Ajustar cálculo de `treatAsStuck` (R4).
- `src/components/kanban/ReorderSequenceModal.tsx` (e chamadores)
  - Sempre buscar **todos** os cards ativos do responsável para o cálculo, mesmo quando o modal foi aberto em um sub-agrupamento; passar `selectedIds` para restringir só o commit.
- `src/pages/KanbanCentralPage.tsx`
  - Ordenação da coluna: aplicar boost de prioridade para Captar quando `now ≥ due` (R3).
  - Faixa lateral de área (R6) — mudança visual isolada.

Sem mudanças em edge functions, sem migração de DB. Sem alteração da lógica de "Aguardando cliente" (o cron continua respeitando `wait_hours`).

## 4. Backfill dos cards do print 1

Depois do fix, expor botão "Reorganizar coluna" na Lúcia e rodar uma vez para colapsar a timeline. Alternativamente, script one-off que rechama `computeReorder` para os responsáveis afetados (Lúcia, Eric) e aplica as datas — decidir na hora de implementar.

## 5. Fora deste plano (registro)
- Investigar por que o reorder foi disparado às 17:51 BRT com múltiplos lotes: pode ter sido o usuário clicando "Reorganizar" em cada sub-agrupamento. Se confirmado depois do fix, a R5 já resolve.
- Não mexer no cron `return-awaiting-client-cards` — os prints não mostram retorno; ele está configurado corretamente para 15h.
