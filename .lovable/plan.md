# Auditoria: mecanismo de alocação em massa

Análise técnica baseada no código real e no Postgres conectado. Nada foi implementado.

## 1. Arquitetura atual encontrada

### Transferência individual (drag na Visão Geral)
`src/pages/KanbanCentralPage.tsx` (`handleDragEnd`, ~linha 1361) é hoje o único caminho completo de troca de responsável e já implementa a ordem correta:

1. `evaluateReassign` (`src/lib/reassignDemand.ts`) — valida função, remapeia etapa, checa agenda, sugere slot.
2. Se bloqueado por agenda → `ScheduleConflictModal` com `suggestion`.
3. `applyReassign` — reconfere conflito, monta payload, `commitFlowTransition` (compare-and-set em `assigned_to` + `current_function_key`), `applyFlowReactivation`, `recordFlowHistory`.
4. `reassignFailureMessage` traduz `ok | stale | conflict | error`.

Nenhum outro ponto do app faz alocação com esse rigor. Não existe hoje seleção múltipla / checkbox / bulk action em cards em nenhuma tela (o único "bulk" existente é `src/lib/bulkAttachments.ts`, exclusão de anexos — padrão de confirmação reutilizável, lógica não).

### Resolução de etapa para um colaborador
Camadas, todas já centralizadas:
- `collaborator_function_assignments` = permissão (`userHasFunction` / SQL `user_can_hold_function`).
- `demand_type_flow_rules` + `flow_functions` (position, `work_area`, `requires_client_origin`) = fluxo por tipo/área.
- `resolveFunctionForAssignee` (`src/lib/initialFlowFunction.ts`, RPC homônima) = etapa compatível mais próxima, preferindo avanço e caindo para regressão.
- `stageDirection` em `reassignDemand.ts` = detecta regressão (grava `moved_back` no histórico).
- `src/lib/stageRouting.ts` = preferência por cliente (`client_stage_routing_preferences`) + carga; usado no sentido inverso (etapa → pessoa).
- Anti-auto-revisão e sticky de responsável vivem em `src/lib/proceedDemand.ts` (fluxo de avanço), **não** no caminho de reatribuição manual — e não precisam entrar no bulk (o gestor escolhe a pessoa explicitamente).

### Duração por tipo × etapa
- `DURATION_MATRIX` + `SYSTEMS_TYPE_MINUTES` + `FALLBACK_STAGE_DURATION` em `src/lib/reorderSequence.ts`.
- Overrides em `flow_functions.config.durations` (grupo, legado) e `config.durations_by_type` (por `demand_type_key`, prioritário), carregados por `loadDurationsByArea` (chaves `area:function_key`) ou `loadDurationsForTenant`.
- `estimateDurationBase(card, ctx, overrides)` é a função canônica; `estimateDurationMinutes` é o wrapper sem overrides usado por `scheduleOccupancy` — ou seja, **a checagem de conflito hoje ignora overrides do tenant**, enquanto o reorganizador os respeita. Divergência conhecida a tratar.

### Agenda / ocupação
- `src/lib/scheduleOccupancy.ts`: `cardWindow`, `getBusyIntervals` (inclui `additional_assignees`, exclui draft/arquivado), `checkAssignmentConflicts` (overlap + all-day + janela de área via `areaConflicts.ts`), `suggestFreeSlot` (varre 30 dias).
- `src/lib/freeSlot.ts`: núcleo puro (`firstFreeStart`, `mergeSpans`, `buildDayWindows`, `DEFAULT_WORK_WINDOWS` 09–12 / 13:30–18).
- `user_area_schedules` por `weekday`/área: dia sem faixa nenhuma → expediente padrão; dia só com faixa de outra área → indisponível.
- Feriados: `fetchHolidaysInRange` (`br_calendar_events`) só é consultado por `computeReorder`; `suggestFreeSlot` **não** trata feriado (apenas pula fim de semana quando não há `user_area_schedules`).
- Etapas de cliente (`aguardando_cliente`, `enviar_cliente`, `entregar_cliente`, `feedback_cliente`) não ocupam agenda (`isUntimedStage`).

