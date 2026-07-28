# Corrigir cards que foram para "Sem responsável" após a migração de ontem

## Causa raiz confirmada

A migração `20260728134303` (Systemic Fix) rodou um backfill que, para cards cujo responsável não tem nenhuma função da pipeline habilitada, executou `assigned_to := NULL`. Isso atingiu 7 cards internos (`demand_type_key='outro'`, do cliente SmartVety), atribuídos a colaboradores internos (devs) que não estão configurados em `collaborator_function_assignments` porque não fazem parte do fluxo de produção. O trigger `validate_demand_stage_assignment_trg` mantém o mesmo comportamento em qualquer UPDATE futuro, então o problema volta a acontecer sozinho.

Os 7 cards afetados (todos com `updated_at = 2026-07-28 13:43:07`):
- Atividades SmartVety
- Liberar a tela Taxas para o tenant
- Agente de Vacinas
- Revisar aquisição, planos e ativação de novos tenants
- Templates de receitas
- Aprimorar a visualização da agenda em 'lista'
- Templates personalizados de anamnese

## O que fazer

### 1. Restaurar os responsáveis originais (migração de dados)

Usar `demand_flow_history` como fonte da verdade: para cada linha com `action='system_realign'`, `metadata->>'reason'='backfill'`, `to_user_id IS NULL` e `created_at = 2026-07-28 13:43:07`, reatribuir `demands.assigned_to = from_user_id` — mas apenas se o card ainda está ativo (`archived_at IS NULL`) e continua sem responsável (`assigned_to IS NULL`), para não sobrescrever nada que já foi movido manualmente.

### 2. Corrigir o trigger para nunca mais zerar `assigned_to`

Alterar `validate_demand_stage_assignment()` para:
- **Nunca** executar `NEW.assigned_to := NULL`. O responsável foi escolhido pelo usuário; o sistema não tem autoridade para removê-lo silenciosamente.
- Quando o usuário atribuído tem ao menos uma função permitida na sequência → reencaminhar `current_function_key` para uma função permitida (comportamento atual, mantido).
- Quando o usuário não tem nenhuma função permitida na sequência (típico de tarefas internas atribuídas a devs) → **preservar tanto `assigned_to` quanto `current_function_key`** e sair sem alterar. Isso trata `demand_type_key='outro'` e casos análogos como tarefas livres, não gateadas pela pipeline.

Recriar apenas a função; o trigger continua apontando para ela.

### 3. Auditoria

A view `v_demand_stage_misalignment` continua útil. Nenhuma mudança nela.

## Notas técnicas

- A alteração é feita via uma única migração (mudança de estrutura da função + UPDATE de dados dentro do bloco `DO`, na ordem: primeiro recria a função, depois roda o restore para que o trigger novo já não interfira).
- Client-side (`src/lib/initialFlowFunction.ts` — `resolveFunctionForAssignee`) já preserva o assignee quando não há função permitida (retorna a atual). Nenhuma alteração de frontend necessária.
- Os registros existentes em `demand_flow_history` permanecem como trilha de auditoria; adicionamos uma nova linha `action='system_restore'` por card restaurado, com `metadata.reason='undo_backfill_null_assignee'`.

## Fora de escopo

- Não mexer no reordenar (`reorderSequence.ts`) — ele não altera responsável.
- Não alterar regras de permissão (`collaborator_function_assignments`).
