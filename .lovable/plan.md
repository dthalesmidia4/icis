## Problema
No agrupamento por data das colunas da Visão Geral, cards com **início no passado** (ex.: `due_date = 28/07`) mas **término hoje ou futuro** (`delivery_date ≥ hoje`) aparecem sob "Ontem" (ou datas mais antigas) quando o modo de agrupamento é por data de início. Eles estão **em andamento hoje** e deveriam cair no grupo "Hoje".

## Correção proposta
Em `src/pages/KanbanCentralPage.tsx`, na montagem da chave de agrupamento (`const key = ...` por volta da linha 2594), tratar cards em andamento como "hoje":

- Quando `dateGroupBy === "start"`:
  - Calcular `todayISO` uma vez antes do loop.
  - Se `c.due_date < todayISO` **e** `(c.delivery_date ?? c.due_date) >= todayISO`, usar `todayISO` como chave em vez de `c.due_date`.
  - Caso contrário, mantém `c.due_date` (comportamento atual).
- Quando `dateGroupBy === "delivery"`: nenhuma mudança — já agrupa pelo término.

Isso é uma alteração isolada dentro do bloco de agrupamento; a ordenação interna do grupo continua usando `due_time`/`delivery_time` como hoje.

## Efeito esperado
- Card "SESMAP · VÍDEO REGULARIZAÇÃO..." (Ini 28/07, Fim 29/07) — hoje é 29/07 → passa de "Ontem" para "Hoje".
- Cards com início e término no passado (entregas atrasadas ainda não movidas) continuam em seus dias reais (ex.: "Ontem", "19/06"), pois `delivery_date < hoje`.
- Cards sem `delivery_date` seguem a data de início.

## Fora do escopo
- Não altero o modo "por término", o boost de captação, os pseudo-grupos "Captação · agora", nem a ordenação.
- Não mudo rótulos de estágio nem lógica de pausa.