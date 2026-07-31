# Auditoria: o que está pronto e o que ficou solto

## Correção da minha premissa anterior
Henrique **tem** `revisar` em Mídia (`allowed = true`) e também em Sistemas. Não falta revisor de Mídia. A pergunta anterior estava errada.

## Parte A — Isolamento Mídia × Sistemas: 85% pronto
Confirmado funcionando (verificado em banco e código):
- `collaborator_function_assignments` tem `work_area`; dados coerentes por área.
- `flow_functions` separado por área (Mídia com 14 etapas, Sistemas com 11).
- Filtro por área presente em `pickAssigneeForFunction`, `resolveFunctionForAssignee`, `fetchAllowedUsersForFunction`, `userHasFunction`, `getPipelineSequence` (parte de `flow_functions`), `loadDurationsForTenant`.
- Triggers `validate_demand_stage_assignment` e `resolve_function_for_assignee` já filtram por área.

### Pontas soltas confirmadas (A1–A6)
1. `getPipelineSequence` (`src/lib/proceedDemand.ts:692-696`): a consulta de `demand_type_flow_rules` **não** filtra `work_area`, embora a de `flow_functions` ao lado filtre. Hoje nenhum `demand_type_key` colide entre áreas, mas `outro` pode passar a existir nas duas e quebrar a sequência.
2. `KanbanCentralPage.tsx:1119`: `fetchAllowedUsersForFunction(tenantId, "aguardando_cliente")` sem área → sempre valida contra Mídia; cards de Sistemas em espera aparecem com aviso falso de "responsável sem a função".
3. `reassignDemand.ts:79`: `userHasFunction(tenantId, user, currentKey)` sem área → transferência valida contra a área errada.
4. `usePendingEvaluationCards.ts:60-65`: busca `function_key = 'avaliar'` sem área.
5. `assignInitialResponsible` sem `workArea` em `evaluatePlanCard.ts:104` e `ApproveCards.tsx:301` → cards aprovados/avaliados nascem sempre como Mídia.
6. Edge functions: `run-scheduled-dispatches` (`:307-312`) escolhe `revisar_publicacao` sem área; `return-awaiting-client-cards` (`:62`) lê `flow_functions` de `aguardando_cliente` sem distinguir área (Mídia e Sistemas têm configs de retorno diferentes).

### Dados inconsistentes (legado, 5 cards)
- 3 cards de área **sistemas** com `current_function_key = 'planejar'` (etapa que só existe em Mídia), com Henrique.
- 2 cards de área **sistemas** em `revisar` com Eric, que tem `revisar/sistemas` = `allowed false`.
Correção: reatribuir a etapa/responsável válidos da área e registrar no histórico de fluxo.

## Parte B — Reordenação por risco: não implementada
Estado atual de `src/lib/reorderSequence.ts`:
- `sortForReorder` já preserva o card "em andamento" (primeiro por vencimento) por camada, e só reordena o resto.
- A priorização por data de publicação continua sendo um liga/desliga cru: qualquer card com `publish_date` fura a fila, mesmo com 18 dias de folga (exatamente o caso do Hospital Veterinário Leal no print).
- Não existe janela de risco baseada no ciclo restante, nem regra de "acabou de entrar na coluna vai para o fim".
- `work_area` já é usado para escolher os blocos de horário por área, mas não influencia prioridade.
- `ReorderSequenceModal.tsx` não exibe nenhum selo de risco (só um aviso genérico).
- `FunctionPermissionsModal.tsx` tem 4 abas (Participação, Tempo estimado, Alocação por área, Retorno do cliente) — não há aba de prioridade/risco.

# Plano de execução

## Etapa 1 — Fechar A1–A6
Adicionar o filtro/parâmetro de área nos 6 pontos listados, propagando a área do card (`demands.work_area`) ou a área do contexto. Nas edge functions, resolver a área a partir do card em processamento e filtrar `flow_functions`/`collaborator_function_assignments` por ela.

## Etapa 2 — Sanear os 5 cards legados
Migração de dados: mover os cards de Sistemas para uma etapa existente na área (`especificar`/`revisar`) com responsável habilitado, registrando `demand_flow_history`.

## Etapa 3 — Aba "Prioridade e risco" em Configurar funções do fluxo
Nova aba, por área, com parâmetros persistidos em `flow_functions.config` (ou tabela de config do tenant):
- Fator da janela de risco (padrão 3×).
- Carência para card recém-chegado (padrão 60 min).
- Liga/desliga da priorização por data de publicação.

## Etapa 4 — Nova regra de ordenação
Em `reorderSequence.ts`:
- Calcular o **ciclo restante** de cada card: soma das durações das etapas da etapa atual até o fim da sequência do seu tipo/área.
- Janela de risco: prioriza somente se `prazo − agora ≤ fator × ciclo restante`, medido em minutos úteis da área e do responsável (folgas, dias úteis, alocação por área).
- Fora da janela: mantém a posição por sequência, sem furar fila.
- Card que entrou na coluna há menos que a carência e sem atraso: entra no fim da fila.
- Card que já estava na sequência: continua na sequência.
- O card em andamento no topo continua intocado (só ganha acréscimo se houver atraso real).

## Etapa 5 — UI da proposta
No `ReorderSequenceModal`: selo por card indicando o motivo da posição (Em andamento / Em risco / Na sequência / Recém-chegado), com o ciclo restante e a folga até o prazo, preservando os overrides manuais em cascata já existentes.

# Detalhes técnicos
- Arquivos: `src/lib/proceedDemand.ts`, `src/pages/KanbanCentralPage.tsx`, `src/lib/reassignDemand.ts`, `src/hooks/usePendingEvaluationCards.ts`, `src/lib/evaluatePlanCard.ts`, `src/pages/ApproveCards.tsx`, `supabase/functions/run-scheduled-dispatches/index.ts`, `supabase/functions/return-awaiting-client-cards/index.ts`, `src/lib/reorderSequence.ts`, `src/components/kanban/ReorderSequenceModal.tsx`, `src/components/FunctionPermissionsModal.tsx`.
- O ciclo restante reutiliza `loadDurationsByArea` (chaves prefixadas por área) e `getPipelineSequence` com a área do card.
- Sem mudança de schema exceto a migração de dados da Etapa 2; os parâmetros de risco vão em JSON de configuração.
