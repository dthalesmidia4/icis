## O que eu verifiquei no código atual

1. **Arrastar card entre colunas** (`KanbanCentralPage.tsx`, handler de drag ~linha 1160-1255): valida **apenas** função de etapa de cliente (`isClientStageKey` + `userHasFunction`) e reresolve a etapa via `resolveFunctionForAssignee`. Depois grava `assigned_to` direto em `demands`. **Nenhuma checagem de horário/ocupação.**
2. **Select "Responsável" dentro do card** (`TaskCard.tsx` ~linha 1806-1860): mesma coisa — valida função, resolve etapa, salva. **Nenhuma checagem de horário.**
3. **A única checagem de conflito que existe** (`warnAreaConflict` em `TaskCard.tsx`, linha ~1136) só roda quando **a data/hora muda**, nunca quando o **responsável** muda. E ela usa `findAreaConflicts`, que tem `if (d.work_area === area) continue` — ou seja **ignora conflito dentro da mesma área**. Só cruzamento Mídia × Sistemas é detectado.
4. **`findScheduleAreaConflict`** valida só a janela de `user_area_schedules` (Mídia vs Sistemas por dia da semana), não ocupação por outro card.
5. **`proceedDemand.ts`** escolhe o próximo responsável (`picked.userId`) por função/permissão e mantém as datas do card; não consulta a agenda do escolhido. `buildReturnFromClientDates` cria janela "agora + duração" sem verificar se o slot está livre.
6. **Trigger no banco** (`validate_demand_stage_assignment`) valida somente compatibilidade função × responsável. Não existe nenhuma restrição de sobreposição de horário no banco — logo qualquer caminho (UI, automação, edge function) pode criar conflito.
7. **O motor de agenda já existe e é bom**, mas só é usado no reorganizador manual: `reorderSequence.ts` (`DURATION_MATRIX`, `estimateDurationMinutes`, horários de trabalho, cortes por área), `flowDurations.ts` (overrides por etapa), `useWorkHoursConfig`, `user_area_schedules`.

**Conclusão da causa raiz:** não existe nenhuma noção de *ocupação de agenda por responsável* no momento da transferência. Conflito de mesma área nunca foi implementado, e a validação existente é só um aviso pós-mudança de data.

## Plano de correção

### 1. Motor único de ocupação (`src/lib/scheduleOccupancy.ts`)
Nova camada que reaproveita `estimateDurationMinutes`, os overrides de `flow_functions.config.durations`, `useWorkHoursConfig` e `user_area_schedules`:
- `getBusyIntervals({ tenantId, userId, dateRange })` → lista de janelas ocupadas do responsável, derivadas de `due_date/due_time` → `delivery_date/delivery_time` (quando ausentes, deriva o fim pela duração da etapa/tipo).
- `checkAssignmentConflicts({ tenantId, userId, card, targetStage, area })` → retorna `{ hard[], soft[], scheduleWindow }`:
  - **hard**: sobreposição real de janelas (qualquer área — corrige o furo de mesma área), card sem horário ocupando o dia inteiro, ou janela dentro do bloco de outra área em `user_area_schedules`.
  - **soft**: encosta no limite, cruza fronteira de área, fora de janela configurada, ou dia com carga acima do disponível.
- Etapas que não consomem tempo (`aguardando_cliente`, `enviar_cliente` e demais de `isClientFacingFunction`/`UNTIMED_STAGE_KEYS`) e cards com dispatch ativo ficam fora da ocupação.
- `suggestFreeSlot(...)` → primeiro slot livre do novo responsável (respeitando janela da área, almoço e corte de fim de dia), usado para oferecer reagendamento.

### 2. Ponto único de transferência (`src/lib/reassignDemand.ts`)
Todos os caminhos passam a chamar uma única função que executa, em ordem: validação de função → resolução de etapa → `checkAssignmentConflicts` → decisão → update → `recordFlowHistory` (com o motivo/decisão no `metadata`).
Consumidores a migrar: drag do Kanban, select de responsável no `TaskCard`, `AwaitingClientActions`, `proceedDemand` (escolha do próximo responsável e retorno do cliente), `CollaboratorDemands`.

### 3. Comportamento na UI
- **Conflito hard → bloqueia** a transferência (nada é gravado; no drag o card volta à coluna de origem) e abre um modal "Conflito de agenda" listando os cards em choque, com três saídas: *Cancelar*, *Reagendar para o primeiro slot livre* (usa `suggestFreeSlot`), *Escolher outro horário*.
- **Conflito soft → permite** com aviso explícito (toast) e registro no histórico.
- Nada de "salvar e avisar depois": a checagem roda **antes** do update, inclusive no drag (o update otimista só é aplicado após aprovação).
- `warnAreaConflict` do `TaskCard` passa a delegar ao novo motor, ganhando também conflito de mesma área ao mudar data/hora.

### 4. Garantia no banco (não burlável)
Nova migração:
- Função `public.demand_schedule_conflicts(...)` (security definer) que calcula sobreposição de janelas do mesmo `assigned_to` no mesmo tenant, ignorando etapas sem prazo e cards arquivados/rascunho.
- Trigger `BEFORE INSERT OR UPDATE` em `demands` que **bloqueia** com mensagem clara quando `assigned_to`/datas/horários/etapa mudarem e resultarem em sobreposição — cobrindo automações e edge functions.
- Uma flag de contexto (`set_config`) permite ao reorganizador em lote aplicar sua sequência já validada sem falso positivo durante os updates intermediários.
- Antes de ativar: query de auditoria para listar conflitos legados existentes e relatório ao usuário (correção dos legados feita em passo separado, com histórico registrado).

### 5. Coerência com o reorganizador e áreas
- `reorderSequence.ts` passa a consumir `getBusyIntervals` para considerar também cards de **outra área** do mesmo responsável como blocos ocupados, em vez de reorganizar apenas a coluna atual.
- Cards `captar` com múltiplos responsáveis: ocupação avaliada para cada responsável (principal + `additional_assignees`).

### 6. Validação
- Testar: arrastar card para coluna de colaborador já ocupado no mesmo horário (mesma área) → bloqueio; trocar responsável pelo select → bloqueio; conflito Mídia × Sistemas → bloqueio; "Reagendar para slot livre"; avanço automático de etapa por `proceedDemand`; tentativa de update direto no banco → erro do trigger.

## Detalhes técnicos
- Arquivos novos: `src/lib/scheduleOccupancy.ts`, `src/lib/reassignDemand.ts`, `src/components/kanban/ScheduleConflictModal.tsx`.
- Alterados: `KanbanCentralPage.tsx`, `TaskCard.tsx`, `AwaitingClientActions.tsx`, `proceedDemand.ts`, `areaConflicts.ts` (passa a ser fachada do novo motor), `reorderSequence.ts`.
- Banco: 1 migração (função + trigger). Sem mudança de schema de colunas.
