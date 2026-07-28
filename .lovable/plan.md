## Problema

No subtítulo dos cards do Kanban Central hoje aparece `clientName · statusName`, onde `statusName` vem de `pipeline_statuses.name` (o status do pipeline, ex.: "Planejamento"). Esse valor não reflete a **etapa/função operacional atual** do card, que é o que o usuário espera ver — o card da Letícia mostra "Planejamento" no subtítulo, mas ao abrir a etapa real é "Criar arte" (`current_function_key = "criar_arte"`).

Ou seja, estamos exibindo o status do pipeline no lugar da função do fluxo.

## Correção

Substituir a origem do texto de etapa exibido após o nome do cliente pelo **rótulo da função operacional atual** (`current_function_key` → `flow_functions.name`), mantendo o fallback para o nome do status do pipeline quando a função não estiver definida.

### Passos

1. Em `KanbanCentralPage.tsx`:
   - Carregar uma vez (e reagir ao realtime já existente de `flow_functions`) um `Map<function_key, name>` do tenant a partir de `flow_functions` (`select function_key, name`).
   - Criar um helper local `resolveStageLabel(card)` que retorna:
     - `flowFunctionNames.get(card.current_function_key)` se existir; ou
     - o `name` do `FUNCTIONS` fallback hardcoded (mesma lista já usada em `FunctionPermissionsModal`) para chaves conhecidas mesmo antes do fetch; ou
     - `card.status` (pipeline status) como último fallback.
   - Passar esse valor no prop `statusName` das três instâncias de `<KanbanCard>` (linhas ~2533, ~2675, ~2752). Nada muda em `KanbanCard.tsx` — ele continua exibindo `subtitle · statusName`.

2. Não mexer em `pipeline_statuses` nem em nenhuma outra tela; a alteração é puramente de apresentação no Kanban Central.

### Detalhes técnicos

- `flow_functions` já é assinado em `useRealtimeFlowConfig`, então basta invalidar/recarregar o mapa no mesmo `onChange` que já dispara o refetch principal — nenhuma nova subscription.
- Para casos como `aguardando_cliente` e agrupamento "Em Revisão", o rótulo resolvido continua correto (mostrará "Aguardando cliente" / "Revisar" etc.), o que é mais informativo que "Planejamento".
- Sem mudanças de schema, sem edge functions, sem impacto em drag-and-drop ou filtros.

## Fora de escopo

- Renomear o prop `statusName` do `KanbanCard` (manteremos por compatibilidade).
- Alterar o TaskCard interno / outros lugares onde o status do pipeline ainda é útil.