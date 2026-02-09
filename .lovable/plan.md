

## Mover o botao "Criar Demanda" para os lugares corretos

### Situacao atual
- `/content-schedule` (CentralKanban.tsx): TEM o botao "Criar Demanda" -- **errado**
- `/schedule` (Schedule.tsx): TEM o botao "Criar Demanda" -- **correto**
- `/kanban-central` (KanbanCentralPage.tsx): NAO tem o botao -- **falta adicionar**

### O que sera feito

1. **Remover "Criar Demanda" do `/content-schedule`** (CentralKanban.tsx)
   - Remover o import do `CreateDemandModal`
   - Remover o state `isCreateModalOpen`
   - Remover o botao e o modal do JSX

2. **Adicionar "Criar Demanda" no `/kanban-central`** (KanbanCentralPage.tsx)
   - Importar o `CreateDemandModal`
   - Adicionar state para controlar a abertura do modal
   - Adicionar o botao "Criar Demanda" ao lado dos botoes existentes ("Gerenciar" e "Criar Coluna")
   - Adicionar o componente `CreateDemandModal` no JSX
   - Ao criar uma demanda, atualizar a lista de cards automaticamente

### Resultado final
- `/schedule` -- botao "Criar Demanda" presente
- `/kanban-central` -- botao "Criar Demanda" presente
- `/content-schedule` -- sem botao "Criar Demanda" (apenas exibe demandas agendadas)
