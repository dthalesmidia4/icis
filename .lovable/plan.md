## Problema

O card da Letícia está em `planejar`, mas ela não tem a função `planejar` habilitada em `collaborator_function_assignments`. Isso acontece porque:

1. **Drag-and-drop na Visão Geral** (`KanbanCentralPage.handleDragEnd`) troca `assigned_to` mas nunca altera `current_function_key`. Se um card em `planejar` sair da Lúcia (que tem planejar) para a Letícia (que não tem), a etapa permanece `planejar`.
2. **Criação manual** (`handleDraftSave` → `assignInitialResponsible`) preserva o `assigned_to` escolhido no draft e resolve a etapa inicial pela regra de tipo/posição — sem cruzar com as funções permitidas do usuário. Então a Letícia pode receber um card em `planejar` mesmo sem essa função.
3. **Criação a partir de conteúdo avulso** (`createCardFromContent`) força `current_function_key = "revisar"` — mesmo comportamento se o responsável escolhido não tiver "revisar".

A conclusão: nenhum caminho valida se o responsável possui a função destino.

## Objetivo

Sempre que um responsável for atribuído a um card (criação, drag, ou seleção manual), a etapa (`current_function_key`) precisa cair numa função **permitida para aquele usuário** e coerente com o fluxo do tipo de demanda.

## Regra de resolução (nova função `resolveFunctionForAssignee`)

Entrada: `tenantId`, `assigneeUserId`, `demandTypeKey`, `currentFunctionKey` (opcional).

Passos:
1. Buscar `flow_functions` ativas da tenant (ordenadas por `position`).
2. Buscar `demand_type_flow_rules` do tipo → montar sequência `required` (se houver); caso contrário sequência = todas as funções ativas.
3. Buscar `collaborator_function_assignments` do `assigneeUserId` com `allowed = true` → conjunto `allowedKeys`.
4. Intersectar sequência × `allowedKeys`, preservando a ordem do fluxo.
5. Escolher função destino:
   - Se `currentFunctionKey` está no resultado, mantém.
   - Senão, se `currentFunctionKey` existe na sequência (mas não é permitido), avança para a próxima função permitida a partir da posição atual.
   - Senão, retorna a primeira função permitida da sequência.
6. Se o usuário não tem nenhuma função permitida na sequência, retorna `null` e o chamador decide: manter etapa atual + aviso (não bloqueia atribuição), ou reverter a operação.

## Aplicação

1. **`src/lib/initialFlowFunction.ts`**
   - Adicionar `resolveFunctionForAssignee(...)` (exportada).
   - `assignInitialResponsible`: quando `existingAssignee` estiver definido, usar `resolveFunctionForAssignee` para escolher a etapa; se não permitido, cair na `pickAssigneeForFunction` da etapa inicial (fluxo atual). Sem responsável pré-definido, comportamento atual permanece.

2. **`src/pages/KanbanCentralPage.tsx` → `handleDragEnd`**
   - Após decidir `newAssignedTo` (não nulo), chamar `resolveFunctionForAssignee` com `currentFunctionKey = card.current_function_key`.
   - Se retornar uma etapa diferente da atual, atualizar `current_function_key` no mesmo `update` e registrar `flow_history` com `action: "proceeded"` (ou nova `"reassigned"`) refletindo a mudança de função além da mudança de responsável.
   - Se retornar `null`, mostrar toast de aviso ("Colaborador não tem função compatível — etapa mantida") e manter comportamento atual.
   - Coluna `__unassigned__` continua limpando `current_function_key = null`.

3. **`src/components/TaskCard.tsx` — popover "Trocar responsável"** (linha ~1219+)
   - Onde o card é atribuído via UI (fora do drag), reaproveitar `resolveFunctionForAssignee` para ajustar `current_function_key` no mesmo update, mantendo consistência com o Kanban.

4. **`src/lib/createCardFromContent.ts`**
   - Manter etapa `"revisar"` como intenção, mas antes de gravar chamar `resolveFunctionForAssignee` (`demandTypeKey`, `assignee`) para cair na função permitida do responsável escolhido; se `null`, seguir com "revisar" como está.

## Correção do card já afetado

O card específico da Letícia (`Programação dos Stories Leal`, hoje em `planejar`) só é corrigido no próximo reassignment. Não faz sense migrar em massa — a regra passa a atuar dali em diante. O usuário pode arrastar o card para outra coluna e voltar, ou reatribuir pelo popover, e a etapa se reajusta.

## Detalhes técnicos

- Sem mudanças de schema; apenas leitura extra em `collaborator_function_assignments`.
- `flow_history` continua sendo gravado por operação; quando função e responsável mudam juntos, um único registro `proceeded` com `from/to` de ambos.
- Nenhum ajuste em `proceedDemand` (que já respeita a sequência e escolhe o responsável a partir das funções permitidas).
- Nada é alterado em geração de conteúdo, publicações agendadas ou permissões — apenas roteamento de etapa.
