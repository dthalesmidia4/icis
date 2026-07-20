## Problema

O **Modo Foco** (`/colaboradores/:userId`) mostra 22 demandas para a Lúcia, enquanto a **Visão Geral** mostra 13 (2 padrão + 2 aguardando + 9 revisão). A diferença são os cards com **despacho ativo** (agendamentos), que a Visão Geral esconde via `useActiveDispatchIds`, mas o Modo Foco não.

## Correção

Aplicar o mesmo filtro do Kanban Central no `CollaboratorDemands.tsx`:

1. Importar `useActiveDispatchIds` de `@/hooks/useActiveDispatchIds`.
2. Chamar o hook com o `tenantId`.
3. Filtrar `cards` removendo `activeDispatchIds.has(card.id)` antes do sort/agrupamento.

Assim a contagem total, o agrupamento de "Aguardando clientes" e "Em revisão" e a lista principal ficam idênticos ao que aparece na coluna da Lúcia na Visão Geral (2 padrão + 2 aguardando + 9 revisão).

Nenhuma outra tela é afetada.
