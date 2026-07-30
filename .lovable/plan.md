## 1. Card: campos exclusivos da área Sistemas

Em `src/components/TaskCard.tsx`, na barra de metadados do card:

- O seletor de **Origem** (Interna / Solicitação do cliente / Feedback coletado / Suporte) passa a ser renderizado apenas quando `work_area === "sistemas"` (junto com o separador "·"). Para Mídia, o valor permanece salvo como `interno` no banco, apenas deixa de aparecer.
- O seletor de **Clientes solicitantes** (`SubclientSelect`) já é condicional a Sistemas — mantido.
- O seletor de **Tipo/Nível da demanda** (Bug nível 1/2/3, etc.) hoje sempre aparece. Ele passa a listar apenas os tipos da área atual (já faz) e os itens de nível de Sistemas só existem em Sistemas; o campo "Tipo" continua visível nas duas áreas porque é ele que define o fluxo de etapas — se você quiser que ele desapareça em Mídia, é só dizer e eu escondo também.

Nada de lógica de fluxo muda: `getPipelineSequence` continua usando `origin` (interno por padrão) e `work_area`.

## 2. Navegação: Clientes Sistemas na tela inicial

- `src/lib/constants/navigation.ts`: remover os itens **Demandas Completas** (`/demandas-completas`) e **Cronograma Global** (`/cronograma-global`) e adicionar **Clientes Sistemas** apontando para `/clientes-sistemas`, usando um id de permissão existente para não quebrar o filtro de permissões (`clientes`).
- `src/pages/KanbanCentralPage.tsx`: remover o botão "Clientes Sistemas" da barra de ações da Visão Geral.
- As rotas `/demandas-completas` e `/cronograma-global` continuam existindo (acessíveis pela sidebar/links diretos), só saem dos cartões da tela inicial.

## 3. Cabeçalhos de Customer Success padronizados

A Visão Geral das Tarefas não usa `PageHeader`: ela renderiza o título dentro do próprio conteúdo (`div.mt-4 px-3 sm:px-4` → bloco flex com ícone em caixa `bg-primary/10`, `h2` em `text-xl sm:text-2xl font-bold`, badge de contagem, e botões de ação à direita). O `PageHeader` cria uma segunda barra sticky, o que gera o cabeçalho vazio e o botão "voltar" solto que você viu.

Serão convertidas para essa mesma estrutura:

- `src/pages/CustomerSuccessSistemas.tsx`
- `src/pages/SystemsClients.tsx`

Em cada uma: remover o `PageHeader`, aplicar o container `mt-4 px-3 sm:px-4`, cabeçalho inline com ícone + título + badge de contagem (clientes/registros) e as ações atuais (Novo cliente, Contato, Histórico) alinhadas à direita. A navegação de retorno fica pelo breadcrumb do layout, igual à Visão Geral e a Conteúdos Agendados.
