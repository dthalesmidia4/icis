
## 1. Cards "Sem etapa" na coluna do responsável (bug de criação)

**Diagnóstico confirmado por query no banco (`select current_function_key, source, count(*) from demands...`):**
- 17 cards `source='manual'` com `assigned_to` preenchido porém `current_function_key = NULL`.
- 8 cards `source='card'`/`'ultra_card'` (aprovação de planejamento) com `current_function_key = NULL` (parte deles com `assigned_to = NULL`).
- Somente `createCardFromContent` (fluxo standalone) preenche `current_function_key: "revisar"`; nem `ApproveCards.handleApprove` nem `KanbanCentralPage.handleDraftSave` fazem isso.

Por isso a coluna da Lúcia mostra tantos cards sem etapa: a aprovação de planejadas insere direto em `demands` sem resolver a primeira função do fluxo, e a criação manual só grava `assigned_to` no `extra` sem definir a etapa correspondente.

**Correção — resolver a etapa inicial ao criar o card:**

- Criar helper `src/lib/initialFlowFunction.ts` com `resolveInitialFunction(tenantId, demandTypeKey)`:
  - Consulta `flow_functions` (active, ordenadas por `position`) + `demand_type_flow_rules` para o `demand_type_key`.
  - Retorna `{ functionKey, functionName }` da primeira função com `requirement = 'required'`.
  - Se `demand_type_key` for nulo ou não houver regras, cai na primeira `flow_function` ativa da tenant (fallback determinístico) ou retorna `null` sem quebrar.
- Criar helper `assignInitialResponsible(demandId, tenantId, demandTypeKey)`:
  - Chama `resolveInitialFunction`.
  - Chama `pickAssigneeForFunction(tenantId, functionKey, functionName)` (já existente em `proceedDemand.ts`).
  - Executa `UPDATE demands SET current_function_key = ..., assigned_to = COALESCE(assigned_to, ...) WHERE id = ...` (preserva `assigned_to` se o usuário já escolheu um responsável explícito).
  - Registra `recordFlowHistory({ action: 'created', toUserId, toFunctionKey })`.

Aplicar o helper em:
- `src/pages/ApproveCards.tsx` linha 298 — após o `INSERT ... returning id`, aguardar `assignInitialResponsible(insertedData.id, tenantId, demandTypeKey)`. Continua disparando `triggerAutoGenerate` depois.
- `src/pages/KanbanCentralPage.tsx` linha 1283 (`handleDraftSave`) — depois do `update(extra)` e antes do `recordFlowHistory`, chamar `assignInitialResponsible(result.demand_id, tenantId, selectedCard.demand_type_key)`. O `recordFlowHistory('created')` atual passa a ser substituído pelo do helper para não duplicar.
- Para Card Diário (`isDaily`), continuar chamando o helper — a etapa inicial ainda faz sentido (revisar/produzir), apenas responsável fixo já vem preenchido.

**Backfill dos 22 cards órfãos existentes** (opcional, com aprovação):
- Migration `supabase--migration` que percorre `demands` sem `current_function_key` (não arquivadas) e preenche com base em `demand_type_key` + `flow_functions.position=menor`. Executar apenas depois que o código novo estiver ativo, para não misturar diagnósticos. Vou pedir confirmação explícita antes de rodar.

## 2. Layout do card truncando texto e datas

Screenshot mostra título e datas cortados dentro da coluna. Ajustes visuais em `src/components/KanbanCard.tsx`:

- **Título**: manter `line-clamp-2` mas remover `truncate` do subtítulo para permitir 2 linhas quando o nome da empresa for longo; usar `break-words` para não cortar palavras a seco.
- **InlineDates**: hoje usa `flex justify-between` com dois blocos horizontais, que estouram na coluna estreita. Trocar para layout compacto em coluna quando o container for estreito: `flex flex-col gap-0.5` no mobile/coluna estreita (`@container` ou fallback `sm:flex-row`), com labels curtas ("Ini:"/"Fim:") em vez de "Início:"/"Término:".
- Diminuir padding do `CardHeader` (`px-2.5 pt-2.5 pb-1.5`) e do `CardContent` (`px-2.5 pb-2.5`) para ganhar espaço horizontal.
- Reduzir ícones `CalendarIcon` para `h-3 w-3` e o gap para `gap-1`, sem alterar contraste.

Nenhuma alteração de contrato: as props existentes permanecem.

## 3. Agrupamento por data com labels Hoje / Ontem / Amanhã

Em `src/pages/KanbanCentralPage.tsx` (função `formatHeader`, linhas 1768-1774):

- Calcular referências uma vez fora do render (`todayISO`, `ontemISO`, `amanhaISO`) usando `new Date()` no fuso local.
- Substituir a formatação atual por:
  - `__no_date__` → texto atual.
  - `date === todayISO` → **"Hoje"**.
  - `date === ontemISO` → **"Ontem"**.
  - `date === amanhaISO` → **"Amanhã"**.
  - Caso contrário → `dd/mm/yyyy` como já é. Datas passadas continuam com aparência normal — a lógica visual de atraso já está no card em si (borda vermelha).
- Manter a badge de contagem e o comportamento colapsável (`collapsedDateGroups`) sem alteração — a `groupKey` continua sendo o ISO bruto, então o estado de colapso persiste entre re-renders quando a data muda de "Hoje" para "Ontem".

## Detalhes técnicos

- Arquivos alterados:
  - `src/lib/initialFlowFunction.ts` — novo helper puro (sem side effects fora do Supabase).
  - `src/pages/ApproveCards.tsx` — chamar helper após insert.
  - `src/pages/KanbanCentralPage.tsx` — chamar helper após `handleDraftSave`, mover `recordFlowHistory('created')` para dentro do helper, e ajustar `formatHeader` para Hoje/Ontem/Amanhã.
  - `src/components/KanbanCard.tsx` — layout compacto/responsivo do header e do `InlineDates`.
- Sem migração de banco no primeiro passo. Backfill dos cards órfãos só entra depois, mediante aprovação, via `supabase--migration`.
- Verificação após build: 
  - Smoke via Playwright abrindo `/kanban-central`, checando que o header de grupo mostra "Hoje"/"Amanhã" e que o card mais estreito não corta datas.
  - Query rápida `select current_function_key, count(*) from demands where created_at > now() - interval '10 min'` após criar uma demanda de teste para confirmar que sai com etapa preenchida.
