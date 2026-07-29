## Problemas identificados

1. **Cards agendados poluem a Visão Geral**: hoje, a decisão anterior deixava cards com dispatch ativo visíveis na coluna "Publicar" do responsável. O usuário quer voltar a escondê-los da Visão Geral (aparecem apenas em Home → Agendamentos, que já lê `scheduled_publication_dispatches`).
2. **`ClientEvolution` (Evolução das Demandas)** mostra a etapa apenas como "Publicar", mesmo quando há dispatch ativo. Deveria mostrar "Publicar agendado".
3. **Modal do card (TaskCard)**, ao abrir um card já agendado:
   - o seletor de etapa exibe "Publicar" (deveria exibir "Publicar agendado");
   - o botão de prosseguir mostra "Agendar Publicação" (o card já está agendado — não faz sentido).

## Correções

### 1. Ocultar cards agendados da Visão Geral — `src/pages/KanbanCentralPage.tsx`
Em `filteredCards` (linha 456-461), reintroduzir o filtro que remove cards com dispatch ativo. Manter os cards no `useActiveDispatchIds`; o badge de "Conteúdos agendados" e a coluna de Agendamentos seguem funcionando via essa mesma fonte de dados. Efeitos colaterais controlados:
- `resolveStageLabel` deixa de precisar do sufixo "agendado" (mantenho, mas na prática não será renderizado na Visão Geral).
- Contadores de coluna passam a não incluir agendados (comportamento desejado — sem poluição).

### 2. Rótulo em `ClientEvolution` — `src/pages/ClientEvolution.tsx`
- Fazer o fetch de dispatches ativos do tenant (usar `useActiveDispatchIds(tenantId)` como no Kanban) para obter o `Set<string>` de `card_id` agendados.
- Em `classified` (linha 332-353), quando `stageKey === "publicar"` e o card estiver em `activeDispatchIds`, definir `stageName = "Publicar agendado"`.
- Assim, a coluna "Etapa atual" da planilha reflete o estado real e mantém ordenação/filtragem existentes.

### 3. Modal do TaskCard — `src/components/TaskCard.tsx`
- Consumir `useActiveDispatchIds(card.tenant_id)` no componente e derivar `isScheduled = activeDispatchIds.has(card.id)`.
- No bloco de linhas 1287-1303:
  - Ajustar `curName` quando `curKey === "publicar" && isScheduled` para `"Publicar agendado"` (sobrescreve o nome vindo da pipeline).
  - Alterar `nextLabel`/renderização: quando `nextIsPublicar && isScheduled`, substituir o botão "Agendar Publicação" por "Reagendar" (mantém o click `setInlineScheduleOpen(true)`, mesmo ícone `CalendarClock`). Isso resolve tanto a UX quanto o rótulo confuso.
  - Quando `nextIsPublicar && !isScheduled`, comportamento atual permanece ("Agendar Publicação").
- O seletor de etapas (Popover) também exibe `curName`; portanto a mesma sobrescrita já cobre o header do modal.

### Comportamento nos Agendamentos (Home → Visão Geral → Agendamentos)
Nada muda: `Scheduled.tsx` já é alimentado por `scheduled_publication_dispatches` (não pela lista `demands` da Visão Geral). Os cards continuarão aparecendo lá com histórico e futuros.

## Fora de escopo
- Não altero políticas de RLS, edge functions, hooks de realtime, nem a lógica de execução do dispatcher.
- Não mudo o texto do badge "Conteúdos agendados" no topo do Kanban.
- Não altero a lógica de reorganização automática.