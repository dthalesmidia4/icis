## Ajustes finos + correção do bug "tudo virou Revisar"

### 1. Reduzir sutilmente o respiro adicionado
Em `src/pages/KanbanCentralPage.tsx`, trocar o padding do container raiz de `px-4 sm:px-6` para algo mais suave (ex.: `px-3 sm:px-4`). Continua respirando da sidebar e da borda direita, mas sem exagero.

### 2. Grupo "Em Revisão" recolhido por padrão
No mesmo arquivo (`KanbanCentralPage.tsx`), o estado do grupo "Em Revisão" hoje inicia expandido. Alterar para iniciar **recolhido** por padrão — o usuário expande manualmente clicando no header. Mantém a mesma regra de só agrupar quando houver 3+ cards em função de revisão por coluna. O grupo "Aguardando Clientes" segue com o comportamento atual (não mexer).

### 3. Diagnóstico do bug "tudo em Revisar" (confirmado)
Auditoria feita no banco (`demand_flow_history` + `demand_type_flow_rules`):

- **Criação nova está correta.** Cards criados manualmente ou via aprovação chamam `assignInitialResponsible`, que resolve corretamente a primeira função ativa por `position` respeitando as regras `required` do tipo. Exemplo verificado: dois cards "Outro" criados às 18:21 foram para `planejar` (correto), como registrado em `demand_flow_history` com `action='created'` e `to_function_key='planejar'`.
- **A regressão veio da migração de backfill anterior** (`20260720192849_...sql`), que setou `current_function_key = 'revisar'` **fixo** para todo card órfão, sem respeitar as regras por tipo. Isso empurrou dezenas de cards (inclusive os "Outro" recém-criados que estavam com key nula) para `revisar`, poluindo as colunas de responsáveis que nem têm função de revisão (Henrique, Lúcia etc.).
- **Tipo `outro` não força revisar.** As regras de fluxo para `outro` marcam como `required` apenas `planejar` e `revisar`; a primeira por `position` é `planejar` (position 0). Ou seja, novo card "Outro" deve nascer em `planejar`, não em `revisar`. O código está correto — o problema foi só o backfill.

### 4. Migração corretiva (reverter o backfill)
Nova migração SQL que:

1. Seleciona todos os cards afetados pelo backfill anterior via `demand_flow_history` onde `action = 'backfill_initial_function'` e `metadata->>'source' = 'sql_backfill_sem_etapa'`, filtrando apenas os que ainda estão em `current_function_key = 'revisar'` (para não desfazer movimentos legítimos que o usuário fez depois).
2. Para cada card, resolve a **função inicial correta** via SQL replicando a lógica de `resolveInitialFunction`:
   - Se houver regras `required` em `demand_type_flow_rules` para o `demand_type_key` do card → primeira função `required` ordenada por `flow_functions.position`.
   - Caso contrário (sem key ou sem regras) → primeira `flow_functions` ativa por `position` do tenant (tipicamente `planejar`).
3. Atualiza `current_function_key` para o valor resolvido. `assigned_to` fica como está (não mexe, para preservar quem já pegou o card).
4. Insere linha em `demand_flow_history` com `action = 'backfill_correction'` e `metadata = {source: 'sql_undo_revisar_backfill'}` para rastreabilidade.

Não altera cards que legitimamente estão em `revisar` (movidos pelos usuários ou pelo fluxo normal), pois esses não têm o registro `backfill_initial_function` correspondente.

### Detalhes técnicos
- Arquivos alterados: `src/pages/KanbanCentralPage.tsx` (padding + estado inicial do grupo Revisão) + 1 migração SQL corretiva.
- Nenhuma mudança em `assignInitialResponsible` ou nas regras de tipo — o fluxo de criação já está correto.
- Sem impacto em realtime, RLS ou contratos de dados.