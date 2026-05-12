## Plano

### Objetivo
Corrigir o mapeamento dos campos no Kanban Central para que:
- `Conteúdo` use `demands.description`
- `Instruções de Produção` use `demands.instructions` (sem o conteúdo)
- `CTA Recomendado` continue derivado do marcador `CTA:` dentro de `demands.instructions`
- Kanban Central e Histórico de Períodos passem a editar a mesma informação, sem duplicar estrutura no banco

### O que vou implementar

1. **Corrigir os mapeamentos errados nas telas que usam o TaskCard**
   - Ajustar o salvamento em `KanbanCentralPage`, `PeriodClientList` e `Scheduled` para que editar `Conteúdo` salve em `description`, e não em `instructions`.
   - Ajustar a leitura em `PeriodClientList` para que `description` venha de `demand.description`, e não de `demand.instructions`.
   - Manter a separação já existente no `TaskCard` entre `Instruções de Produção` e `CTA Recomendado` usando o split/combine do campo `instructions`.

2. **Corrigir a origem dos dados na criação de demandas a partir de períodos**
   - Revisar o fluxo que salva demandas vindas do planejamento para garantir que o conteúdo entre em `description` e que apenas instruções + CTA sejam gravados em `instructions`.
   - Isso evita que novos cards aprovados voltem a nascer concatenados.

3. **Definir a fonte de verdade sem criar novas colunas**
   - Para cards aprovados e presentes no fluxo operacional, a fonte de verdade será a tabela `demands`, usando as colunas já existentes:
     - `objective`
     - `description`
     - `instructions`
     - `observations`
   - Kanban Central e Histórico de Períodos passarão a ler e salvar esses mesmos campos.

4. **Sincronizar também o snapshot do período quando houver vínculo**
   - Quando uma demanda tiver `period_plan_id`, ao salvar no Kanban Central ou no Histórico de Períodos, atualizar também o item correspondente dentro de `period_plans.default_plan` ou `period_plans.ultra_plan` usando os campos já existentes do JSON:
     - `conteudo`
     - `instrucoes_de_producao`
     - `cta_recomendado`
   - Assim, a visualização histórica do período não fica divergente da demanda operacional.

5. **Normalizar os registros já afetados**
   - Aplicar uma correção de dados apenas nos cards vinculados a período que hoje estão com `description` vazia/nula e `instructions` contendo conteúdo + instruções + CTA concatenados.
   - A recomposição será feita a partir do JSON já existente em `period_plans`, sem criar colunas novas e sem duplicar informação.

6. **Validar o resultado**
   - Confirmar no card do exemplo que:
     - `Conteúdo` mostra apenas o bloco com “Troca de óleo...”
     - `Instruções de Produção` mostra apenas “Layout em lista...”
     - `CTA Recomendado` mostra apenas “Quer revisar um carro...”
   - Verificar edição cruzada entre Kanban Central e Histórico de Períodos no mesmo card.

### Detalhes técnicos
- **Sem migração de schema**: a estrutura atual da tabela `demands` já suporta o ajuste.
- **Problemas confirmados no código atual**:
  - `KanbanCentralPage`, `PeriodClientList` e `Scheduled` salvam `description` em `instructions`.
  - `PeriodClientList` abre o card com `description: demand.instructions`.
  - Há ao menos um registro real no banco com `description = null` e `instructions` concatenado.
- **Fonte única proposta**:
```text
period_plans (snapshot de planejamento)
        ↓ aprovação / sincronização
      demands (fonte operacional única)
        ↕
Kanban Central + Histórico de Períodos
```

### Resultado esperado
Depois disso, o Kanban Central deixa de exibir “atividade” concatenada, os campos ficam semanticamente corretos, e editar em uma tela reflete na outra usando as colunas já existentes.