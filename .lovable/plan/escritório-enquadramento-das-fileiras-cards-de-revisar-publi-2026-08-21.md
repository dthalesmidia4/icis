# Escritório: enquadramento das fileiras + cards de "Revisar publicação" fora da fila até a data

## 1. Estações não devem invadir a parede

Hoje a fileira do fundo é posicionada em 40% da altura, mas o monitor e o personagem são desenhados **acima** da base da mesa. Com isso o card do monitor sobe para dentro da faixa da parede (20%) e a cena fica com informação empilhada sobre janelas/quadro.

- Recuar o início da faixa de mesas para abaixo da parede considerando a altura do que fica em cima do tampo (monitor + personagem), em vez de encostar a base logo na parede.
- Aliviar a decoração da parede na área que fica atrás das estações do fundo (menos elementos concorrendo com os cards), mantendo janelas e piso.

## 2. Espaço gigante entre a fileira de cima e a de baixo

Com poucas mesas (ex.: 4 = 2 fileiras) as fileiras são jogadas para os extremos da faixa (topo e base), criando um vazio enorme no meio, exatamente como nas imagens enviadas.

- Passar a usar um **passo fixo por fileira** (distância constante entre fileiras) em vez de distribuir as fileiras nos extremos da faixa disponível.
- Centralizar verticalmente o conjunto de fileiras na área útil da sala: com 1–2 fileiras o ambiente fica compacto e equilibrado; com 3+ fileiras o passo é comprimido para caber sem estourar a base.
- Manter escala de profundidade (fundo menor, frente maior), jitter determinístico e o modo mobile empilhado inalterados.

## 3. "Revisar publicação" só aparece a partir da data de publicação

Regra: o card em `revisar_publicacao` já está agendado, mas ainda não foi conferido. Antes da data de publicação ele não deve poluir a coluna do usuário nem entrar em nenhuma contagem; quando a data chega, ele aparece normalmente para o usuário conferir e prosseguir para "Entregar".

- Criar um predicado único (junto do helper canônico de publicação agendada): card em `revisar_publicacao` está **fora do board** enquanto a data de publicação for futura; no dia da publicação (e depois) volta a ser um card normal.
- Aplicar esse mesmo predicado em todos os pontos que hoje já escondem/descontam publicação agendada:
  - Visão Geral (cards, agrupamentos, reordenação, busca)
  - contagem por colaborador (o número que aparece no Kanban, na alocação em massa e no texto "+N com publicação agendada")
  - Escritório virtual (monitor, pilha de papéis e badge da fila)
- Sem publicação definida, o card continua visível como hoje (nada desaparece por falta de data).
- Nada é alterado no banco: é apenas visibilidade e contagem.

## Detalhes técnicos

- `src/lib/officeLayout.ts`: `computeDeskSlots` passa a usar passo fixo por fileira + centralização vertical; nova faixa superior calculada com folga para o monitor.
- `src/components/office/OfficeWorld.tsx`: redução da decoração de parede atrás da primeira fileira.
- `src/lib/scheduledPublishStage.ts`: nova função `isPendingScheduledReview(row, today)` e inclusão em `isOutOfOperationalBoard`.
- `src/lib/operationalCount.ts`: `countOperationalDemands` passa a receber a data de referência e classificar esses cards como agendados.
- `src/hooks/useOfficeOverview.ts` e `src/pages/KanbanCentralPage.tsx`: consumo do novo predicado.
