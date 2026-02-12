

# Integrar SchedulePublicationModal no Kanban Central e Cronogramas

## Objetivo
Quando uma demanda for movida para "Agendar Publicacao" (via drag-and-drop no Kanban ou via seletor de status no TaskCard), em vez de bloquear com erro, abrir o SchedulePublicationModal para o usuario selecionar data e horario. Se cancelar, reverter o card para a posicao original.

## Alteracoes

### 1. KanbanCentralPage.tsx - Interceptar drag-and-drop

- Importar `SchedulePublicationModal`
- Adicionar estados: `scheduleModalOpen`, `pendingScheduleCard` (card sendo movido), `pendingScheduleSourceColumn` (coluna original)
- No `handleDragEnd`: quando destino for "Agendar Publicacao", em vez de bloquear, salvar o card e coluna original no estado e abrir o modal
- `onConfirm` do modal: atualizar `publish_date`, `publish_time` e `status_id` no banco, atualizar estado local, mover o card
- `onCancel` do modal: reverter o card para a coluna original no estado local

### 2. TaskCard.tsx - Interceptar seletor de status

- Adicionar prop `onScheduleRequest?: (card: KanbanCardData) => void` para delegar ao componente pai
- No `onValueChange` do Select de status: quando o valor for "Agendar Publicacao", chamar `onScheduleRequest` em vez de bloquear com toast
- Se `onScheduleRequest` nao estiver disponivel, manter o fallback atual (toast de erro)

### 3. KanbanCentralPage.tsx - Conectar TaskCard ao modal

- Passar `onScheduleRequest` ao TaskCard aberto
- Quando chamado, salvar o card no estado pendente e abrir o SchedulePublicationModal
- No confirm: salvar data/hora, atualizar status para "Agendar Publicacao"
- No cancel: nao fazer nada (card continua no status atual)

### 4. PeriodClientList.tsx - Mesma integracao

- Importar `SchedulePublicationModal`
- Adicionar mesmos estados pendentes
- Passar `onScheduleRequest` ao TaskCard
- Conectar confirm/cancel do modal

## Detalhes Tecnicos

- O modal ja existe completo em `src/components/SchedulePublicationModal.tsx` com date picker e time selector (intervalos de 15 min)
- Campos atualizados no banco: `publish_date` (YYYY-MM-DD), `publish_time` (HH:MM), `status_id` (id do status "Agendar Publicacao")
- A atualizacao de estado local garante que o card apareca imediatamente na coluna correta sem precisar refetch
