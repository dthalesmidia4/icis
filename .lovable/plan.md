## Objetivo
Padronizar a tela de **Foco do Colaborador** (`/colaboradores/:userId`) para seguir a mesma estrutura visual/breadcrumb já aplicada em "Visão Geral" e "Agendamentos".

## Mudanças

### 1. Breadcrumb — `src/hooks/useBreadcrumb.tsx`
Adicionar suporte à rota dinâmica `/colaboradores/:userId`, gerando:

`Home > Visão Geral > Demandas de {nome}`

Como o breadcrumb hoje é baseado em `routeConfig` estático, incluir um match parcial semelhante ao já feito para `/clientes/:id`:

- Se `path.startsWith('/colaboradores/')`, retornar itens:
  - `Home` → `/home`
  - `Visão Geral` → `/kanban-central` (ícone `LayoutGrid`)
  - `Demandas de {collaboratorName}` (ícone `User`)

O nome do colaborador virá de um contexto leve: expor pelo próprio `CollaboratorDemands.tsx` o nome via `document.title` já não serve. A abordagem mais simples e consistente com o padrão atual é adicionar um estado global leve (ex.: reutilizar `SelectedClientContext` não cabe aqui). Solução escolhida: aceitar placeholder `{collaboratorName}` no breadcrumb e resolvê-lo a partir de um novo contexto minúsculo `PageTitleContext` (ou, mais simples, ler direto do DOM). 

Abordagem final (mais simples): **passar o nome via `history state`** já disponível quando o usuário clica em "Modo foco" no Kanban, e adicionalmente fazer o próprio `useBreadcrumb` aceitar override via um novo hook `useBreadcrumbOverride(label)` que a página chama com o nome carregado do Supabase. Isso mantém o breadcrumb correto mesmo em reload direto na URL.

### 2. Página — `src/pages/CollaboratorDemands.tsx`
Substituir o bloco atual (BackButton solto + título centralizado) pelo mesmo padrão de header usado em `KanbanCentralPage.tsx` e `Scheduled.tsx`:

```tsx
<div className="mt-4 px-3 sm:px-4">
  <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg">
        <User className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-foreground">
        Demandas de {collaboratorName}
      </h2>
      <Badge variant="secondary">
        {totalCards} {totalCards === 1 ? 'demanda' : 'demandas'}
      </Badge>
    </div>
    {/* espaço reservado para futuras ações à direita */}
  </div>
  ...
</div>
```

- Remover o `BackButton` solto (a navegação passa a ser feita pelo breadcrumb do Layout, igual às outras telas).
- Remover a linha secundária centralizada (`collaboratorRole • Cards atribuídos…`); o papel pode virar um `Badge` discreto ao lado do título para preservar a informação sem quebrar o padrão.
- Ajustar o container para `container` do Layout (remover `max-w-7xl mx-auto` se o Layout já provê), mantendo consistência com Visão Geral.

### 3. Registrar override do título
Chamar `useBreadcrumbOverride({ collaboratorName })` (ou equivalente) após carregar o profile, para que o breadcrumb renderize "Demandas de João" em vez do placeholder.

## Detalhes técnicos
- Novo contexto mínimo `BreadcrumbOverrideContext` com `{ values, setValues }`, provider no `Layout`. `useBreadcrumb` substitui `{collaboratorName}` da mesma forma que já faz com `{clientName}`.
- Manter tipos existentes de `BreadcrumbItem`.
- Não alterar lógica de fetch, ordenação, tabela, cards ou realtime.

## Fora de escopo
- Alterar comportamento do botão "Modo foco" no Kanban.
- Mudar dados exibidos na tabela.
