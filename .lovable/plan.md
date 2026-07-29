## O que confirmei nos dados e no código

- No banco, a reorganização da coluna da Lúcia **ficou contígua** a partir de agora (14:50 → 16:10 sem buracos). O problema é de **leitura**: os cards intermediários estão em outros agrupamentos (Em revisão / Avaliar), então "Hoje" parece começar às 16:10.
- O badge "em andamento" usa `isTopCard = index === 0` (`KanbanCentralPage.tsx`): marca o primeiro card da lista de produção mesmo que o horário dele ainda não tenha chegado.
- Os agrupamentos "Em revisão", "Aguardando clientes" e "Avaliar" **não têm sort por data/hora** — por isso 17:30 aparece acima de 14:50.
- Ordem de render atual: Avaliar → Aguardando clientes → Em revisão. O pedido é o inverso.

## O que vou fazer

### 1. Ordenar todos os agrupamentos cronologicamente
Aplicar o mesmo critério da lista principal (data de início + hora, fallback entrega) em Em revisão, Aguardando clientes e Avaliar. Sem data vai para o fim.

### 2. Corrigir a ordem dos agrupamentos
Renderizar na ordem **Em revisão → Aguardando clientes → Avaliar**, na coluna normal e nas sub-colunas do modo foco.

### 3. Rótulo "em andamento" pelo card mais atrasado
Regra, considerando todos os cards ativos do colaborador (produção + revisão + avaliar; fora aguardando cliente e publicações agendadas):

1. Entre os cards **cujo início (data + hora) já passou**, o "em andamento" é o **mais antigo** — ou seja, o mais atrasado vence, inclusive se for de ontem ou de semanas atrás.
2. Empate no mesmo horário: desempata pela prioridade **Produção → Revisão → Avaliar**.
3. Se nenhum card já começou, marca-se o **próximo a começar** como "próximo" e nenhum card fica "em andamento".
4. O card seguinte na fila recebe **"próximo"**.

Consequência natural: "Em revisão" só terá o "em andamento" quando não houver card de produção já iniciado (produção vazia ou só com datas futuras) e a revisão tiver data/hora já alcançada.

**Captação continua como está**: card `captar` com horário chegado sobe ao topo absoluto e o card que seria o atual exibe "pausado para captação" — esse rótulo tem precedência sobre "em andamento"/"próximo".

### 4. Prioridade da reorganização de sequência
A reorganização passa a alocar horários nesta ordem:
1. **Produção**
2. **Em revisão**
3. **Avaliar** — sempre por último na fila do dia
4. **Aguardando clientes** — **excluído** do cálculo: não consome tempo e não recebe horário novo.
Publicações já agendadas continuam fora do cálculo, e cards `captar` continuam com horário protegido.

### 5. Prévia do modal de reorganização
Mostrar a linha do tempo em ordem cronológica com etiqueta de origem por card (Produção / Revisão / Avaliar), para ficar claro por que o próximo card de "Hoje" começa mais tarde.

## Arquivos envolvidos

- `src/pages/KanbanCentralPage.tsx` — ordenação dos agrupamentos, ordem de render, cálculo de "em andamento"/"próximo" preservando a pausa por captação.
- `src/components/KanbanCard.tsx` — suporte ao rótulo "próximo".
- `src/lib/reorderSequence.ts` — prioridade produção → revisão → avaliar; exclusão dos cards em `aguardando_cliente`.
- `src/components/kanban/ReorderSequenceModal.tsx` — etiqueta de origem e ordem cronológica na prévia.

Sem mudanças de banco.

## Resultado esperado

Agrupamentos em ordem cronológica e na ordem pedida (Revisar → Aguardando clientes → Avaliar), "em andamento" sempre no card mais atrasado que já deveria estar sendo feito (com "próximo" logo em seguida e a pausa por captação preservada), e reorganização priorizando produção, depois revisão, com Avaliar por último e ignorando cards que estão com o cliente.
