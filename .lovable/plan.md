# Fase 0 + Fase 1 — Real Time Instantâneo

Fase 0 (banco) já foi executada: publisher `supabase_realtime` recebeu `demands`, `demand_flow_history`, `flow_functions`, `demand_type_flow_rules`, `collaborator_function_assignments`, `pipeline_statuses`, `profiles`, `user_roles`, e `REPLICA IDENTITY FULL` foi aplicado em `demands` e `demand_flow_history`.

Falta o código. Aprove para prosseguir com as edições abaixo.

## 1. Hooks centralizados (novos arquivos)

Pasta `src/hooks/realtime/`:

- **`_shared.ts`** — `useDebouncedCallback(fn, delay=200)`, cancela no unmount.
- **`useRealtimeDemands.ts`** — assina `demands` com filtro server-side `tenant_id=eq.<id>`; aplica filtros locais opcionais `clientId`, `periodPlanId`, `assignedTo` (considera `old` e `new` para captar entrada/saída do colaborador). Callback `onChange({type, id, new, old})`. Um canal por escopo, cleanup com `removeChannel`.
- **`useRealtimeDemandFlowHistory.ts`** — assina apenas `INSERT` em `demand_flow_history`, filtro server-side por tenant, filtro local por `demandId`/`clientId`.
- **`useRealtimeFlowConfig.ts`** — um canal único agregando `flow_functions`, `demand_type_flow_rules`, `collaborator_function_assignments` (filtrados por tenant). Callback debounced.
- **`index.ts`** — reexports.

O `useRealtimeAttachments` existente é mantido intacto (usado em `CompletedDemands` e `Scheduled`, fora do escopo desta fase).

## 2. `KanbanCentralPage.tsx`

- Substituir o canal inline `dfh-realtime` (linhas ~669–685) por `useRealtimeDemandFlowHistory` chamando `fetchHistory` só quando `viewMode === "history"`.
- Adicionar `useRealtimeFlowConfig` chamando `fetchColumns()` (colunas de colaborador dependem de `flow_functions`/atribuições).
- Manter `useRealtimeAttachments` como está — já cobre INSERT/UPDATE/DELETE de `demands` e alimenta `handleDemandFullUpdate`. A seção **Aguardando Clientes** já reage automaticamente porque depende de `current_function_key`, que faz parte do payload.
- Em `handleDemandFullUpdate`, quando `selectedCard?.id === demandId` e o modal está aberto, disparar `sonnerToast.info("Este card foi atualizado por outro usuário.")` uma vez por evento (rate limit por ref) — dados continuam sendo atualizados no estado, mas o usuário é avisado.

## 3. `CollaboratorDemands.tsx`

- Adicionar `useRealtimeDemands({ tenantId, assignedTo: userId, onChange })`.
- `onChange` chama uma versão debounced (200ms) de `fetchData()`. Assim entram/saem cards do colaborador automaticamente.

## 4. `TaskCard.tsx`

- Sem mudança estrutural. O componente é controlado (`card` vem por prop), portanto atualizações externas já refletem quando o pai atualiza `selectedCard`. O aviso ao usuário é disparado pelo pai (item 2).

## 5. Regras aplicadas

- **Escopo**: filtro server-side por `tenant_id` em todos os canais; filtros extras (`client_id`, `period_plan_id`, `assigned_to`) no callback para evitar vazamento entre clientes.
- **Cleanup**: todo `useEffect` retorna `supabase.removeChannel(channel)`.
- **Sem duplicidade**: `useRealtimeAttachments` no Kanban não é duplicado — apenas o canal do histórico é migrado.
- **Sem mexer** em ApproveCards, RejectedCards, CompletedDemands, ContentHistory, Scheduled, GenerateQuestions, StrategyCreation, VisualIdentity, TeamMembers, FunctionPermissionsModal, CollaboratorFunctionAssignmentsModal.
- **Sem mudança de regra de negócio**: nenhuma edição em `proceedDemand`, `regressDemand`, criação de cards, aprovação, publicação, agendamento.

## 6. Arquivos alterados/criados

Criados:
- `src/hooks/realtime/_shared.ts`
- `src/hooks/realtime/useRealtimeDemands.ts`
- `src/hooks/realtime/useRealtimeDemandFlowHistory.ts`
- `src/hooks/realtime/useRealtimeFlowConfig.ts`
- `src/hooks/realtime/index.ts`

Editados:
- `src/pages/KanbanCentralPage.tsx` (substitui canal DFH inline + adiciona flow config + toast no modal)
- `src/pages/CollaboratorDemands.tsx` (assina demandas do colaborador)

## 7. Checklist de validação (duas abas)

- Kanban: prosseguir/voltar/entregar em uma aba reflete na outra.
- Aguardando Clientes: card entra/sai do container sem refresh.
- Registro de Cards: contadores e cards atualizam ao registrar novo histórico.
- Modal aberto: não fecha; título/status atualizam; toast avisa.
- Troca de cliente/colaborador: canal antigo é removido; sem vazamento.