### Reorganizador por colaborador
`computeReorder` (`reorderSequence.ts`) + `ReorderSequenceModal`:
- exclui cards com dispatch ativo (`scheduledPublishIds`);
- `captar` e cards diários ficam fixos e entram como intervalos bloqueados que o cursor contorna;
- `aguardando_cliente` sai totalmente do cálculo;
- ordenação `sortForReorder`: tiers (produção → revisão → avaliar), primeiro card por `due` preservado como "em andamento", depois opcional prioridade por publicação, depois janela de risco (slack) e "recém-chegado" no fim;
- `keepStart` preserva início de card em execução; `manualOverrides` permitem fixar início/fim/duração;
- persistência: `buildReorderScheduleUpdate` + update por card com `.eq("updated_at", live)` (lock otimista) — só escreve datas, nunca `assigned_to`.

### Feed Simulado
`src/lib/instagramFeed.ts` → `buildInstagramFeed` gera `FeedEntry` com `isDemand`, `demandId`, `mediaSource`; itens de planejamento têm `isDemand: false` e `demandId: null`. `InstagramFeedTab.tsx` renderiza grade 3 colunas com clique só quando `entry.isDemand && entry.demandId`. O feed não carrega `assigned_to`, `current_function_key`, `work_area`, `due_*`/`delivery_*` — `useClientPeriodWorkspace` precisaria expor esses campos (ou o helper de bulk recarrega os cards por id).

### Concorrência e constraints reais (verificado no Postgres)
Triggers em `public.demands`:
- `validate_demand_stage_assignment_trg` — na mudança de `assigned_to`/`current_function_key`/`demand_type_key`/`work_area`: se o usuário não pode a etapa, tenta `resolve_function_for_assignee` e **reescreve `current_function_key`**; se nada compatível, `RAISE 23514`. Ou seja o banco é a última linha de defesa e pode alterar a etapa sob nós.
- `block_conflicting_assignment_trigger` — **só valida quando `assigned_to` muda**; recusa (`23514`) qualquer sobreposição com outro card não arquivado do mesmo responsável (ignora etapas de cliente, `due_date` no passado e drafts). Consequência crítica: o update em massa precisa gravar `assigned_to` **junto** com `due/delivery` finais e as janelas propostas precisam ser mutuamente disjuntas — senão o 2º card do lote é rejeitado pelo próprio 1º.
- `guard_demand_release_trg`, `normalize_release_state_on_insert_trg`, `trigger_auto_release_queue_trg`, `on_demand_status_change`, `update_demands_updated_at` (mexe em `updated_at`, então lock otimista por `updated_at` continua válido apenas dentro de um único update).
- `app.skip_schedule_check` / `app.skip_release_guard` existem mas só são acessíveis server-side — não usar no client.

Realtime (`useRealtimeDemands`) reescreve `cards` a qualquer momento: uma prévia calculada precisa ser revalidada contra o estado lido no momento do apply.

## 2. O que DEVE ser reutilizado (e não duplicado)

| Necessidade | Reutilizar | Não fazer |
|---|---|---|
| Etapa válida do destinatário | `evaluateReassign` / `resolveFunctionForAssignee` | novo resolvedor de etapa |
| Duração real | `estimateDurationBase` + `loadDurationsByArea` | nova matriz ou `estimateDurationMinutes` puro |
| Sequenciamento na agenda | `computeReorder` (+ `freeSlot` para o cursor inicial) | novo alocador de horários |
| Ordem/prioridade | `sortForReorder` com `prioritizePublishDate: true` | novo comparador |
| Ocupação existente | `getBusyIntervals` / `checkAssignmentConflicts` | consulta nova a `demands` |
| Escrita segura | `commitFlowTransition` + `buildReorderScheduleUpdate` | update direto sem CAS |
| Histórico | `recordFlowHistory` | insert manual |
| Mensagens de falha | `reassignFailureMessage` | strings novas por tela |

