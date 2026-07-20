## Diagnóstico

**1. Fluxo "só é agendado se o usuário finalizou" — está correto**

Aferi `createOrUpdateScheduleDispatch`: só é chamado em 3 pontos (`KanbanCentralPage`, `TaskCard`, `PeriodClientList`), todos dentro de `SchedulePublicationModal.onConfirm` — ou seja, o usuário abriu o modal de programação, escolheu data/hora e clicou em confirmar. Não há criação automática/lateral de dispatch. Portanto o filtro do Kanban ("esconder cards com dispatch ativo") só remove cards que o usuário efetivamente finalizou como programados. Nenhuma burocracia extra necessária.

**2. Botão "Voltar" avulso e destino errado**

`src/pages/Kanban.tsx` (rota `/scheduled`) renderiza `<BackButton to="/home" />` fora do componente, acima do header. Além disso, o destino é fixo em `/home`, ignorando de onde o usuário veio (Kanban Central ou Hub do Cliente).

**3. Posts passados não aparecem**

Em `Scheduled.tsx` linha 179 o fetch aplica `.is("archived_at", null)`. Demandas na coluna "Feito" são auto-arquivadas (memória `completed-demands-archive`), então dispatches `sent`/`failed`/`canceled` desses cards ficam de fora. O print de Julho/2026 confirma: nenhum dia anterior a hoje mostra item, apesar de haver dispatches passados.

## Alterações

### A. Header do Scheduled com Voltar contextual
- `src/components/Scheduled.tsx`: aceitar prop `backTo?: string` e renderizar botão Voltar (ícone `ArrowLeft` + label) **dentro** do header, à esquerda do ícone/título, alinhado verticalmente. Ao clicar: `navigate(backTo)` se fornecido, senão `navigate(-1)`.
- `src/pages/Kanban.tsx`: remover `<BackButton>` avulso; passar `backTo` derivado de `location.state?.from` (fallback `/home`).
- `src/pages/KanbanCentralPage.tsx`: no `onClick` do botão "Conteúdos agendados" (linha 1360), navegar com `navigate("/scheduled", { state: { from: "/kanban-central" } })`.
- Fazer o mesmo em qualquer outro entry-point conhecido para `/scheduled` que passe pelo hub (manter fallback `/home`).

### B. Incluir posts publicados/passados (histórico)
- `src/components/Scheduled.tsx` `fetchScheduledCards`:
  - Remover `.is("archived_at", null)` do SELECT de `demands` **ou** trocar por consulta em duas etapas: (1) pegar `card_id`s dos dispatches; (2) buscar demandas por `.in("id", cardIds)` sem filtro `archived_at`, mais um `OR` das demandas com status "Agendar Publicação" e `archived_at IS NULL` (mantém o path legado).
  - Preservar `dispatch_status` para o badge existente ("Publicado", "Falhou", "Cancelado").
  - Manter ordenação por data (passados aparecem naturalmente nos dias anteriores do calendário).

## Fora do escopo
- Nenhuma mudança de regra de negócio no momento em que o dispatch é criado (fluxo confirmado como correto).
- Nenhuma mudança no `KanbanCentralPage` além do `navigate` com `state.from`.