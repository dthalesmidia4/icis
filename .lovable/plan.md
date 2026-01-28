
# Plano de Melhorias de Navegacao do Sistema

## Visao Geral

Este plano aborda 4 melhorias principais para reduzir a quantidade de cliques necessarios para acessar funcionalidades especificas do sistema:

1. **Seletor Global de Cliente** - Permite trocar de cliente de qualquer pagina
2. **Breadcrumbs de Navegacao** - Mostra a hierarquia atual e permite navegacao rapida
3. **Sidebar Expandida** - Menu lateral com submenus contextuais
4. **Unificacao dos Kanbans** - Consolidar /content-schedule e /kanban-central

---

## Fase 1: Seletor Global de Cliente

### Objetivo
Criar um componente de selecao de cliente persistente no header que permita trocar de cliente sem navegar de volta para a lista.

### Componentes a Criar

**1.1 GlobalClientSelector.tsx**
- Dropdown com lista de clientes do tenant
- Exibe cliente atualmente selecionado (nome fantasia ou razao social)
- Permite busca rapida dentro do dropdown
- Mostra indicador visual quando nenhum cliente esta selecionado
- Integrado com SelectedClientContext existente

### Alteracoes Necessarias

**Layout.tsx**
- Adicionar header persistente com GlobalClientSelector
- Manter header visivel em todas as paginas protegidas

**AppSidebar.tsx**
- Integrar GlobalClientSelector no header do sidebar (desktop)
- Adicionar ao MobileHeader (mobile)

### Fluxo de Usuario Melhorado
```text
ANTES: Home -> Clientes -> Selecionar Cliente -> Client Hub
DEPOIS: Clicar no seletor de cliente (qualquer pagina) -> Selecionar -> Automaticamente no Client Hub
```

---

## Fase 2: Sistema de Breadcrumbs

### Objetivo
Implementar breadcrumbs dinamicos que mostrem a localizacao atual do usuario e permitam navegacao rapida para niveis superiores.

### Componentes a Criar

**2.1 NavigationBreadcrumb.tsx**
- Componente reutilizavel que interpreta a rota atual
- Mostra hierarquia: Home > Clientes > [Nome Cliente] > [Pagina Atual]
- Links clicaveis para navegacao rapida
- Responsivo (colapsa em mobile)

**2.2 useBreadcrumb.tsx (hook)**
- Logica para determinar breadcrumbs baseado em:
  - Rota atual (useLocation)
  - Cliente selecionado (useSelectedClient)
  - Contexto da pagina

### Mapeamento de Rotas para Breadcrumbs

| Rota | Breadcrumb |
|------|------------|
| /home | Home |
| /clientes | Home > Clientes |
| /clientes/:id | Home > Clientes > [Nome Cliente] |
| /client-hub | Home > Clientes > [Nome Cliente] > Hub |
| /client-guide | Home > Clientes > [Nome Cliente] > Perguntas Guias |
| /strategies | Home > Clientes > [Nome Cliente] > Estrategia |
| /plan-period | Home > Clientes > [Nome Cliente] > Periodos |
| /schedule | Home > Clientes > [Nome Cliente] > Demandas |
| /kanban-central | Home > Kanban Central |

### Alteracoes Necessarias

**Layout.tsx**
- Adicionar NavigationBreadcrumb abaixo do header
- Renderizar condicionalmente (nao mostrar em /home)

---

## Fase 3: Sidebar Expandida com Submenus

### Objetivo
Redesenhar o sidebar para incluir mais itens de navegacao direta e submenus contextuais que aparecem quando um cliente esta selecionado.

### Nova Estrutura do Menu

```text
Sidebar (Desktop - 64px icones, expandido 220px)
|
+-- Home (sempre visivel)
+-- Kanban Central (sempre visivel)
+-- Clientes (sempre visivel)
|   +-- [Lista rapida dos ultimos 5 clientes]
|   +-- Ver todos...
|
+-- Cliente Atual (visivel se cliente selecionado)
|   +-- Hub do Cliente
|   +-- Perguntas Guias
|   +-- Estrategia
|   +-- Periodos
|   +-- Demandas
|
+-- Developer (admin only)
```

