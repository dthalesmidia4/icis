

## Plano: Adicionar filtro por mês/ano na listagem de Contas a Pagar

### O que muda
Adicionar dois selects (mês e ano) acima da tabela em `BillsList.tsx`. A query ao Supabase será filtrada pelo período selecionado, usando `gte` e `lt` na coluna `due_date`. O filtro inicia no mês/ano atual por padrão.

### Alterações em `src/pages/BillsList.tsx`

1. **Novo estado**: `selectedMonth` (0-11, default: mês atual) e `selectedYear` (default: ano atual)

2. **Filtro na query**: Calcular primeiro e último dia do mês selecionado e adicionar `.gte("due_date", firstDay).lt("due_date", lastDay)` na query existente

3. **UI do filtro**: Dois `<Select>` (componente shadcn) lado a lado, entre o header e a tabela:
   - Mês: Janeiro a Dezembro
   - Ano: lista dinâmica (ano atual - 2 até ano atual + 1)

4. **Re-fetch ao mudar filtro**: Adicionar `selectedMonth` e `selectedYear` como dependências do `useEffect`

5. **Atualizar subtítulo**: Mostrar "Contas de Janeiro/2026" ao invés de "Todas as contas cadastradas"

### Nenhuma alteração de banco de dados necessária

A filtragem usa a coluna `due_date` já existente.

