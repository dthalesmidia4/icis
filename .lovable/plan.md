# Auditoria — todos os caminhos que trocam `assigned_to`

Somente evidência do estado atual (nada foi editado). Cada item aponta arquivo + handler real e a cadeia até o write.

## Contrato central existente

`src/lib/reassignDemand.ts`
- `evaluateReassign` → `userHasFunction` (etapa atual) → se não tem, `resolveFunctionForAssignee(..., mode: params.mode ?? "administrative_reassign")` → confere de novo com `userHasFunction` → `checkAssignmentConflicts` → devolve `nextFunctionKey`, `functionRemapped`, `direction`, `remapMessage`. Só bloqueia (`blockedBy: "function"`) quando não existe etapa utilizável.
- `applyReassign` → recheck de agenda → `applyFlowReactivation` → `commitFlowTransition` (compare-and-set em `assigned_to` + `current_function_key`) → `recordFlowHistory`.
- Remapeamento administrativo real: `src/lib/initialFlowFunction.ts:141-170` (`usable`: função habilitada, não client-facing em modo administrativo, etapa já concluída pelo usuário excluída, anti-autorrevisão) + `pickAdministrativeStage` (`src/lib/flowSegments.ts`): preserva a etapa; senão avança dentro do mesmo segmento operacional sem atravessar gate de cliente nem pular revisão obrigatória; senão volta dentro do segmento; senão `null`.

## Caminhos aferidos

1. **TaskCard aberto — seletor de responsável** — `src/components/TaskCard.tsx:3573-3660` (`onValueChange` do `Select` "Responsável"). Card salvo: `evaluateReassign` → `runExecutionExitGuarded("Transferir")` → `applyReassign` (`historySource: "task_card"`) → `onCardChange`. Remapeia sim (mostra `remapMessage`), modo administrativo, conflito de agenda cai em `setAssignConflict` + `applyAssignReschedule` (`TaskCard.tsx:2384-2420`). **OK**, com uma ressalva de UI: `eligibleAssignees` (`TaskCard.tsx:1667-1701`) é calculada com `resolveFunctionForAssignee(..., currentKey = null)` e **sem** `mode`, portanto em modo `flow`; colaboradores fora dessa lista aparecem `disabled` ("Sem etapa compatível") e não podem ser escolhidos, mesmo que `evaluateReassign` os aceitaria. É um bloqueio de UI antes do contrato — **PARCIAL** nesse detalhe. No rascunho (`isDraft`) resolve localmente com `currentKey = null` e sem `mode` (aceitável: card ainda não existe), mas `TaskCard.tsx:1778-1785` limpa o responsável automaticamente quando ele sai de `eligibleAssignees`.

2. **Visão Geral / Kanban Central — drag entre colaboradores** — `src/pages/KanbanCentralPage.tsx:1415-1516` (`handleDragEnd`) e `handleConflictReschedule:1518-1568`. Cadeia: `evaluateReassign` → `requestExit` → `applyReassign` (`kanban_drag`) → toast informando a etapa nova. **OK**.

3. **Kanban antigo** — `src/pages/Kanban.tsx` apenas renderiza `Scheduled`; `src/components/Scheduled.tsx` não escreve `assigned_to` (grep sem ocorrências). Nada a corrigir — **OK (inexistente)**.

4. **Feed Simulado / seleção em massa / BulkAllocation** — `src/lib/bulkAllocation.ts:576-586` (`deps.evaluate` → `evaluateReassignReal`, `skipSuggestion`), `deps.loadStageGroups(..., administrative: true)`, apply via RPC `apply_bulk_allocation_atomic_v1` (não via `applyReassign` no caminho atômico). O RPC revalida `user_can_hold_function` + `bulk_admin_stage_allowed` e grava `assigned_to`/`current_function_key`/agenda + histórico. **OK** (front e RPC concordam nas regras de segmento; ver divergência do trigger abaixo).

