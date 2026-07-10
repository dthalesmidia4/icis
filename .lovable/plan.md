
# Real Time instantâneo — Diagnóstico e Plano

## 1. Diagnóstico (o que existe hoje)

### Realtime já usado no código
| Arquivo | Tabela escutada | Observação |
|---|---|---|
| `src/hooks/useRealtimeAttachments.tsx` | `demands` (INSERT/UPDATE/DELETE) | Hook central já pronto, filtra por `tenant_id` ou `period_plan_id`. |
| `src/pages/KanbanCentralPage.tsx` | `demand_flow_history` | Modo "Registro de Cards". |
| `src/pages/ClientHub.tsx` | `visual_identity_presets` | Liberar botão Planejar Período. |
| `src/pages/PlanPeriod.tsx` | `visual_identity_presets` | Guard da rota. |
| `src/components/DispatchStatusBadge.tsx` | `scheduled_publication_dispatches` | Por card. |
| `src/hooks/useHubPermissions.tsx` | `user_hub_permissions` | |
| `src/hooks/useColumnPermissions.tsx` | `user_column_permissions` | |
| `src/hooks/useLateDemandAlerts.tsx` | `demands` | Alertas de atraso. |

### 🚨 Achado crítico
A publication `supabase_realtime` contém **apenas `demand_flow_history`**.

Todos os outros `on('postgres_changes', ...)` acima **não estão recebendo eventos** — subscrevem, mas o banco nunca publica. Isso explica por que várias telas parecem "não atualizar sozinhas". Precisamos habilitar as tabelas via `ALTER PUBLICATION supabase_realtime ADD TABLE ...` antes de qualquer hook novo funcionar.

### Padrão de dados hoje
- Sem React Query. Cada página usa `useState` + `useEffect` + funções `fetchX()`/`loadY()`.
- Atualização acontece por chamadas manuais após ações locais (`await load()` depois de salvar).
- Sem invalidação global, sem store — logo, telas de outros usuários ficam paradas.
- Alguns botões "Atualizar" existem (Kanban, Aprovar, Histórico).

### Telas × tabelas (mapa consolidado)
| Tela | Tabelas fonte |
|---|---|
| Kanban Central | `demands`, `demand_flow_history`, `profiles`, `flow_functions`, `collaborator_function_assignments` |
| TaskCard / modal demanda | `demands`, `demand_flow_history`, `scheduled_publication_dispatches` |
| Aprovar Produção / Reprovadas | `period_plans` (jsonb `default_plan` / `ultra_plan` / `rejected_plan`), `demands` |
| Cronograma Atual (PlanPeriod view) | `period_plans`, `demands`, `pipeline_statuses`, `flow_functions` |
| Conteúdos Agendados (Scheduled) | `scheduled_publication_dispatches`, `demands` |
| Histórico de Criações | `generated_contents` |
| Anamnese | `question_sessions` |
| Estratégia Geral | `strategies` |
| Identidade Visual | `visual_identity_presets`, `company_mascot_images`, `tenant_companies` |
| Config de Funções | `flow_functions`, `demand_type_flow_rules`, `collaborator_function_assignments` |
| Demandas Completas | `demands` |
| Registro de Cards | `demand_flow_history`, `demands`, `profiles` |
| Contadores/badges do Hub | `period_plans` + `demands` (via `periodCounts.ts`) |

## 2. Arquitetura recomendada

**Padrão único:** hooks centrais em `src/hooks/realtime/*` que abrem **um canal por (tabela, escopo)**, com filtro Postgres e callback simples de refetch. Sem React Query no MVP — mantemos o padrão atual (`useState` + função `refetch`) e o hook apenas chama `onChange()`.

```
src/hooks/realtime/
  useRealtimeTable.ts          // primitivo genérico (tabela, filter, events, onChange)
  useRealtimeDemands.ts        // wrap p/ demands por tenant/client/period
  useRealtimePeriodPlans.ts
  useRealtimeGeneratedContents.ts
  useRealtimeScheduledDispatches.ts
  useRealtimeQuestionSessions.ts
  useRealtimeStrategies.ts
  useRealtimeVisualIdentity.ts
  useRealtimeFlowConfig.ts     // flow_functions + demand_type_flow_rules + collaborator_function_assignments (canal único)
  useRealtimeDemandFlowHistory.ts
```

