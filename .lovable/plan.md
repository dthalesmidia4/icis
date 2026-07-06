
# Melhorias na tela "Atribuir funções aos colaboradores"

Escopo restrito à UI. Nada de fluxo, status, Kanban, demandas ou publicação.

## Onde

Componente único: `src/components/CollaboratorFunctionAssignmentsModal.tsx` (aberto em Configurações → "Atribuir funções aos colaboradores"). Já lê `flow_functions`, `collaborator_function_assignments` e usa `useCollaborators` (que filtra `agency_admin/manager/user`). Aproveitar a estrutura atual e adicionar as camadas visuais.

## Mudanças

### 1. Derivar cobertura de cada função

Após carregar `functions` e `assignments`, calcular em memória (sem query extra):

```
coverage[function_key] = número de colaboradores com allowed=true
uncoveredFunctions = functions.filter(f => coverage[f.function_key] === 0)
```

Recalcula automaticamente a cada toggle (o state já reflete a mudança otimista).

### 2. Alerta no topo do modal

Acima da tabela, renderizar um `<Alert variant="destructive">` (shadcn `alert.tsx`) apenas quando `uncoveredFunctions.length > 0`:

- Título: "Configuração incompleta do fluxo"
- Corpo: "As seguintes funções ainda não têm colaborador atribuído:" + lista com os nomes (`f.name`).
- Rodapé: "Enquanto essas funções estiverem vazias, o botão Prosseguir pode travar."
- Ícone `AlertTriangle` (lucide-react).

Some sozinho assim que todas as colunas ficarem cobertas.

### 3. Destaque visual nas colunas sem colaborador

No `<th>` e em cada `<td>` da coluna correspondente, aplicar classe condicional quando `coverage[f.function_key] === 0`:

- `<th>`: fundo amarelo suave (`bg-yellow-50 dark:bg-yellow-950/30`), borda `border-yellow-400`, e um pequeno ícone `AlertTriangle` ao lado do nome.
- `<td>` da coluna: `bg-yellow-50/40 dark:bg-yellow-950/10` para reforçar visualmente a coluna inteira.
- Tooltip no `<th>`: "Nenhum colaborador atribuído a esta função".

Quando alguém marcar a primeira célula da coluna, o destaque desaparece imediatamente (é reativo ao state).

### 4. Contador por coluna (opcional, ajuda leitura)

Abaixo do nome da função no cabeçalho: pequeno badge com `coverage[function_key]` (ex.: "3 atribuídos" ou, se 0, "sem responsável" em vermelho).

### 5. Salvamento

Manter o `upsert` atual em `collaborator_function_assignments` (já usa `onConflict: "tenant_id,user_id,function_key"`, já faz optimistic update, já reverte em erro). Nada muda aqui.

### 6. Filtro de colaboradores

Já correto via `useCollaborators` (`VALID_AGENCY_ROLES = agency_admin/manager/user`). Nenhuma mudança.

## Fora do escopo

- Não tocar `proceedDemand.ts`.
- Não tocar `TaskCard.tsx`.
- Não tocar Kanban, status, demandas, publicação, agendamento.
- Não criar migrations (tabelas e colunas usadas já existem).

## Arquivos afetados

- `src/components/CollaboratorFunctionAssignmentsModal.tsx` — única edição.

## Teste manual

1. Abrir Configurações → "Atribuir funções aos colaboradores".
2. Ver alerta vermelho listando: Planejar, Criar roteiro, Criar arte, Captar, Gerar vídeo.
3. Ver essas 5 colunas destacadas em amarelo com ícone de alerta.
4. Marcar um colaborador em "Planejar" → destaque da coluna some e "Planejar" some da lista do alerta.
5. Cobrir as demais → alerta desaparece por completo.
6. Testar Prosseguir em um card com `demand_type_key` definido → agora avança normalmente.
