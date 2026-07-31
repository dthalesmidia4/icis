## O que realmente aconteceu (verificado no banco)

Eric **não** tem `revisar` em nenhuma das duas áreas (`collaborator_function_assignments`: `revisar / midia = false`, `revisar / sistemas = false`). Ainda assim, "Agente de Vacinas" e "Templates personalizados de anamnese" estão hoje em `revisar` / área `sistemas` com Eric como responsável.

O histórico (`demand_flow_history`) mostra a sequência exata:

```text
31/07 14:35  area_sanitization   revisar: Eric -> Henrique   (motivo: sem função revisar em sistemas)
31/07 14:58  manual_assignment   revisar: Henrique -> Eric   (source: kanban_drag)
31/07 14:59  manual_assignment   revisar: Henrique -> Eric   (source: kanban_drag)
```

Ou seja: a correção de 14:35 funcionou e **o arrastar no Kanban desfez tudo 23 minutos depois**, sem nenhum bloqueio. O problema é mais profundo do que a coluna: são três camadas que deveriam barrar e nenhuma barra.

### Camada 1 — `resolve_function_for_assignee` está sendo usada como autorização
A função é de *progressão de etapa*, não de permissão. Para o fluxo de sistemas do tipo `desenvolvimento` a sequência obrigatória é `especificar → desenvolver → testar → revisar → entregar_cliente → aguardando_cliente`. Eric só pode `desenvolver` (além de `ajustar` e os `corrigir_bug_*`, que estão `disabled` nesse tipo). Como não existe nenhuma etapa permitida **à frente** de `revisar`, a função cai na regra "nunca regride" e faz `RETURN _current_key` — devolve `revisar`.

### Camada 2 — a transferência interpreta esse retorno como "pode"
Em `src/lib/reassignDemand.ts`, `evaluateReassign` faz `if (resolved) nextFunctionKey = resolved`. Como `resolved` veio `'revisar'`, a transferência é considerada válida, `functionRemapped` fica `false` e o toast mostra "Atribuída a Eric". O bloqueio duro por função só existe para etapas de cliente (`isClientStageKey`).

### Camada 3 — o trigger do banco repete o mesmo erro
`validate_demand_stage_assignment` (trigger ativo em `demands`) só lança exceção para `aguardando_cliente`, `enviar_cliente` e `entregar_cliente`. Para qualquer outra etapa ele chama `resolve_function_for_assignee`, recebe `revisar` de volta e grava. A última linha de defesa aprova o estado ilegal.

## Correção

### 1. Separar "progressão" de "autorização" (banco)
Criar `public.user_can_hold_function(_tenant_id, _user_id, _function_key, _work_area)`: `true` somente se existir `collaborator_function_assignments` com `allowed = true` para a tripla exata. Sem fallback, sem "nunca regride".

### 2. Trigger passa a barrar qualquer etapa não autorizada
Reescrever `validate_demand_stage_assignment`:

- se `user_can_hold_function(...)` → aceita;
- senão, tenta `resolve_function_for_assignee` e **só aceita o retorno se ele for diferente da etapa atual e também autorizado** para o usuário;
- se nada resolver → `RAISE EXCEPTION` com mensagem clara (`"<Nome> não tem a função "<etapa>" na área <área>"`), para *todas* as etapas, não só as de cliente.

Assim, arrastar um card no Kanban para alguém sem a função falha no banco mesmo que o front tenha um furo.

### 3. `resolve_function_for_assignee` deixa de mentir
Trocar o `RETURN _current_key` do fim do branch por `RETURN NULL` quando a etapa atual **não** está entre as permitidas do usuário. Manter o comportamento atual (não regredir) apenas quando a etapa atual é permitida. Isso preserva a regra anti-regressão sem transformá-la em permissão.

### 4. Front: bloqueio explícito em qualquer transferência
Em `evaluateReassign`:

- checar `userHasFunction(tenantId, newAssignedTo, currentKey, work_area)` para **toda** etapa (remover a condição `isClientStageKey`);
- se não tiver e a RPC não devolver uma etapa diferente e autorizada → `allowed: false`, `blockedBy: "function"`, mensagem `"<Nome> não tem a função "<Etapa>" na área <Área>"`;
- deletar o caminho `functionRemapped` que hoje só emite um aviso e grava mesmo assim.

Isso cobre de uma vez o drag do Kanban (`KanbanCentralPage.tsx`), o seletor de responsável do card (`TaskCard.tsx`) e o modal de conflito, porque todos passam por `evaluateReassign`.

### 5. Reparar os dados atuais
Varrer as demandas ativas cujo responsável não tem a função da etapa atual na área do card e devolvê-las a um responsável habilitado (mesma lógica de carga de `pickAssigneeForFunction`), registrando em `demand_flow_history` com `action = 'area_sanitization'`. Se nenhuma etapa/pessoa servir, deixar sem responsável em vez de manter o estado ilegal — para os dois cards do print isso significa voltar para Henrique, único com `revisar` em sistemas.

## Verificação

- Arrastar "Agente de Vacinas" para a coluna do Eric deve mostrar erro e o card não sair da coluna do Henrique.
- Repetir o mesmo pelo seletor de responsável dentro do card: mesmo bloqueio, mesma mensagem.
- Tentar um `UPDATE` direto em `demands` (via SQL) trocando o responsável para Eric em `revisar`: deve falhar no trigger.
- Transferência legítima (card em `desenvolver` → Eric) continua funcionando.
- Nenhuma demanda ativa restante com responsável sem a função da etapa atual (query de auditoria).

## Detalhes técnicos

- Migração: nova função `user_can_hold_function`, `CREATE OR REPLACE` de `validate_demand_stage_assignment` e das duas assinaturas de `resolve_function_for_assignee`.
- Frontend: `src/lib/reassignDemand.ts` (regra de bloqueio), `src/lib/clientStageAssignments.ts` (expor a checagem genérica), remoção do aviso `functionRemapped` em `src/pages/KanbanCentralPage.tsx` e `src/components/TaskCard.tsx`.
- Correção de dados como script único de saneamento, não como rotina recorrente.