## 3. Proposta de arquitetura

### Helper central: `src/lib/bulkAllocation.ts`
Duas funções, prévia e aplicação separadas — mesmo contrato do reorganizador.

```text
planBulkAllocation({ tenantId, cardIds, targetUserId })
  1. recarrega os cards por id direto do banco (fonte de verdade, não o estado da tela)
  2. para cada card: evaluateReassign(skipSuggestion: true)
       -> allowed?  nextFunctionKey (etapa resolvida, direction)
       -> blocked por "function" => item vai para `rejected` com motivo
       (conflito de agenda NÃO rejeita aqui: o sequenciamento vai reagendar)
  3. carrega agenda do destinatário: getBusyIntervals + fila atual dele
     (cards já dele que não estão no lote) + user_area_schedules + feriados
  4. computeReorder(cardsDoLote + filaAtualDoDestinatario, {
        startFrom: agora, durations: loadDurationsByArea, areaSchedule,
        scheduledPublishIds, prioritizePublishDate: true })
     -> mantém captar/diário/aguardando cliente/dispatch ativo fixos
     -> mantém o card em andamento do destinatário no topo
  5. devolve BulkAllocationPlan {
        assignments: [{ cardId, fromUser, nextFunctionKey, direction,
                        start/end propostos, durationMin, changed }],
        untouched: cards do destinatário só reagendados,
        rejected: [{ cardId, reason }],
        signature: hash(cardId + updated_at) para revalidação
     }
```

```text
applyBulkAllocation(plan)
  - revalida `signature` (releitura de updated_at) → aborta em `stale`
  - por card, na ORDEM CRONOLÓGICA da proposta:
      applyReassign({ card, newAssignedTo, nextFunctionKey,
                      reschedule: { due/delivery da proposta },
                      historySource: "bulk_allocation" })
      (assigned_to + horários no MESMO update → satisfaz block_conflicting_assignment)
  - cards já do destinatário que só mudam de horário: update de datas com
    lock otimista em updated_at (caminho do reorganizador), sem tocar assigned_to
  - resultado agregado: applied / skipped / failed[{cardId, message}]
  - parada opcional no primeiro erro? não: segue e reporta, sem rollback
    (cada card é uma transação independente; a prévia pode ser recalculada)
```

Ajuste necessário fora do helper: fazer `scheduleOccupancy.durationMinutesOf` aceitar os overrides do tenant (parâmetro opcional), para que conflito e sequenciamento usem a mesma duração. Sem isso, prévia e trigger podem discordar.

### Prévia antes de aplicar
Novo `BulkAllocationModal` (mesma linguagem visual de `ReorderSequenceModal`, reaproveitando `ReorderProposalRow`):
- seletor de colaborador (candidatos = quem tem alguma função compatível, via `getEligibleStageCandidates` por etapa dos cards selecionados);
- lista ordenada: card, cliente, etapa resultante (com aviso quando a etapa foi remapeada ou regrediu), duração, início→fim propostos, badge de risco/publicação;
- bloco separado "Não podem ir para este colaborador" com motivo;
- bloco "Também serão reagendados" (fila atual do destinatário);
- botão Aplicar desabilitado se nenhum item elegível; recálculo ao trocar de colaborador.

## 4. Comportamento por tela

**Visão Geral (`KanbanCentralPage`)**
- Modo seleção ativado por um botão no header, visível só para `canReorder` (super admin / gestor) e desligado em `isHistoryMode`.
- Enquanto ativo: `KanbanCard` recebe `selectable`/`selected`/`onToggleSelect`; clique alterna seleção em vez de abrir o card; drag desabilitado (`isDragDisabled`) para não competir com o gesto. Fora do modo, comportamento atual intacto (drag, abrir card, agrupamentos, focus mode, histórico por coluna).
- Barra de ação flutuante: "N selecionados · Alocar para colaborador · Limpar".
- Seleção limpa ao trocar filtros/área/foco.

