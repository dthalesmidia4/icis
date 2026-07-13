
# Diagnóstico de Realtime + Plano Seguro de Implementação

> Investigação apenas. Nada será alterado até você aprovar.

---

## 1. Situação atual

### Onde já existe subscription Supabase
| Arquivo | Tabela | Observação |
|---|---|---|
| `src/hooks/useRealtimeAttachments.tsx` | `demands` | Hook central pronto, mas subutilizado. **Não funciona hoje** porque a tabela `demands` **não está** na publication `supabase_realtime`. |
| `src/pages/KanbanCentralPage.tsx` | `demand_flow_history` | Funciona (única tabela publicada). |
| `src/components/DispatchStatusBadge.tsx` | `scheduled_publication_dispatches` | Subscribe existe + polling de 15s como fallback (porque a tabela não está publicada). |
| `src/pages/ClientHub.tsx` | `visual_identity_presets` | Não publicada — subscription silenciosamente inerte. |
| `src/pages/PlanPeriod.tsx` | `visual_identity_presets` | Idem. |
| `src/hooks/useHubPermissions.tsx` | `user_hub_permissions` | Idem. |
| `src/hooks/useColumnPermissions.tsx` | `user_column_permissions` | Idem. |
| `src/hooks/useLateDemandAlerts.tsx` | `user_late_notification_settings` | Idem. |

### Estado da publication `supabase_realtime`
Apenas **`demand_flow_history`** está habilitada. Todos os outros subscriptions do código são no-ops silenciosos.

### Padrão de dados nas telas
- Não há React Query no projeto — todas as telas usam `useState + useEffect + fetch manual` (ex.: `ApproveCards.tsx`, `RejectedCards.tsx`, `ContentHistory.tsx`, `CompletedDemands.tsx`, `ClientHub.tsx`).
- Alguns componentes usam **polling** (`DispatchStatusBadge` 15s) ou reagem só a foco/troca de cliente.
- Não existe botão "Atualizar" explícito; as telas dependem de reabrir/trocar cliente.

### Conclusão do diagnóstico
> O sistema **não tem realtime funcional** hoje, exceto para `demand_flow_history`. A infraestrutura de código existe em vários lugares, mas está inerte por falta de publication no banco.

---

## 2. Arquitetura recomendada

**Estratégia:** habilitar realtime só nas tabelas que importam + criar **hooks centralizados** que fazem *refetch seguro* nas telas (padrão MVP), evitando reescrever o modelo de estado.

### Hooks centralizados a criar em `src/hooks/realtime/`
```
useRealtimeDemands(tenantId, { clientId?, periodPlanId? }, onChange)
useRealtimePeriodPlans(tenantId, { clientId?, periodPlanId? }, onChange)
useRealtimeGeneratedContents(tenantId, clientId, onChange)
useRealtimeScheduledDispatches(tenantId, { cardId?, clientId? }, onChange)
useRealtimeQuestionSessions(tenantId, clientId, onChange)
useRealtimeStrategies(tenantId, clientId, onChange)
useRealtimeVisualIdentity(tenantId, clientId, onChange)
useRealtimeFlowConfig(tenantId, onChange)   // flow_functions + demand_type_flow_rules + collaborator_function_assignments
useRealtimeDemandFlowHistory(tenantId, { clientId?, demandId? }, onChange)
```

Regras que todo hook segue:
- Subscribe **dentro** de `useEffect`; cleanup com `supabase.removeChannel(channel)`.
- Nome do canal inclui os filtros → evita colisão quando o usuário troca de cliente.
- Filtro `tenant_id=eq.…` (e `client_id`/`period_plan_id` quando aplicável) direto na subscription — reduz tráfego e vazamento cross-cliente.
- Callback simples: `onChange(payload)` — a tela decide se dá `refetch()` completo ou merge local.
- Debounce interno de ~150ms para evitar refetch em rajada.

### Padrão de atualização por tela
| Tipo de tela | Estratégia |
|---|---|
| Kanban Central, Cronograma, Aprovar, Reprovadas, Completas, Registro | `refetch()` da lista (leve, já paginado por período/cliente). |
| Modal de card aberto | Merge do registro afetado (evita fechar/rolar). |
| Formulários (Anamnese, Planejar, Identidade) | **Não** sobrescrever campo em edição. Se `updated_at` remoto > local, mostrar banner: *"Há uma versão mais recente salva. Recarregar?"*. |
| Badges/contadores (ClientHub) | Recalcular via helpers já existentes (`periodCounts.ts`) no callback. |

---

## 3. Migration necessária (a executar na Fase 1)

Adicionar à publication `supabase_realtime` (com `REPLICA IDENTITY FULL` onde precisamos ver `old` em DELETE/UPDATE):