Regras:
- Sempre `useEffect` + `removeChannel` no cleanup.
- Nome de canal determinístico: `rt:<table>:<tenant>[:<client>[:<period>]]` para permitir dedupe.
- Debounce de 250 ms no callback para evitar tempestade de refetch quando várias linhas mudam.
- Escopo obrigatório por `tenant_id`; adicionar `client_id`/`period_plan_id` quando a tela for específica.
- Nada de sobrescrever formulário em edição: telas de formulário (Anamnese, PlanPeriod, modal demanda) usam realtime **só para mostrar aviso** "Há uma versão mais recente. Recarregar?" — nunca reidratam sozinhas.
- Realtime **não fecha modais** nem reseta scroll. Só chama `refetch()` da lista pai.

## 3. Migrations necessárias (Supabase)

Habilitar realtime (única migration para todas as fases, ou fatiada por fase):

```sql
ALTER TABLE public.demands REPLICA IDENTITY FULL;
ALTER TABLE public.period_plans REPLICA IDENTITY FULL;
ALTER TABLE public.generated_contents REPLICA IDENTITY FULL;
ALTER TABLE public.scheduled_publication_dispatches REPLICA IDENTITY FULL;
ALTER TABLE public.question_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.strategies REPLICA IDENTITY FULL;
ALTER TABLE public.flow_functions REPLICA IDENTITY FULL;
ALTER TABLE public.demand_type_flow_rules REPLICA IDENTITY FULL;
ALTER TABLE public.collaborator_function_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.visual_identity_presets REPLICA IDENTITY FULL;
ALTER TABLE public.company_mascot_images REPLICA IDENTITY FULL;
ALTER TABLE public.user_hub_permissions REPLICA IDENTITY FULL;
ALTER TABLE public.user_column_permissions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.demands, public.period_plans, public.generated_contents,
  public.scheduled_publication_dispatches, public.question_sessions,
  public.strategies, public.flow_functions, public.demand_type_flow_rules,
  public.collaborator_function_assignments, public.visual_identity_presets,
  public.company_mascot_images, public.user_hub_permissions,
  public.user_column_permissions;
-- demand_flow_history já está.
```

## 4. Fases de implementação

**Fase 1 — Operacional crítico**
- Habilitar realtime em `demands`, `demand_flow_history`, `flow_functions`, `collaborator_function_assignments`.
- Criar `useRealtimeDemands` e `useRealtimeDemandFlowHistory`.
- Aplicar em `KanbanCentralPage`, `TaskCard`/modal, `CollaboratorDemands`, `CompletedDemands`.
- Recalcular contadores por coluna/colaborador via callback.

**Fase 2 — Planejamento e aprovação**
- Habilitar `period_plans`.
- Criar `useRealtimePeriodPlans`.
- Aplicar em `ApproveCards`, `RejectedCards`, `PlanPeriod` (Cronograma Atual), badges do `ClientHub` (`periodCounts`).

**Fase 3 — Conteúdo e publicação**
- Habilitar `generated_contents`, `scheduled_publication_dispatches`.
- Criar `useRealtimeGeneratedContents`, `useRealtimeScheduledDispatches`.
- Aplicar em `ContentHistory`, `Scheduled`/`Kanban`, `DispatchStatusBadge` (já usa, passa a funcionar).

**Fase 4 — Config e estratégia**
- Habilitar `question_sessions`, `strategies`, `visual_identity_presets`, `company_mascot_images`, `flow rules`.
- Hooks nos módulos Anamnese (só aviso), Estratégia, Identidade Visual, Settings (funções e atribuições).

## 5. Riscos e mitigação
- **Custo/carga Realtime:** um canal por tabela+escopo, debounce, cleanup rigoroso. Sem canal em nível de item quando já existe canal de lista.
- **RLS:** os `SELECT` do subscriber respeitam RLS; conferir que policies existentes permitem leitura para os papéis certos (já OK hoje).
- **Formulários em edição:** realtime nunca reidrata; só banner "recarregar".
- **Loops de refetch:** debounce + comparar `updated_at` antes de setState.
- **REPLICA IDENTITY FULL:** aumenta WAL; aceitável para as tabelas listadas (volume moderado).
- **Multi-tenant:** filtro `tenant_id=eq.<id>` no `postgres_changes` obrigatório em todo hook.

## 6. Entregáveis desta investigação
Nenhum código alterado. Próximo passo (quando aprovado): executar Fase 1 (migration de publication + `useRealtimeDemands` + integração no Kanban Central).
