## 1. Reorganização automática — contagem inflada e horários pulando para 16h+

### Diagnóstico (verificado no código)

O modal `ReorderSequenceModal` recebe **todos** os cards da lista `cards` de `KanbanCentralPage.tsx` filtrando apenas por `assigned_to === reorderModalColumnId` (ou `additional_assignees`). Porém `cards` inclui:

- Cards **arquivados** (`fetchAllCards` busca `archived_at IS NOT NULL` também).
- Cards em **`publicar_agendado`** (aqueles com dispatch ativo, hoje escondidos da coluna e movidos para "Agendamentos" — mas ainda vivem no state `cards`).
- Cards em `aguardando_cliente`, `captar` e diários.

Consequências:

1. **Toast diz "34" em vez de "16"**: a Lúcia enxerga 16 cards ativos, mas o modal reagenda também arquivados e agendados que continuam com `assigned_to` dela → `changed=true` para todos, inflando o número.
2. **Horários vão para 16h+**: em `reorderSequence.ts`, cards de `aguardando_cliente`/`captar`/`daily` viram intervalos "blocked" (linhas 601–606). Quando esses cards têm `due_date` no passado com `delivery_date` distante (típico de "aguardando cliente" antigo), o intervalo bloqueado engole o expediente atual e o `skipBlocked` empurra o cursor de 11h para depois do fim do bloqueio — só então começam os cards ativos. O código não descarta bloqueios cujo `end < now`.

### Correções

**A) `src/pages/KanbanCentralPage.tsx` (props do `ReorderSequenceModal`)**
- Ao montar a lista `cards={…}`, filtrar também:
  - `!c.isArchived`
  - `!(c.current_function_key === "publicar" && activeDispatchIds.has(c.id))` — cards com dispatch ativo já saíram da coluna operacional.
- Passar `activeDispatchIds` para o filtro (o hook `useActiveDispatchIds` já é usado na página; se ainda não estiver, importar).

**B) `src/lib/reorderSequence.ts` (função `computeReorder`)**
- Ao construir a lista `blocked` (linhas 594–606), descartar qualquer intervalo com `end <= now` (não bloqueiam mais o cursor).
- Para `aguardando_cliente` cujo `due_date` seja anterior a hoje mas `delivery_date` seja futuro (ex.: aguardando resposta há dias), truncar `start` para `now` antes de adicionar em `blocked` — o bloqueio só existe no futuro. Isso evita que o cursor pule para o "delivery_date" quando o bloqueio na verdade começou no passado.
- Não alterar o comportamento de `captar` futuro (permanece fixo).

**C) Consistência do toast**
- Nada a mudar em `ReorderSequenceModal.tsx`: com as correções acima, `changedCount` refletirá apenas os cards realmente visíveis/ativos da coluna. O texto continua "N cards reorganizados".

---

## 2. Tela "Evolução das Demandas" — separar "Publicar agendado" dos "Em andamento"

Hoje, quando `stageKey === "publicar"` e há dispatch ativo, `displayStageName` vira "Publicar agendado" (linha 342 de `ClientEvolution.tsx`), mas o card ainda é contado em `inProgress` e ordenado junto com "em andamento".

### Alterações em `src/pages/ClientEvolution.tsx`

**a) Classificação:** adicionar campo `isScheduledPublish: boolean` em `Classified` (true quando `stageKey === "publicar" && activeDispatchIds.has(card.id)` e não `isDone`).

**b) Summary:** novo contador `scheduledPublish`; `inProgress` passa a excluir esses cards:
```
inProgress = total − done − queued − scheduledPublish
```

**c) Barra de progresso** (linhas 490–498): renderizar dois segmentos empilhados:
- Segmento emerald (`bg-emerald-500`) com `width = done/total`.
- Segmento sky (`bg-sky-500`) logo em seguida com `width = scheduledPublish/total` — indica "pronto, aguardando publicação".
- Rótulo: `{done}/{total} · {progressPct}% concluído · +{scheduledPublish} agendado` (só mostra o "+N agendado" quando > 0).

**d) Chips de filtro** (linhas 502–513): adicionar novo `CounterChip` "Publicar agendado" com tone `sky`, entre "Em andamento" e "Concluídas". Filtro `scheduled_publish` que só mostra esses cards. Atualizar tipo `Filter`.

**e) Ordem na timeline** (função `rank`, linha 375): usar 3 níveis → `hasStage && !scheduled = 0`, `scheduled = 1`, `queued = 2`, `done = 3`. Assim os "publicar agendado" ficam agrupados **abaixo dos em andamento e acima dos concluídos**, sem poluir a fila de pendências. `filter === "in_progress"` NÃO inclui esses cards.

**f) Rótulo de estágio:** mantém "Publicar agendado" (já existe). Aplicar cor `text-sky-600 dark:text-sky-400` na célula da coluna Etapa quando `isScheduledPublish`.

Sem alterações no schema nem em edge functions.

## Detalhes técnicos

- `activeDispatchIds` já é retornado pelo hook `useActiveDispatchIds(tenantId)` e usado em ambas as telas — reaproveitar.
- `reorderSequence.ts`: a truncagem de `start` para `now` deve ocorrer com `spNowVirtualUtc(wh.tz)` já calculado (variável `now` local à função) para permanecer em wallclock BRT.
- Progress bar dupla: usar flex container com dois `<div>` filhos, ou um `<div>` empilhado com `background: linear-gradient` de duas paradas — a versão em dois filhos com `width` é mais legível e testável.
