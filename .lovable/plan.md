

# Vincular Demandas Manuais a Periodos

## Contexto
Demandas criadas manualmente pelo Kanban Central nao sao vinculadas a nenhum periodo (`period_plan_id = NULL`), fazendo com que nao aparecam nos cronogramas.

## Alteracoes

### 1. CreateDemandModal - Adicionar seletor de periodo

**Arquivo**: `src/components/CreateDemandModal.tsx`

- Adicionar estado `selectedPeriodPlanId` ao formulario
- Apos selecionar um cliente, buscar os periodos ativos desse cliente (`period_plans` com `company_id = clientId` e `operational_status = 'em_andamento'`)
- Exibir um Select opcional "Periodo" logo abaixo do seletor de cliente, listando os periodos com titulo e datas
- Passar o `selectedPeriodPlanId` para a RPC `create_demand_from_template` no campo `p_period_plan_id`
- Quando o modal receber `periodPlanId` via props (uso existente nos cronogramas), esconder o seletor e usar o valor da prop

### 2. KanbanCentralPage - Nenhuma alteracao necessaria

O `CreateDemandModal` ja e renderizado sem `periodPlanId`. Com a alteracao acima, o seletor de periodo aparecera automaticamente.

### 3. TaskCard - Permitir mover demanda solta para um periodo

**Arquivo**: `src/components/TaskCard.tsx`

- Quando a demanda aberta nao tiver `period_plan_id`, exibir um Select "Vincular a periodo" no topo do card
- Buscar periodos ativos do mesmo `client_id` da demanda
- Ao selecionar, fazer update na tabela `demands` setando `period_plan_id`
- Mostrar toast de confirmacao

## Detalhes Tecnicos

- Query de periodos: `supabase.from('period_plans').select('id, period_title, period_start, period_end').eq('company_id', clientId).eq('operational_status', 'em_andamento').order('period_start', { ascending: false })`
- O seletor de periodo e opcional -- a demanda pode continuar sem vinculo se o usuario preferir
- Limpar o seletor de periodo quando o cliente mudar no CreateDemandModal

