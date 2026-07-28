## Contexto rápido

- Hoje a **Visão Geral** (`src/pages/KanbanCentralPage.tsx`) tem um toggle global "Registro de Cards" (viewMode = `history`) que troca a tela inteira e usa `demand_flow_history` filtrando por `historyRange` (`today`/`7`/`30`).
- Já existe um botão discreto **Modo foco** no header de cada coluna (linhas ~1854–1867). Vamos usar esse mesmo padrão.
- **"Gestor operacional"** é uma **role** (`agency_manager` em `user_roles`), não uma função operacional. A tela "Atribuir funções" (`Settings.tsx` → `CollaboratorFunctionAssignmentsModal`) só configura `collaborator_function_assignments` (funções do fluxo, ex.: designer, redator). Trocar a role é feito por convite/promoção em `Minha Empresa > Colaboradores`, não em "Atribuir funções".

## Escopo

### 1. Botão "Registro de cards" por coluna (todos os usuários que veem a coluna)

- Remover o toggle global "Registro de Cards" do header de `KanbanCentralPage`; manter `viewMode = "active"` como único estado global.
- No header de cada coluna de colaborador, ao lado do Modo foco, adicionar um botão discreto (ícone `History` do lucide) com `title="Registro de entregas"`.
- Ao clicar, a coluna entra em modo histórico local (estado `historyByColumn: Map<userId, { range, from?, to? }>`); as demais colunas continuam normais.
- Padrão inicial ao ativar: **entregas de hoje** desse colaborador (usa `demand_flow_history.to_user_id = column.id` no dia calendário SP).
- Enquanto ativo, mostra um segundo controle discreto abaixo do header (Popover) com presets: **Hoje**, **Últimos 7 dias**, **Últimos 30 dias**, **Este mês**, **Data específica** (DatePicker single) e **Intervalo** (from/to).
- Cards da coluna passam a renderizar o resultado histórico (mesmo mapeamento atual do modo `history`), com um pequeno chip "Registro • {rótulo do período}" e um "×" para voltar ao modo ativo daquela coluna.
- Reaproveitar a lógica atual de `fetchHistory`, mas por coluna e com filtros `from`/`to` opcionais; reaproveitar `useRealtimeDemandFlowHistory` para atualizar apenas colunas ativas.

### 2. Botão "Reorganizar sequência" por coluna (apenas `agency_manager` e `super_admin`)

- No mesmo header de coluna, adicionar botão discreto (ícone `Wand2` ou `ListOrdered`) visível somente quando `useAgencyRole().role === 'agency_manager' || isSuperAdmin`.
- Ao clicar, abre um `ConfirmationModal` mostrando a **prévia** da nova ordem e datas propostas, com botões "Aplicar" e "Cancelar" (nenhuma alteração persiste até confirmar).
- Regras da inteligência (executada client-side, síncrona, sem edge function — usa apenas dados já em memória):
  - **Estimativa de duração por tipo de demanda**, via tabela de defaults em `src/lib/reorderSequence.ts`:
    - Estático: 20 min
    - Carrossel: 40 min
    - Vídeo curto/reels: 120 min
    - Vídeo longo: 180 min
    - Card diário: 20 min
    - Fallback (sem `demand_type_key`): 60 min
  - **Ordenação**:
    - Cards com `publish_date` definida ordenam por `publish_date` + `publish_time` ascendente (mais próximos primeiro).
    - Cards sem `publish_date` mantêm a **ordem atual visível** na coluna (preserva prioridade manual).
    - Cards com `publish_date` sempre vêm antes dos sem data.
  - **Reatribuição de datas/horários**:
    - Janela de trabalho por dia: 09:00–18:00 America/Sao_Paulo, pulando fins de semana e feriados (`br_calendar_events`, já usado em `dailyCards.ts`).
    - Começa no próximo slot livre a partir de agora (arredondado para 15 min, respeitando `publish_time` intervals já usados no sistema).
    - Cada card recebe `due_date`/`due_time` (início) e `delivery_date`/`delivery_time` (fim) = início + duração estimada; se estourar o dia, empurra para o próximo dia útil.
    - Para cards com `publish_date`, o `delivery_date/time` proposto nunca pode ultrapassar `publish_date` na véspera 18:00; se não couber, sinalizar conflito na prévia (linha em vermelho) e permitir aplicar mesmo assim.
  - **Persistência ao confirmar**: `update` em `demands` (`due_date`, `due_time`, `delivery_date`, `delivery_time`) em lote, e para cada card com dispatch ativo chamar `syncActiveDispatchDate` (já existente) para manter `scheduled_publication_dispatches` alinhado. Nunca cria dispatch novo.

### 3. Esclarecimento sobre "Gestor operacional"

Como parte da resposta (não do código), explicar ao usuário:

- "Atribuir funções aos colaboradores" (em Configurações) define **quais funções do fluxo** (ex.: designer, redator) cada colaborador pode executar — não muda a role.
- Para tornar alguém **Gestor Operacional** (`agency_manager`), o caminho é **Minha Empresa → Colaboradores** (ou convite com essa role em `INVITE_ROLE_OPTIONS`).
- Nenhum ajuste de UI para essa parte neste plano — só orientação.

## Arquivos afetados

- `src/pages/KanbanCentralPage.tsx`: remover header global de "Registro de Cards"; adicionar 2 botões por coluna (histórico + reorganizar); estados por coluna; render condicional dos cards da coluna.
- `src/lib/reorderSequence.ts` (novo): estimativa de duração, janela de trabalho, algoritmo de reordenação, integração com feriados.
- `src/components/kanban/ColumnHistoryPopover.tsx` (novo): presets + date/range picker.
- `src/components/kanban/ReorderSequenceModal.tsx` (novo): prévia + aplicar.
- Reutiliza: `useAgencyRole`, `syncActiveDispatchDate`, `useRealtimeDemandFlowHistory`, `br_calendar_events`.

## Fora do escopo

- Nenhuma alteração de banco (sem migration).
- Sem edge function (a "inteligência" é heurística determinística client-side, sem IA generativa).
- Sem alterações no fluxo de PWA/preview.

## Validação

- Playwright: abrir Visão Geral, ativar "Registro de entregas" em uma coluna, trocar presets, verificar que outras colunas não mudam.
- Com usuário `agency_manager`, abrir "Reorganizar", conferir prévia, aplicar, e verificar que `demands` e o dispatch ativo (se houver) refletem as novas datas.
- Com `agency_user`, confirmar que o botão de reorganizar não aparece.