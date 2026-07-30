## Diagnóstico (verificado no código)

1. **Os horários se movem sozinhos.** Em `ReorderSequenceModal.tsx` (linhas 125-143) o `useEffect` que chama `computeReorder` tem `cards` nas dependências, e `KanbanCentralPage.tsx` (linha 3383) passa `cards={cards.filter(...)}` — um **array novo em cada render**. Cada re-render do Kanban (realtime, tick de relógio de 60s, hover/estado) recalcula tudo, e `computeReorder` usa `spNowVirtualUtc()` internamente (linha 584) — ou seja, um **"agora" novo a cada recálculo**. Resultado: a proposta que mostrava 13:50 vira 13:55, 14:00… sem o usuário fazer nada. Foi exatamente o que aconteceu entre os dois prints: 13:50 → 14:05 no primeiro, 13:55 → 14:10 no segundo.

2. **"Ao clicar em ajustar vira 13:50".** O botão Ajustar preenche o rascunho com `p.startISO/p.startTime` do render corrente (linha 393). Como o recálculo acontece no mesmo instante do clique, o input fica com o valor **antigo** (13:50) enquanto a linha já exibe o novo (13:55). Não é um cálculo diferente — é a mesma deriva do item 1 aparecendo em dois lugares.

3. **"Fim 14h vira 14:05".** O primeiro card ("Templates personalizados", 28/07 14:35 → 30/07 14:00) está atrasado/em andamento, então o motor o reinicia "agora" com a duração estimada da etapa (15min), gerando 13:50 → 14:05. O fim original de hoje às 14:00 é descartado mesmo estando a poucos minutos de distância.

## O que será feito

### 1. Congelar o instante de cálculo (correção principal)
- `ReorderSequenceModal.tsx`: criar um `startFrom` fixado **uma vez por abertura do modal** (state definido quando `open` passa a true, limpo ao fechar) e passá-lo para `computeReorder` via `opts.startFrom` (parâmetro que já existe).
- Estabilizar as dependências do efeito: usar uma assinatura estável dos cards (ids + due/delivery + função + área, via `useMemo`/JSON) em vez do array, e memoizar `workHours`/`durations`/`areaSchedule` por conteúdo. Assim o recálculo só acontece quando algo relevante muda de fato, não a cada render do Kanban.
- Adicionar um botão discreto **"Recalcular (agora HH:mm)"** no cabeçalho do modal, para quando o usuário quiser propositalmente atualizar a base de tempo. O modal também passa a exibir o horário-base usado ("base: 13:51").

### 2. Rascunho do "Ajustar" sempre coerente
- Ao abrir o Ajustar, ler o valor da proposta corrente já estável (com o `startFrom` congelado o valor deixa de mudar); e se a proposta daquele card mudar enquanto o editor está aberto sem ajuste manual aplicado, o rascunho é ressincronizado em vez de manter número velho.

### 3. Preservar o fim do card em andamento quando ele ainda é viável
- `reorderSequence.ts`: para o **primeiro card da fila** que já está em execução (início no passado) e cujo fim original ainda está no futuro e comporta a duração restante a partir de agora, manter o **fim original** em vez de recalcular `agora + duração`. No exemplo: 13:51 → fim 14:00 permanece 14:00, e a folga de 30% não é inflada para além do prazo já combinado.
- Se o fim original já passou (card realmente atrasado), o comportamento atual continua: reinicia agora com duração + folga.

## Detalhes técnicos
- Sem mudanças de banco e sem alteração na gravação (`due_date/due_time/delivery_date/delivery_time` + lock otimista seguem iguais).
- `computeReorder` mantém a assinatura; só passa a receber `startFrom` do modal e ganha a regra de preservação do fim do card em andamento.
- Ajustes manuais (`manualOverrides`) continuam com precedência total e recálculo em cascata dos seguintes.
