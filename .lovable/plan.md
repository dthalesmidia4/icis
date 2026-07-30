## Diagnóstico (confirmado no código)

No agrupamento por data da coluna do colaborador (`src/pages/KanbanCentralPage.tsx`, bloco que monta os `groups`/`entries`):

- Um card que **começou em um dia anterior e ainda está em curso** é jogado para o grupo de "Hoje" (`start < hoje && end >= hoje → key = hoje`).
- Mas a ordenação **dentro do grupo** compara apenas a hora do dia: `a.due_time` vs `b.due_time`.

Resultado no print: "Templates personalizados" (início **28/07 14:35**) perde para "Correção de Bug" (início **30/07 14:00**), porque 14:00 < 14:35 — a data é ignorada. Por isso o card "em andamento" (detectado corretamente pelo timestamp completo em `startTsOf`) aparece abaixo do "próximo".

## Correção

Alinhar a ordenação do grupo com a mesma chave usada na detecção de "em andamento": **data + hora completas**.

1. No comparador de cada grupo (`entries`), trocar a comparação de `due_time`/`delivery_time` por uma chave `YYYY-MM-DDTHH:MM` montada com `due_date + due_time` (modo "start") ou `delivery_date + delivery_time` (modo "delivery"). Cards sem data/hora vão para o fim.
2. Manter o boost de `captar` já existente (prioridade de captação ativa continua acima).
3. Aplicar a mesma chave completa na ordenação dos sub-agrupamentos "Em revisão" e "Aguardando clientes" (`startKeyOf` já usa data+hora — apenas confirmar consistência, sem mudança de comportamento).

Efeito: o card mais antigo em andamento passa a ficar em primeiro no grupo "Hoje", e o rótulo "em andamento" volta a coincidir com a posição visual no topo.

## Detalhes técnicos
- Arquivo único: `src/pages/KanbanCentralPage.tsx`, apenas no comparador de ordenação (nenhuma mudança de dados, banco ou fluxo).
