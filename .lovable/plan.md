

# Remover rota /schedule e redirecionar para Kanban Central

## Contexto

A rota `/schedule` e uma visualizacao read-only de demandas por cliente/periodo, separada do Kanban Central (`/kanban-central`). O Kanban Central ja possui filtro por cliente e todas as funcionalidades de gestao. O objetivo e eliminar `/schedule` e redirecionar tudo para o Kanban Central.

## Mudancas

### 1. Redirecionar navegacoes de /schedule para /kanban-central

**`src/pages/PlanPeriod.tsx`** - 3 locais onde navega para `/schedule?periodPlanId=...`:
- Apos confirmar planejamento (linha ~475): redirecionar para `/kanban-central`
- Botao "Ver Demandas" (linha ~971): redirecionar para `/kanban-central`
- Botao "Ver no Kanban" no historico (linha ~1165): redirecionar para `/kanban-central`
- Nota: o `periodPlanId` nao sera mais passado como query param, pois o Kanban Central ja mostra todas as demandas e tem filtro por cliente

### 2. Atualizar ClientHub

**`src/pages/ClientHub.tsx`**:
- O card "Demandas" (linha ~82) aponta para `/schedule` - redirecionar para `/kanban-central`
- A funcao `handleDemandasClick` (linha ~49) navega para `/schedule` com state - simplificar para navegar para `/kanban-central`

### 3. Remover a rota /schedule

**`src/App.tsx`**:
- Remover a rota `/schedule` (linhas 128-136)
- Remover o import de `Schedule` (linha 27)

### 4. Atualizar sidebar

**`src/components/AppSidebar.tsx`**:
- Mudar o item "Demandas" de `/schedule` para `/kanban-central` (linha 62)

### 5. Atualizar breadcrumbs

**`src/hooks/useBreadcrumb.tsx`**:
- Remover a entrada `/schedule` (linha ~72)

### 6. Limpar main.tsx

**`src/main.tsx`**:
- Remover o fix de URL encoded para `/schedule%3F` (linhas ~5-7 e logica associada)

### 7. Excluir arquivo

**`src/pages/Schedule.tsx`** - pode ser deletado, pois nao sera mais utilizado

## Impacto

- Todas as demandas passam a ser gerenciadas exclusivamente pelo Kanban Central
- O filtro por cliente ja existente no Kanban Central substitui a filtragem por periodo que existia no `/schedule`
- Nenhuma mudanca no banco de dados
- O `/scheduled` (Agendamento de Conteudos) permanece intacto

