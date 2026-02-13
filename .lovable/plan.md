## Adicionar Botoes da Home na Sidebar

### Objetivo

Centralizar os itens de navegacao da Home e da Sidebar em uma unica fonte de dados, garantindo que qualquer novo botao adicionado na Home automaticamente apareca na sidebar.

### Abordagem

**1. Criar arquivo centralizado de navegacao**

Novo arquivo `src/lib/constants/navigation.ts` que exporta a lista de itens principais (os mesmos cards da Home):

```
- Cadastrar Cliente (UserPlus, /registration)
- Cadastros de Clientes (ClipboardList, /cadastros-clientes)
- Kanban Central (LayoutGrid, /kanban-central)
- Minha Empresa (Briefcase, /minha-empresa) -- condicional a agencyId
- Perguntas Guias (FileText, /guide)
- Estrategias (Lightbulb, /strategy-clients)
- Cronograma (CalendarDays, /schedules)
- Agendamento de Conteudos (CalendarDays, /scheduled)
- Gerenciar Legado (Building2, /clientes) -- adminOnly
```

Cada item tera: `id` (HubSectionId), `title`, `icon`, `route`, `adminOnly?`, `requiresAgency?`.

**2. Atualizar `Home.tsx**`

Importar a lista centralizada em vez de definir `allActionCards` localmente. A logica de filtragem por permissoes permanece igual.

**3. Atualizar `AppSidebar.tsx**`

- Substituir o array `mainMenuItems` fixo pela lista centralizada.
- Manter "Home" como primeiro item fixo (nao e um card da Home, e o proprio link para ela).
- Adicionar os itens da lista centralizada logo abaixo.
- No desktop (sidebar icon-only de 64px), cada item aparece como icone com tooltip.
- No mobile, cada item aparece com icone + texto.
- Aplicar a mesma logica de filtragem: `adminOnly` so para admins, `requiresAgency` so quando ha agencyId.

**4. Padrao automatico**

Como Home e Sidebar consomem a mesma lista, adicionar um novo item ou remover em `navigation.ts` faz ele aparecer ou deseparecer em ambos automaticamente -- sem precisar editar dois arquivos.

### Detalhes Tecnicos

- O arquivo `navigation.ts` exporta um array tipado e uma funcao helper `getNavigationItems(options: { agencyId?, role? })` que retorna os itens filtrados.
- Os hooks de permissao (`useHubPermissions`, `useAgencyRole`) continuam sendo chamados nos componentes, nao na constante.
- O item "Home" permanece hardcoded na sidebar (nao faz sentido como card na Home).
- O menu Developer permanece separado na sidebar.
- Arquivos alterados: `src/lib/constants/navigation.ts` (novo), `src/pages/Home.tsx`, `src/components/AppSidebar.tsx`.