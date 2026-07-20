# Ajustes na Visão Geral e no calendário de Agendamentos

## Escopo (esta rodada)

1. Destacar melhor o **dia de hoje** no calendário de Agendamentos.
2. Adicionar botão discreto **Modo foco** em cada coluna de colaborador da Visão Geral, que abre a rota já existente `/colaboradores/:userId`.
3. Agrupamento **Aguardando clientes** deve iniciar **recolhido** por padrão (mesmo comportamento do "Em Revisão").
4. **Esconder** a coluna **Sem responsável** quando não houver nenhum card sem responsável ativo.

Fora de escopo (removido): auto-agendar cards "Sem responsável" com publish_date.

## Detalhes técnicos

### 1. Dia de hoje no calendário — `src/components/Scheduled.tsx`

- Hoje o dia atual usa `border-primary + ring-primary/30 + bg-primary/5` e o número em `text-primary`. Como todas as células com posts também herdam tons de primary, o "hoje" quase não se distingue.
- Trocar por um esquema com **fundo cheio** e contraste claro:
  - Célula: `bg-primary text-primary-foreground border-primary` + `ring-2 ring-primary/50 ring-offset-1 ring-offset-background`.
  - Número do dia: `text-primary-foreground` com um pequeno pill `bg-primary-foreground text-primary rounded-full px-1.5` para máxima leitura.
  - Cards dentro da célula "hoje" ganham `bg-primary-foreground/15 text-primary-foreground border-primary-foreground/30` (mantém legibilidade sobre o fundo azul).
- Nenhuma cor hardcoded — só tokens semânticos (`primary`, `primary-foreground`, `background`).

### 2. Botão "Modo foco" — `src/pages/KanbanCentralPage.tsx`

- No cabeçalho de cada coluna (bloco em `~L1746`), adicionar, apenas para colunas de colaboradores reais (não em `__unassigned__` e não em `viewMode === "history"`), um ícone `Focus` (lucide) discreto à direita do badge de contagem:
  - `Button variant="ghost" size="icon"` de 6×6, cor `text-muted-foreground hover:text-primary`.
  - `title="Modo foco"` + `aria-label`.
  - `onClick={(e) => { e.stopPropagation(); navigate('/colaboradores/' + column.id); }}` — rota já registrada em `App.tsx`.
- Sem novo estado ou fetch; reutiliza a página `CollaboratorDemands` existente.

### 3. Aguardando clientes recolhido por padrão

- Inverter a semântica de `collapsedAwaiting` para `expandedAwaiting` (Set das colunas que o usuário expandiu manualmente), espelhando o padrão já usado por `expandedReview`.
- `toggleAwaiting` passa a adicionar/remover em `expandedAwaiting`.
- `isAwaitingCollapsed = !expandedAwaiting.has(column.id)` — resultado: começa recolhido, expande sob clique, persiste durante a sessão.
- Nada muda visualmente além do estado inicial.

### 4. Ocultar coluna "Sem responsável" quando vazia

- No render das colunas (`~L1682`), montar o array condicionalmente:
  - Sempre incluir `collaborators`.
  - Só incluir `{ id: '__unassigned__', ... }` se `viewMode === 'history'` **ou** se `filteredCards.some(c => !c.assigned_to)`.
- Assim, no modo ativo sem cards órfãos, a coluna somem completamente; no modo histórico ela continua aparecendo para não quebrar visualização de cards que já passaram por "sem responsável".

## Validação

- Abrir `/scheduled` no mês corrente → dia atual visivelmente destacado (fundo azul cheio, número em pill contrastante), inclusive quando tem cards.
- Em `/kanban-central`: cada coluna de colaborador mostra o ícone "Modo foco"; clicar navega para `/colaboradores/:userId`.
- Recarregar `/kanban-central` com colunas que têm `aguardando_cliente` → o bloco aparece recolhido; clique expande.
- Se nenhum card estiver com `assigned_to = null`, a coluna "Sem responsável" desaparece; ao criar/desatribuir um card, a coluna reaparece (realtime já cobre).

## Fora de escopo

- Nada muda em edge functions, banco, RLS ou lógica de dispatch.
- Sem alterações no fluxo automático de agendamento (adiado conforme sua instrução).
