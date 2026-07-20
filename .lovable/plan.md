## Diagnóstico

**Cabeçalho vazio (breadcrumb)**  
O `Layout` global renderiza `NavigationBreadcrumb` no header do topo, mas `/scheduled` **não está mapeado** em `src/hooks/useBreadcrumb.tsx`. Por isso o header aparece vazio e o "Voltar" + "Agendamento" acabaram sendo empurrados para dentro do corpo da página, criando duplicidade com o padrão usado em `/kanban-central` (que só tem ícone + título + badge + ações no corpo, sem "Voltar" — quem faz esse papel é o breadcrumb).

**Posts publicados não aparecem em datas passadas**  
Fluxo real de um dispatch bem-sucedido em `run-scheduled-dispatches`:
1. Dispatch vira `status = "sent"`.
2. Demand recebe `status = "Publicado"` e `current_function_key = "revisar_publicacao"`.
3. `archived_at` só é setado depois, quando o card chega em "Feito".

O `fetchScheduledCards` até traz esses cards (via OR `id.in.(dispatchCardIds)`), mas o calendário posiciona cada item por `card.publish_date` + `card.publish_time` da **demand**. Depois da publicação esses campos podem ser alterados pelo revisor, ou o card pode nem ter `publish_time` (só `due_date`), fazendo o item cair em datas erradas ou sumir da grade. A fonte real da data em que foi/será publicado é o `scheduled_at` do dispatch (e `dispatched_at` quando `sent`), que hoje é ignorado no posicionamento.

## Plano

### 1. Breadcrumb da rota `/scheduled`
Em `src/hooks/useBreadcrumb.tsx`, adicionar:
```
'/scheduled': {
  items: [
    { label: 'Home', href: '/home', icon: Home },
    { label: 'Kanban Central', href: '/kanban-central', icon: LayoutGrid },
    { label: 'Agendamentos', icon: CalendarDays }
  ]
}
```
Assim o header superior passa a mostrar **Home > Kanban Central > Agendamentos** automaticamente (desktop e mobile), e "Kanban Central" fica clicável — substitui o botão "Voltar" avulso.

### 2. Alinhar o cabeçalho do corpo com o padrão de "Visão geral das Tarefas"
Em `src/components/Scheduled.tsx`:
- Remover o botão "Voltar" e a prop `backTo` (o breadcrumb assume esse papel).
- Trocar o wrapper para o mesmo padrão da Visão geral: `<div className="mt-4 px-3 sm:px-4">`.
- Trocar o header interno para o mesmo layout: ícone em `bg-primary/10 rounded-lg` (usando `CalendarDays` na cor `text-primary`, sem o roxo divergente) + `h2 text-xl sm:text-2xl font-bold` "Agendamento" + `Badge` com contagem, tudo em `flex items-center gap-3 mb-4`.

Em `src/pages/Kanban.tsx`:
- Remover o wrapper `container max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8` (o padding vai para dentro do próprio `Scheduled`, evitando padding duplicado).
- Remover a passagem de `backTo` (não é mais necessária).

Em `src/pages/KanbanCentralPage.tsx`:
- Remover o `state: { from: "/kanban-central" }` do `navigate("/scheduled", ...)` (não é mais lido).

### 3. Corrigir posicionamento e visibilidade de posts já publicados
Em `src/components/Scheduled.tsx`, dentro de `fetchScheduledCards`:
- Ampliar o `select` de dispatches para trazer `scheduled_at, dispatched_at, status`.
- Guardar `dispatch_scheduled_at` e `dispatch_dispatched_at` no `CentralKanbanCard` (extendendo a interface).

Em `getPublicationDateTime`:
- **Prioridade nova**: se o card tem dispatch, usar `dispatched_at` (quando `status = "sent"`) ou `scheduled_at` como fonte da data/hora exibida no calendário. Só cair para `publish_date`/`publish_time` da demand quando não houver dispatch.
- Isso garante que posts já publicados apareçam exatamente no dia em que foram publicados, mesmo se o revisor alterou `publish_date` da demand depois.

Manter o filtro OR já existente (`archived_at.is.null` OU `id.in.(dispatchCardIds)`) e o badge de status já implementado no modal do dia (Publicado / Falhou / Cancelado).

## Impacto
- Somente `src/components/Scheduled.tsx`, `src/pages/Kanban.tsx`, `src/pages/KanbanCentralPage.tsx` (uma linha) e `src/hooks/useBreadcrumb.tsx`.
- Sem migrações, sem mudança de schema, sem alteração no fluxo de publicação/edge function.