5. **Reatribuição rápida em Demandas do Colaborador** — `src/pages/CollaboratorDemands.tsx:333-380`: `evaluateReassign` → `requestExit` → `applyReassign` → `reassignFailureMessage`. **OK**.

6. **Long-press do chip: troca manual de etapa e de tipo** — `src/components/kanban/StageQuickChangePopover.tsx` (`load` + `choose`) → `src/lib/typeStageChange.ts:applyTypeStageChange` → mesmo tipo: `jumpToFunction`; tipo diferente: RPC `change_demand_type_and_stage` (CAS) com `p_next_assigned_to = card.assigned_to`. Valida sempre pelo **responsável atual** (`loadTypeStageGroups`, `mode: "manual_stage_change"`). Não troca responsável (por design) e exige responsável definido. **OK**, mas é o único lugar onde etapa muda sem oferecer troca de pessoa.

7. **Voltar demanda / regressão** — `src/components/TaskCard.tsx:1176-1215` (`executeRegress`) → `regressDemand` (`src/lib/proceedDemand.ts:~1440-1560`) com `pickCompatibleReturnStage` (`src/lib/returnTargetResolution.ts`): preserva o destinatário e adapta a etapa para trás. Transição real de processo, write direto com payload próprio + histórico. **OK como transição real** (não passa por `applyReassign`, e não deve).

8. **Prosseguir / Entregar / Entregar minha parte / jump** — `src/lib/proceedDemand.ts:896, 1014, 1233, 1307, 1446, 1543, 1702, 1800`. Todos writes diretos de processo com `pickAssigneeForFunction`/`lastUserOfStage` e histórico próprio; `deliverMyPart:1770-1815` faz `.update({ assigned_to: newPrimary, additional_assignees: newExtras })` (promoção dentro de `captar`). **Transições reais — OK**, não afetadas pelas regras administrativas (o `mode` administrativo só existe no caminho de reatribuição).

9. **Atribuição inicial / criação / auto-routing** — `assignInitialResponsible` (`src/lib/initialFlowFunction.ts:190-250`, ctx sem `mode` → `flow`), `create_manual_demand_atomic` (migration `20260811183904…:490-640`, valida com `user_can_hold_function`), `src/lib/createCardFromContent.ts:211-240` (`resolveFunctionForAssignee`, sem `mode`), `src/lib/releaseQueue.ts`/`auto_release_next_for_user` (libera, não troca responsável). **OK**.

10. **Etapas de cliente** — `src/components/kanban/AwaitingClientActions.tsx:158-190`: write direto `{ current_function_key: "publicar", assigned_to: null, ... }` + `recordStageDeliveries` + histórico. É desatribuição de processo (aprovação do cliente), não escolha de pessoa — **OK**, porém é um write direto fora do contrato.

11. **`captar` / `additional_assignees`** — limpeza/deduplicação existe no caminho em massa (`additional_assignees_mode` no payload e no RPC) e em `deliverMyPart`. **`applyReassign` não mexe em `additional_assignees`**: transferir um card de `captar` por drag/TaskCard mantém os extras antigos no card. **PARCIAL**.

12. **Triggers/RPCs do banco**
    - `validate_demand_stage_assignment` (`20260811183904…:193-255`): se o novo responsável não tem a etapa, chama `resolve_function_for_assignee` e **reescreve silenciosamente** `current_function_key`; só levanta exceção se nada resolver.
    - `resolve_function_for_assignee` no banco (`20260811183904…:4-118`) **não conhece**: modo administrativo, barreiras client-facing, etapas já concluídas (`stage_completions`) nem anti-autorrevisão. Ele avança para a próxima etapa habilitada e, se não houver, volta para a anterior — podendo atravessar `enviar_cliente`/`aguardando_cliente` e cair em etapa que o usuário já executou. **Divergência front × banco (FALHA de coerência)**: qualquer write direto de `assigned_to` é remapeado por regra mais frouxa que a do front.
    - `block_conflicting_assignment` (agenda) e `apply_bulk_allocation_atomic_v1`/`bulk_admin_stage_allowed`: coerentes com o front.
    - `change_demand_type_and_stage`: CAS, não escolhe responsável.

