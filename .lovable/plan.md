

## Exibir nome da empresa no card do Kanban

Nao e necessario alterar o prompt da IA. O nome da empresa ja esta disponivel nos dados (`clientName`). Basta exibi-lo no card.

### Mudancas

**1. `src/components/KanbanCard.tsx`**
- Adicionar prop `subtitle` (opcional, tipo `string`)
- Renderizar o subtitle abaixo do titulo, com estilo discreto (texto menor, cor `muted-foreground`)

**2. `src/pages/KanbanCentralPage.tsx`**
- Passar `subtitle={card.clientName}` ao componente `KanbanCard`

### Resultado visual

Cada card do Kanban exibira:
- **Titulo da demanda** (como ja esta)
- **Nome da empresa** logo abaixo, em texto menor e cinza
- **Data** no rodape

### Detalhes tecnicos

- A prop sera chamada `subtitle` para manter o componente generico e reutilizavel
- O `clientName` ja e carregado da tabela `tenant_companies` (campo `fantasy_name` ou `name`)
- Nenhuma consulta adicional ao banco e necessaria