**Feed Simulado (`InstagramFeedTab`)**
- Mesmo modo seleção, restrito a `entry.isDemand && entry.demandId`; itens de planejamento ficam não selecionáveis (nada muda para eles).
- Long-press/preview e navegação de carrossel preservados: em modo seleção o clique curto seleciona, o preview continua no long-press.
- `useClientPeriodWorkspace` passa a expor os campos de agenda/etapa dos demands (ou o helper recarrega por id — preferível, mantém o feed leve).

## 5. Regra de prioridade
Delegada a `sortForReorder` com `prioritizePublishDate: true`, que já entrega: publicação mais próxima sobe; cards sem `publish_date` recebem chave `9999-12-31` e caem para o fim de forma estável (índice original como desempate); tiers produção → revisão → avaliar; janela de risco por slack; card em andamento preservado no topo; captar/diário/aguardando cliente/dispatch ativo fora da realocação.

## 6. Casos especiais e blockers
- **Etapas de cliente**: card em `aguardando_cliente`/`enviar_cliente` não ocupa agenda; alocar em massa deve permitir a troca de responsável mas sem propor horário (marcar "sem horário").
- **`captar` e multi-assignee**: `additional_assignees` não é tocado; card em `captar` mantém janela fixa — sinalizar na prévia como "horário preservado".
- **Dispatch ativo / publicação agendada**: card sai do sequenciamento (`scheduledPublishIds`) e é apenas reatribuído.
- **Cards diários**: janela fixa, apenas reatribuídos.
- **Fila de liberação**: bulk não deve alterar `released_at` (`guard_demand_release` só permite gestores e fila ativa) — nada a fazer, só não incluir o campo.
- **Trigger de agenda**: a proposta precisa ser disjunta inclusive contra cards do destinatário fora do lote; por isso a fila atual dele entra em `computeReorder`.
- **Trigger de etapa**: pode reescrever `current_function_key`; após aplicar, reler o estado (o realtime já faz) em vez de confiar no otimista.
- **Divergência de duração** entre `scheduleOccupancy` e `reorderSequence`: precisa ser resolvida antes, senão a prévia mostra um horário que o banco rejeita.
- **Feriados em `suggestFreeSlot`**: não tratados; o bulk usa `computeReorder`, que trata — evitar `suggestFreeSlot` como motor do bulk.
- **Volume**: lote grande = N updates sequenciais. Sugiro limite prático (ex. 30 cards) e barra de progresso; se virar gargalo, uma RPC transacional é a evolução natural (fora desta versão).

## 7. Recomendação: 1 colaborador agora, distribuição depois
Implementar apenas **(A) Alocar para um colaborador**. A base para (B) existe parcialmente (`getEligibleStageCandidates` já ordena por carga), mas falta o essencial: não há noção de capacidade diária por pessoa nem de custo comparável entre áreas, e "primeiro slot livre" entre vários usuários exigiria rodar `computeReorder` por candidato a cada card — caro e difícil de mostrar em prévia. Recomendação: entregar (A) com prévia sólida e, depois, avaliar (B) reaproveitando o mesmo `planBulkAllocation` com um laço de candidatos.

## 8. Detalhes técnicos (resumo de arquivos)
- Novo: `src/lib/bulkAllocation.ts` (puro + I/O separados), `src/lib/bulkAllocation.test.ts`, `src/components/kanban/BulkAllocationModal.tsx`.
- Ajustes: `scheduleOccupancy.ts` (duração com overrides), `KanbanCard.tsx` (props de seleção), `KanbanCentralPage.tsx` (modo seleção + barra), `InstagramFeedTab.tsx` (modo seleção restrito a demandas), possivelmente `useClientPeriodWorkspace.ts`.
- Sem migration nova: nenhum campo novo é necessário.