### Componentes a Modificar

**AppSidebar.tsx**
- Adicionar Collapsible para submenu de clientes
- Adicionar secao "Cliente Atual" que aparece quando selectedClient existe
- Usar SidebarGroup com estado controlado (open/onOpenChange)
- Manter funcionalidade de tooltips no modo colapsado

### Comportamento

- **Desktop**: Sidebar sempre visivel (64px), expande ao hover ou clique
- **Mobile**: Sheet lateral com todos os menus expandidos
- **Submenu Cliente Atual**: Aparece automaticamente quando um cliente e selecionado

---

## Secao Tecnica: Detalhes de Implementacao

### 1. GlobalClientSelector

```typescript
// Estrutura do componente
interface GlobalClientSelectorProps {
  className?: string;
  compact?: boolean; // Para mobile
}

// Integracao com contextos existentes
const { selectedClient, setSelectedClient } = useSelectedClient();
const { tenantId } = useTenant();

// Query para buscar clientes
const { data: clients } = useQuery({
  queryKey: ['tenant-clients-selector', tenantId],
  queryFn: async () => {
    const { data } = await supabase
      .from('tenant_companies')
      .select('id, name, fantasy_name, cnpj_cpf, email')
      .eq('tenant_id', tenantId)
      .order('name');
    return data;
  }
});
```

### 2. NavigationBreadcrumb

```typescript
// Hook useBreadcrumb
const breadcrumbMap: Record<string, BreadcrumbConfig> = {
  '/home': { items: [{ label: 'Home', href: '/home' }] },
  '/clientes': { 
    items: [
      { label: 'Home', href: '/home' },
      { label: 'Clientes', href: '/clientes' }
    ]
  },
  '/client-hub': {
    items: [
      { label: 'Home', href: '/home' },
      { label: 'Clientes', href: '/clientes' },
      { label: '{clientName}', href: '/client-hub' } // Dinamico
    ]
  }
  // ...
};
```

### 3. Sidebar Expandida

```typescript
// Nova estrutura de menu items
const menuStructure = {
  main: [
    { title: "Home", url: "/home", icon: Home },
    { title: "Kanban Central", url: "/kanban-central", icon: LayoutGrid }
  ],
  clientManagement: {
    title: "Clientes",
    icon: Users,
    items: [/* lista dinamica */],
    adminOnly: true
  },
  currentClient: {
    title: "Cliente Atual",
    icon: Building2,
    showWhen: (ctx) => !!ctx.selectedClient,
    items: [
      { title: "Hub", url: "/client-hub", icon: Target },
      { title: "Perguntas", url: "/client-guide", icon: FileText },
      { title: "Estrategia", url: "/strategies", icon: Lightbulb },
      { title: "Periodos", url: "/plan-period", icon: Calendar },
      { title: "Demandas", url: "/schedule", icon: ListTodo }
    ]
  }
};
```

---

## Ordem de Implementacao

1. **Fase 1**: GlobalClientSelector (1 sessao)
   - Criar componente
   - Integrar no Layout/Sidebar

2. **Fase 2**: Breadcrumbs (1 sessao)
   - Criar hook useBreadcrumb
   - Criar componente NavigationBreadcrumb
   - Integrar no Layout

3. **Fase 3**: Sidebar Expandida (1-2 sessoes)
   - Refatorar AppSidebar com submenus
   - Adicionar secao "Cliente Atual"
   - Testar responsividade

---

## Impacto na Experiencia do Usuario

### Antes (clicks para acessar demandas de um cliente):
```text
Home (1) -> Clientes (2) -> Selecionar Cliente (3) -> Client Hub (4) -> Demandas (5)
Total: 5 cliques
```

### Depois:
```text
Opcao A: Clicar no seletor de cliente (1) -> Selecionar (2) -> Menu Demandas (3)
Total: 3 cliques

Opcao B: Submenu Cliente Atual no sidebar -> Demandas (1)
Total: 1 clique (se cliente ja selecionado)
```

### Reducao: 40-80% menos cliques para acoes frequentes
