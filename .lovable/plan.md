
# Alinhar etapa × responsável de forma sistêmica

O sintoma da Letícia (card em `revisar` sem ela ter a função) é a ponta de um problema geral: hoje existem **9 cards ativos** cujo `current_function_key` não está entre as funções permitidas ao `assigned_to` em `collaborator_function_assignments`. A correção precisa (a) remapear todos os cards atuais, (b) fechar as portas restantes por onde novos cards entram desalinhados, e (c) instalar uma trava no banco para nunca mais persistir esse estado.

## 1. Migração de saneamento (cards existentes)

- Percorrer todo `demands` com `archived_at IS NULL`, `assigned_to NOT NULL`, `current_function_key NOT NULL`.
- Para cada card, aplicar a mesma lógica do `resolveFunctionForAssignee` no lado do banco (função SQL `security definer` `resolve_function_for_assignee(tenant, user, demand_type_key, current_key)`):
  1. Considera a sequência do tipo (regras `required` de `demand_type_flow_rules`), com fallback para todas as `flow_functions` ativas.
  2. Se a etapa atual já é permitida ao usuário → mantém.
  3. Se a etapa está na sequência mas não é permitida → avança para a próxima permitida.
  4. Caso contrário → primeira permitida da sequência.
  5. Se o usuário não tem nenhuma função da sequência → limpa `assigned_to` (card volta a "sem responsável" para redistribuição) e mantém `current_function_key` no primeiro passo do fluxo.
- Toda alteração da migração gera linha em `demand_flow_history` com `action='system_realign'` e `metadata={"reason":"backfill"}` para auditoria.

## 2. Trava de servidor (banco)

- Trigger `BEFORE INSERT OR UPDATE` em `demands` (`validate_demand_stage_assignment`) que, sempre que `assigned_to` e `current_function_key` estiverem preenchidos, chama a função acima e **reescreve** `current_function_key` (e, no limite, zera `assigned_to`) para um valor válido. Nenhum código cliente consegue mais gravar um par incoerente.
- A trigger ignora quando o `assigned_to` é `NULL` (colunas "Sem responsável" continuam existindo) e não bloqueia updates que só mexem em campos alheios (checa se `assigned_to`/`current_function_key`/`demand_type_key` mudou ou se o registro está entrando).

## 3. Frontes de código já cobertos e o que falta reforçar

Já usam `resolveFunctionForAssignee`:
- `KanbanCentralPage.tsx` (drag entre colunas)
- `TaskCard.tsx` (popover "Trocar responsável")
- `createCardFromContent.ts` / `assignInitialResponsible` (criação inicial)

Vou revisar e alinhar também:
- `src/pages/ApproveCards.tsx` — na aprovação, hoje passa direto pelo `pickAssigneeForFunction`; garantir que, se o responsável escolhido não tiver a função inicial do tipo, o `resolveFunctionForAssignee` decide a etapa.
- `src/lib/evaluatePlanCard.ts` — mesmo tratamento na aprovação virtual.
- `src/lib/proceedDemand.ts` — ao avançar de etapa, escolher o próximo responsável entre quem tem `next_function_key`; se ninguém tiver, cair na regra atual mas registrar log.
- `RejectedCards.tsx` "Resgatar" — passar por `resolveFunctionForAssignee` antes de reinserir no plano.
- Qualquer `.update({ assigned_to })` ou `.update({ current_function_key })` isolado (grep sistemático) é migrado para um helper único `updateDemandStageAndAssignee` que sempre chama o resolver.

## 4. Ajuste do rótulo "próximo passo" no card

O botão do topo do card ("Enviar cliente ▸") mostra o próximo `flow_function` da sequência do tipo. Isso é correto (a próxima etapa vai para outro colaborador), mas o texto atualmente sugere que quem age é o responsável atual. Vou trocar para "Próxima etapa: Enviar cliente" quando o próximo passo não pertencer ao usuário logado, deixando claro que a ação apenas transfere o card. Nenhuma mudança de dado — só cópia + tooltip.

## 5. Validação

- Rodar a migração em transação com `SELECT count(*)` antes/depois para confirmar 0 desalinhados.
- Escrever uma query de "auditoria contínua" (view `v_demand_stage_misalignment`) para que qualquer regressão apareça no Dev Hub.
- Testar manualmente: drag para coluna sem permissão, popover trocando responsável para usuário sem a função, aprovação de plano com responsável limitado, resgate de reprovado.

## Detalhes técnicos

- Nova função `public.resolve_function_for_assignee(tenant uuid, user_id uuid, demand_type_key text, current_key text) RETURNS text` `SECURITY DEFINER`, `SET search_path = public`.
- Trigger `validate_demand_stage_assignment` idempotente; usa `NEW.current_function_key := resolve...` quando o par é inválido.
- Migração de backfill em um único arquivo SQL, escrevendo em `demand_flow_history` com `to_function_key = novo`, `from_function_key = antigo`.
- Nenhum GRANT adicional (tabelas já existentes).
