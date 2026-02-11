

# Preservar "Gerenciar Clientes" apenas para Admins

## Objetivo
Manter o fluxo legado de "Gerenciar Clientes" (lista de clientes -> Hub do Cliente -> sub-páginas) funcional, mas restrito apenas a administradores. Usuários comuns e gestores usarao os novos fluxos diretos (Cadastros, Guias, Estrategias, Periodos).

## Mudancas

### 1. Home - Esconder o card para nao-admins
No arquivo `src/pages/Home.tsx`, adicionar uma flag `adminOnly: true` ao card "Gerenciar Clientes" e filtrar na renderizacao para que apenas `super_admin` e `agency_admin` vejam esse card.

### 2. Rotas - Restringir acesso
No `src/App.tsx`, ajustar as rotas `/clientes`, `/clientes/:id` e `/client-hub` para permitir apenas `agency_admin` (removendo `agency_manager` onde aplicavel):
- `/clientes` - de `['agency_admin', 'agency_manager']` para `['agency_admin']`
- `/clientes/:id` - de `['agency_admin', 'agency_manager']` para `['agency_admin']`
- `/client-hub` - adicionar `RequireRole` com `['agency_admin']`

### 3. ClientHub - Padronizar cores
Aproveitar para atualizar os cards do ClientHub para usar `bg-primary` em vez de gradientes hardcoded, mantendo consistencia visual com o resto do app.

## Detalhes tecnicos

**Arquivos modificados:**
- `src/pages/Home.tsx` - Adicionar propriedade `adminOnly` ao card e logica de filtragem
- `src/App.tsx` - Ajustar `RequireRole` nas 3 rotas
- `src/pages/ClientHub.tsx` - Atualizar estilos para usar cores do tema

**Impacto:**
- Gestores (`agency_manager`) perdem acesso ao fluxo legado mas continuam usando os novos fluxos diretos
- Super admins e agency admins mantem acesso total
- Nenhuma mudanca no banco de dados