```
demands
period_plans
generated_contents
scheduled_publication_dispatches
question_sessions
strategies
visual_identity_presets
flow_functions
demand_type_flow_rules
collaborator_function_assignments
user_hub_permissions
user_column_permissions
user_late_notification_settings
```

`demand_flow_history` já está publicada.

> Nenhuma alteração de schema, RLS ou dados — apenas `ALTER PUBLICATION` + `ALTER TABLE ... REPLICA IDENTITY FULL`.

---

## 4. Fases de implementação

### Fase 1 — Infra + operacional crítico
1. Migration da publication (todas as tabelas listadas).
2. Criar `src/hooks/realtime/` com hooks base + helper `createRealtimeChannel`.
3. Aplicar em:
   - `KanbanCentralPage` (demands + flow_history + flow_functions + collaborator_function_assignments)
   - `TaskCard`/modal (demands + dispatches do card)
   - Badges de "Aguardando clientes" e contadores por colaborador

### Fase 2 — Planejamento e aprovação
- `ApproveCards`, `RejectedCards`, `PlanPeriod` (aviso de versão mais recente), `PeriodClientList`, `ClientHub` contadores → `period_plans` + `demands`.

### Fase 3 — Conteúdo e publicação
- `ContentHistory` → `generated_contents`.
- `Scheduled`/`DispatchStatusBadge` → remove polling de 15s.
- Cronograma do cliente → `demands` + `period_plans`.

### Fase 4 — Configurações e estratégia
- `GenerateQuestions` (anamnese, com guarda anti-sobrescrita).
- `StrategyCreation` (`strategies`).
- `VisualIdentityModal` e `ClientHub` (`visual_identity_presets`) — remove os subscribes hoje inertes.
- Modais de funções/atribuições (`flow_functions`, `demand_type_flow_rules`, `collaborator_function_assignments`).
- Permissões (`user_*_permissions`).

---

## 5. Escopo / segurança
- Todo canal filtra por `tenant_id`; telas de cliente adicionam `client_id`; telas de período adicionam `period_plan_id`.
- RLS existente já protege leitura — realtime respeita RLS, então não há risco de vazamento cross-tenant mesmo se o filtro cair.
- Cleanup obrigatório: `return () => supabase.removeChannel(channel)` em todo `useEffect`.
- Nome do canal inclui filtros → trocar de cliente derruba o antigo automaticamente.

---

## 6. Performance
- Máx. 2–4 canais por tela (agrupados por tabela, não por registro).
- Filtros server-side (`filter: tenant_id=eq.…`) reduzem broadcast.
- Debounce de 150ms + refetch idempotente evita tempestade de updates.
- Substitui o polling de 15s do `DispatchStatusBadge` → **reduz** carga atual.

---

## 7. UX de formulários
Anamnese e Planejar Período precisam de proteção específica:
- Guardar `updated_at` da última leitura.
- Em UPDATE remoto, comparar; se houver divergência **e** o usuário estiver digitando (`isDirty`), mostrar toast persistente com botão "Recarregar" em vez de sobrescrever.
- Nunca fechar modal automaticamente.

---

## 8. Riscos técnicos
1. **`REPLICA IDENTITY`**: sem `FULL`, `DELETE`/`UPDATE` não enviam a linha antiga — necessário para atualizar caches locais corretamente em algumas telas.
2. **Custo Realtime**: cada tab conectada abre WebSocket; multiplicado por usuários simultâneos. Mitigado com canais compartilhados por tela.
3. **Loops de refetch**: se um `UPDATE` disparado pela própria tela causa refetch que reescreve estado, pode piscar. Mitigado com debounce + merge por `id`.
4. **Payload grande**: tabelas como `period_plans` (com `default_plan`/`ultra_plan` JSON) podem ser pesadas — considerar escutar só o evento e refetchar campos leves.

---

## 9. Arquivos previstos (referência, não executar ainda)
Novos: `src/hooks/realtime/*.ts`, 1 migration em `supabase/migrations/`.
Editados: `KanbanCentralPage.tsx`, `TaskCard.tsx`, `ClientHub.tsx`, `ApproveCards.tsx`, `RejectedCards.tsx`, `CompletedDemands.tsx`, `ContentHistory.tsx`, `PlanPeriod.tsx`, `GenerateQuestions.tsx`, `StrategyCreation.tsx`, `Scheduled.tsx`, `DispatchStatusBadge.tsx`, `PeriodClientList.tsx`, modais de funções/atribuições/identidade visual.

---

## 10. Próximo passo
Se aprovar, começo pela **Fase 1**: migration da publication + hooks base + aplicação no Kanban Central e TaskCard. Depois validamos antes de seguir para Fase 2.
