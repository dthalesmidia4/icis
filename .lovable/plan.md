## Objetivo

Adicionar um modo **Registro de Cards** ao Kanban Central que mostra, por colaborador, todos os cards que já passaram por ele (não só os atuais). Para isso, precisa registrar histórico real de movimentação por função operacional / responsável.

---

## 1. Nova tabela `demand_flow_history`

Migration criando:

- `id uuid pk`
- `tenant_id uuid` (fk `tenants`)
- `demand_id uuid` (fk `demands` on delete cascade)
- `from_user_id uuid null`
- `to_user_id uuid null`
- `from_function_key text null`
- `to_function_key text null`
- `action text not null` — `created | proceeded | moved_back | delivered | manual_assignment`
- `created_by uuid null`
- `created_at timestamptz default now()`
- `metadata jsonb default '{}'::jsonb`

Índices: `(tenant_id, to_user_id)`, `(demand_id, created_at desc)`.

RLS: SELECT/INSERT permitidos a quem tem acesso à tenant do card (`user_has_tenant_access` ou `super_admin`). GRANTs padrão para `authenticated` + `service_role`.

Não usar status. Não mexer em `status_id`.

---

## 2. Backfill inicial

Uma inserção derivada do estado atual das demandas ativas: para cada `demand` com `assigned_to` e/ou `current_function_key`, criar 1 linha `action = 'created'` com `to_user_id = assigned_to`, `to_function_key = current_function_key`, `created_at = COALESCE(created_at, now())`. Assim o modo já mostra algo para cards antigos, mesmo sem histórico real anterior.

---

## 3. Instrumentar transições no código

Em `src/lib/proceedDemand.ts`, adicionar um helper `recordFlowHistory(...)` e chamar em:

- `proceedDemand` — antes/depois do `update`, gravar `action='proceeded'` com `from_user_id`, `from_function_key` do estado atual e `to_user_id`, `to_function_key` do próximo passo (inclui a transição especial `enviar_cliente → aguardando_cliente` que mantém o mesmo responsável).
- `regressDemand` — mesma lógica com `action='moved_back'`.
- `deliverDemand` — `action='delivered'`, `to_user_id=null`, `to_function_key=null`.

Na criação de card (locais que já setam `assigned_to` + `current_function_key`: `createCardFromContent.ts`, criação manual em `KanbanCentralPage`, sync de period plans se aplicável), gravar `action='created'`. Em drag-and-drop que reatribui responsável manualmente, gravar `action='manual_assignment'`.

Sempre passar `tenant_id` e `created_by = auth user`.

Falha ao gravar histórico **não** deve bloquear a operação principal (log-and-continue).

---

## 4. UI: botão e modo no Kanban Central

Em `src/pages/KanbanCentralPage.tsx`:

- Adicionar toggle **Registro de Cards** no header (perto dos filtros existentes). Se existir botão antigo de status ali, substitui-lo.
- Estado `viewMode: 'active' | 'history'`.
- Modo `active`: comportamento atual inalterado (colunas por `assigned_to`, container Aguardando clientes, etc).
- Modo `history`:
  - Para cada coluna de colaborador, buscar `demand_flow_history` onde `to_user_id = colaborador` na tenant, agrupar por `demand_id` mantendo a última passagem por aquele usuário.
  - Buscar as `demands` correspondentes (mesmo que hoje estejam em outra pessoa / arquivadas recentes — decidir escopo: cards ativos + últimos 90 dias arquivados).
  - Renderizar os cards com um estilo "histórico": opacidade reduzida, borda tracejada, badge `Passou por aqui` + data da última passagem, e badge indicando onde o card está **hoje** (responsável atual + função atual).
  - Container **Aguardando clientes** é ocultado neste modo (é conceito do estado atual).
  - Cabeçalho da coluna mostra contador `X cards passaram`.

Realtime: assinar `demand_flow_history` para atualizar o modo histórico ao vivo (mesma pattern usada hoje para `demands`).

---

## 5. Fora de escopo

- Não criar status novo.
- Não alterar `status_id`, publicação automática, Demandas Completas, Conteúdo Avulso.
- Não mudar `proceedDemand`/`regressDemand` além do registro de histórico.
- Sem tela dedicada de auditoria por card nesta etapa (apenas o modo no Kanban). Pode vir depois.

---

## 6. Detalhes técnicos

- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_flow_history;`
- Backfill roda uma única vez na própria migration com `INSERT ... SELECT ... WHERE NOT EXISTS`.
- Consulta do modo histórico: `select demand_id, max(created_at) as last_seen from demand_flow_history where tenant_id = ? and to_user_id in (...) group by demand_id, to_user_id`, depois `select * from demands where id in (...)`.
- Não usar `service_role` no frontend. Toda gravação passa pela sessão do usuário com RLS.

---

## 7. Passos de execução

1. Migration: tabela + índices + RLS + GRANTs + publicação realtime + backfill.
2. Helper `recordFlowHistory` e instrumentação em `proceedDemand.ts` e nos pontos de criação/atribuição manual.
3. Toggle + modo histórico no `KanbanCentralPage.tsx` com estilo distinto e badge do estado atual.
4. Verificar build e testar fluxo: criar card → prosseguir várias vezes → voltar → entregar → alternar modos.
