
# Integrar Evolução das Demandas na Visão Geral

Adicionar um ponto de entrada global no header da Visão Geral, ao lado de "Conteúdos agendados", que abre um seletor rápido de cliente e leva à tela `/client-evolution` já existente.

## 1. Botão no header

- Em `src/pages/KanbanCentralPage.tsx`, no mesmo bloco de ações do header onde ficam "Conteúdos agendados" e "Nova demanda", adicionar um novo botão discreto: **"Evolução das demandas"** com ícone `Activity` (mesmo usado no Client Hub).
- Estilo `variant="outline"`, `size="sm"`, mesmo padrão visual dos vizinhos, sem badge numérico.

## 2. Popover de seleção de cliente

Ao clicar no botão, abrir um `Popover` (shadcn) com:
- Campo de busca no topo (`Input` + filtro client-side por nome/fantasy_name).
- Lista compacta de clientes que têm demandas ativas no momento (derivada do `demands` já carregado na Visão Geral — evita nova query).
- Cada item mostra: nome do cliente + contagem pequena "N ativas".
- Ordenação por nome de exibição.
- Clique no item: salva o cliente em `sessionStorage` via `useSelectedClient().setSelectedClient(client)` e navega para `/client-evolution`.

Para popular o cliente completo (id, name, fantasy_name, tenant_id, cores), reaproveitar o mesmo mapa de clientes já usado no header/filtros da Visão Geral (`clientsMap` / lista de clientes carregada). Se algum campo não estiver no mapa, buscar o registro em `clients` no clique (fallback único).

## 3. Comportamento e volta

- A tela `/client-evolution` já lê `selectedClient` do contexto — não precisa mudar nada lá.
- Botão "Voltar" da Evolução continua funcionando (retorna à origem via `navigate(-1)` já existente).
- Se o usuário abrir o popover sem nenhum cliente com demanda ativa, mostrar estado vazio curto ("Nenhum cliente com demandas ativas").

## Detalhes técnicos

- Arquivo principal: `src/pages/KanbanCentralPage.tsx` (adicionar botão + popover + handler).
- Sem migrações, sem edge functions, sem novas rotas.
- Sem alterações em `ClientEvolution.tsx`, `KanbanCard.tsx` ou no badge do cliente do card.
- Usa componentes já presentes: `Popover`, `Input`, `Button`, `Activity` (lucide), `useSelectedClient`, `useNavigate`.

## Fora de escopo

- Nenhum botão por card / atalho no badge do cliente.
- Nenhum badge numérico no botão do header.
- Nenhuma mudança na tela de Evolução em si.
