## Diagnóstico

### 1. Badge "pausado por captação" não aparece no card do Eric
Na coluna do Eric o grupo "CAPTAÇÃO · AGORA" contém o card de captação, e logo abaixo o card "Templates personalizados" está com horário que **cruza a janela da captação (28/07 14:35 → 30/07 14:00 vs. 29/07 08:00 → 30/07 10:00)**. Ele deveria aparecer como "pausado para captação", mas não aparece.

Causa raiz confirmada em `src/pages/KanbanCentralPage.tsx` (linhas 2637–2720):
- `runningIndex` é incrementado para **todos** os cards, inclusive os do pseudo-grupo `__captar_now__`.
- Depois da última correção, `isPausedByCaptarNow` exige `isTopCard` (`index === 0`). Como o card de captação recebe `index 0`, o primeiro card real da coluna (não-captar) fica com `index 1` e não é marcado como pausado.
- Na coluna da Letícia, coincidentemente, existe apenas 1 card na captação e 1 no "Hoje", e o próximo da fila acaba sendo o primeiro do grupo "Hoje" que é `index 1`, mas a versão anterior sem o filtro `isTopCard` mostrava para todos — foi por isso que "funcionava" antes.

### 2. Bloqueio/aviso ao lançar demanda fora da janela de área configurada
Estado atual, confirmado em `src/lib/areaConflicts.ts` (linhas 41–112):
- `findAreaConflicts` **só compara com outras demandas do mesmo dia em áreas diferentes**. Não consulta `user_area_schedules`.
- Em `src/components/TaskCard.tsx` (linhas 1017–1062), `warnAreaConflict` é chamado **apenas** no `handlePublishDateChange`. Não é chamado quando muda `delivery_date`, `delivery_time`, `due_time` nem responsável, e não roda no formulário de criação.
- Ou seja: hoje, se Letícia tem `user_area_schedules` com a tarde como `sistemas`, um card de `midia` cujo horário termina 14:15 (dentro da faixa `sistemas`) **não gera aviso nem bloqueio** — a menos que exista outra demanda `sistemas` no mesmo dia. É essa a lacuna descrita pelo usuário.

## Correções

### 1. Corrigir o "topo" da coluna para o badge de pausa — `src/pages/KanbanCentralPage.tsx`
Ao redor da linha 2637 e 2701–2725:
- Introduzir um contador auxiliar `nonCaptarIndex` (começa em -1) que só é incrementado quando `!isCaptarNow`.
- Trocar a condição atual `isTopCard = index === 0` (no contexto da pausa) por `isTopNonCaptar = nonCaptarIndex === 0`.
- Manter `isTopCard` original para o rótulo "em andamento" (esse deve continuar restrito ao primeiríssimo card da coluna, incluindo o de captação — comportamento atual desejado).

Resultado: com a captação ativa, o **primeiro card não-captar** da coluna vira "pausado por captação", mesmo que outros cards do topo (da captação) já tenham consumido `runningIndex`.

### 2. Checagem contra `user_area_schedules`

#### 2.a. Estender `src/lib/areaConflicts.ts`
Adicionar uma função nova `findScheduleAreaConflict` que recebe `{ tenantId, userId, area, date, startTime, endTime }`:
1. Deriva `weekday` de `date` (0–6).
2. Lê de `user_area_schedules` **todas** as linhas do usuário para aquele `weekday`.
3. Se o usuário não tem nenhuma linha configurada → retorna `null` (sem opinião, mantém comportamento atual).
4. Se a janela `[startTime..endTime]` do card:
   - Cai **inteiramente** dentro de uma faixa da **mesma** `area` → OK, sem alerta.
   - Cai **inteiramente** dentro de uma faixa de **outra** área → `hard: true` (bloqueio duro, como o `hardConflict` atual).
   - **Cruza** a fronteira (parte dentro da área correta, parte na outra) → `soft: true` (toast de aviso).
   - Está fora de qualquer faixa configurada → `soft: true` com mensagem "fora da janela configurada".

Retornar `{ hard, soft, reason, offendingArea, offendingWindow }`.

#### 2.b. Chamar no `TaskCard`
- Atualizar `warnAreaConflict` em `src/components/TaskCard.tsx` (linha 1018) para também considerar `delivery_time` (não só `publish_time`) e chamar `findScheduleAreaConflict` além de `findAreaConflicts`.
- Disparar em três handlers, não só um:
  - `handlePublishDateChange` (já existe)
  - `handlePublishTimeChange` (linha 1065)
  - `handleDeliveryDateChange` / `handleDeliveryTimeChange` (localizar e adicionar; hoje não têm gatilho).
- Quando `hard=true` da checagem de schedule → reaproveitar o `AlertDialog` de `hardConflict` já existente, adicionando `reason: "schedule"` para exibir a mensagem correta ("Este horário está dentro da janela configurada de {Sistemas} para este responsável.").
- Quando `soft=true` → `toast.warning` com o motivo.

#### 2.c. Chamar na criação de demanda
Localizar o formulário de criação (a partir de `demands.insert`) para disparar a mesma checagem antes de gravar. Se `hard=true`, mostrar `AlertDialog` bloqueando o "Salvar" até o usuário mudar o horário/responsável/área. Se `soft=true`, apenas `toast.warning` e permitir salvar.

### Fora de escopo
- Não altero políticas de RLS ou o schema (`user_area_schedules` já existe).
- Não mexo em `reorderSequence.ts` — o reorganizador já respeita `user_area_schedules`.
- Não altero rotinas do dispatcher/publicação.

## Como validar depois
1. Coluna Eric: com captação ativa, o "Templates personalizados" passa a mostrar o chip "⏸ Pausado HH:mm · captação".
2. Criar/editar um card `midia` para Letícia com `delivery_time = 14:15` numa segunda-feira em que a tarde dela está configurada como `sistemas`:
   - Se a janela ficar 100% em sistemas → `AlertDialog` bloqueia.
   - Se cruzar (ex. início 13:30 mídia, fim 14:15 já em sistemas) → toast de aviso.
