## Diagnóstico

Aferi o banco de dados: **existem 9 cards na coluna da Lúcia (etapa `planejar`) que já têm agendamento ativo** em `scheduled_publication_dispatches` (status `scheduled`, com `scheduled_at` entre 22/07 e 31/07). Ou seja, o usuário já finalizou o conteúdo e agendou a publicação — não há mais nenhuma ação operacional pendente, mas eles continuam ocupando a coluna e criando a sensação de "avalanche".

Exemplos confirmados: `ESTÁTICO, QUANDO 1 MINUTO FAZ A DIFERENÇA` (22/07 11:00), `CARROSSEL, MEU PET ESTÁ MUITO QUIETO` (27/07), `BURNOUT` (29/07), etc.

Sua leitura está correta: eles não pertencem a `revisar`, nem a `planejar` — pertencem a uma "prateleira" de acompanhamento visual (a tela `Conteúdos Agendados`).

## O que vou fazer

### 1. Ocultar do Kanban Central os cards já agendados
Na `KanbanCentralPage`, filtrar da visão operacional qualquer card cujo `id` esteja em `scheduled_publication_dispatches` com status `scheduled` ou `dispatching` no tenant atual.

- **Sem mover de coluna** e **sem alterar `assigned_to`**: assim, se o dispatch falhar/for cancelado, o card volta a aparecer imediatamente na coluna do responsável, exatamente onde estava.
- O filtro também respeita o modo "Registro de Cards" (o histórico continua mostrando esses cards).
- Toast informativo uma única vez por sessão: "N cards já agendados foram movidos para Conteúdos Agendados".

### 2. Novo botão "Conteúdos agendados" no header secundário do Kanban Central
Adicionar botão ao lado de "Novo Status" / "Nova Demanda", com:
- Ícone `CalendarDays` + label "Conteúdos agendados".
- **Badge discreto** (bolinha pequena com número) mostrando a contagem de dispatches ativos (`scheduled` + `dispatching`) do tenant, atualizada em realtime via `useRealtimeScheduledDispatches`.
- Clique navega para `/scheduled`.

### 3. Página `/scheduled` passa a mostrar passados
Hoje `Scheduled.tsx` mostra apenas cards com dispatch ativo/futuro. Vou:
- Buscar também dispatches com status `sent`, `failed` e `canceled`.
- Agrupar visualmente em duas seções:
  - **Agendados** (futuro, ordenado por data crescente) — comportamento atual.
  - **Já publicados / passados** (data ≤ hoje, ordenado decrescente), com badge de status (Publicado, Falhou, Cancelado).
- Mantém o filtro por cliente e a busca já existentes.

### 4. Sem migração de dados
Nada de mover cards no banco. O filtro é 100% de visualização — é o comportamento correto e reversível.

## Detalhes técnicos

- Novo hook `useActiveDispatchIds(tenantId)` em `src/hooks/` que retorna `Set<string>` de `card_id` com dispatch em `scheduled`/`dispatching`. Usa realtime já disponível.
- `KanbanCentralPage.fetchAllCards`: aplica `.filter(c => !activeDispatchIds.has(c.id))` antes do agrupamento por coluna. Modo "Registro de Cards" ignora esse filtro.
- Botão no header segue o padrão visual dos atuais ("Novo Status", "Nova Demanda"): `variant="outline"` com badge `absolute -top-1 -right-1` pequeno em `bg-primary text-primary-foreground`.
- `Scheduled.tsx`: separar `activeCards` em `upcomingCards` e `pastCards` com base em `getPublicationDateTime(card) >= now`; renderizar duas seções com headings.

## Fora do escopo

- Não altero `current_function_key` desses cards.
- Não crio nova coluna/etapa "Agendado" no fluxo operacional (a "coluna" já é a página `/scheduled`).
- Não mexo no fluxo de dispatch em si (`run-scheduled-dispatches`, `createOrUpdateScheduleDispatch`).