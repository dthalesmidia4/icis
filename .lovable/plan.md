
# Renomear Colunas do Kanban

## Objetivo
Adicionar a funcionalidade de renomear colunas diretamente no modal "Gerenciar Colunas", sem perder nenhum conteudo (card/demanda) existente.

## Por que e seguro?
Os cards estao vinculados as colunas pelo `status_id` (ID unico), nao pelo nome. Renomear a coluna apenas altera o texto exibido, mantendo todos os cards no lugar.

## Mudancas

### `src/components/ManageColumnsModal.tsx`
1. Adicionar um icone de edicao (Pencil) ao lado do nome de cada coluna
2. Ao clicar, o nome da coluna vira um campo `Input` editavel inline
3. Ao confirmar (Enter ou blur), salvar o novo nome no banco via `supabase.from("pipeline_statuses").update({ name }).eq("id", column.id)`
4. Adicionar validacao: nome nao pode ser vazio
5. Importar `Input` de `@/components/ui/input` e `Pencil` de `lucide-react`

### Fluxo do usuario
1. Abrir "Gerenciar Colunas"
2. Clicar no icone de lapis ao lado do nome
3. Editar o texto inline
4. Pressionar Enter ou clicar fora para salvar
5. Pressionar Escape para cancelar

### Detalhes tecnicos
- Novo estado `editingColumnId` para rastrear qual coluna esta sendo editada
- Novo estado `editingName` para o valor temporario do input
- Funcao `handleSaveName` que faz o update no Supabase e chama `onSuccess()` para atualizar o Kanban
- O input tera `autoFocus` e eventos `onKeyDown` (Enter para salvar, Escape para cancelar) e `onBlur` para salvar