13. **Writes de `assigned_to` fora do helper central**
    - `supabase/functions/run-scheduled-dispatches/index.ts:330-368` — escolhe revisor por carga e grava `assigned_to` direto, sem resolver etapa por colaborador (fixa `revisar_publicacao`) e sem checar `user_can_hold_function`; depende do trigger. **PARCIAL/FALHA**.
    - `supabase/functions/return-awaiting-client-cards/index.ts:145-200` — resolve por histórico/`allowedUsers` e grava direto; sem anti-autorrevisão nem checagem de agenda. **PARCIAL**.
    - `src/components/kanban/AwaitingClientActions.tsx:164` e `src/lib/proceedDemand.ts` (vários) — processo, aceitável.
    - `src/lib/bulkAllocation.ts:588` `updateSchedule` — só agenda, não responsável.

## Respostas

**A) "Abrir o card e trocar o usuário" está corrigido?** Sim no núcleo: handler `onValueChange` do Select de Responsável em `src/components/TaskCard.tsx:3573-3660` usa `evaluateReassign` → `applyReassign`, com remapeamento automático via `pickAdministrativeStage` e mensagem `remapMessage`. Ressalva real: a lista de opções é pré-filtrada por `eligibleAssignees` (`TaskCard.tsx:1667-1701`), calculada em modo `flow` e com `currentKey = null`, então parte dos colaboradores aparece desabilitada e o contrato nem é chamado.

**B) O comportamento é sistêmico em todas as telas?** Não. Drag (Visão Geral), TaskCard, CollaboratorDemands e alocação em massa compartilham o contrato; ficam fora: o filtro de elegibilidade do TaskCard, os dois edge functions que gravam responsável, `additional_assignees` na transferência simples, e o trigger do banco que remapeia com regras diferentes.

**C) Bypasses/gaps a migrar**
1. `eligibleAssignees` do TaskCard (pré-filtro em modo `flow`, ignora etapa atual).
2. `run-scheduled-dispatches` — atribuição de revisor sem resolver etapa por colaborador.
3. `return-awaiting-client-cards` — retorno automático sem regras de conclusão/autorrevisão/agenda.
4. `applyReassign` não normaliza `additional_assignees` ao sair de `captar`.
5. `resolve_function_for_assignee` (banco) sem modo administrativo, gates de cliente, conclusões e anti-autorrevisão — remapeia mais frouxo que o front.
6. `AwaitingClientActions` grava responsável/etapa direto (processo, mas sem contrato).

**D) Arquitetura mínima de centralização (sem tocar nas transições legítimas)**
- Manter dois contratos explícitos e nomeados: `reassign` (administrativo: `evaluateReassign`/`applyReassign`) e `flow transition` (`proceedDemand`/`regressDemand`/`jumpToFunction`). Nada além disso pode escrever `assigned_to`.
- Extrair de `initialFlowFunction`/`flowSegments` um resolvedor puro único e espelhá-lo no banco: nova `resolve_function_for_assignee_v2(_mode, ...)` com gates de cliente, etapas concluídas e anti-autorrevisão; o trigger passa a usá-la e o front consome a mesma tabela de regras.
- Expor um único helper de elegibilidade (`listEligibleAssignees(card)`) derivado de `evaluateReassign` (mesmo modo, mesma etapa atual) e usá-lo no TaskCard e em qualquer seletor futuro.
- Mover a atribuição dos dois edge functions para uma RPC `reassign_demand_administrative(...)` que aplique o mesmo resolvedor + checagem de agenda no servidor.
- Incluir a normalização de `additional_assignees` no payload de `applyReassign` (mesma regra já usada no bulk).
- Guard de lint/teste: proibir `.update({ assigned_to })` fora de `reassignDemand.ts`, `proceedDemand.ts` e RPCs autorizadas.
