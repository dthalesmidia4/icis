## O que fazer

### 1. Label de etapa com estado ("em andamento" / "pausado para captação" / "agendado")

Em `src/pages/KanbanCentralPage.tsx`, ampliar `resolveStageLabel(card)` para devolver a etapa + um sufixo de estado:

- Base: nome da função atual (já existe hoje).
- Se `card.reorder_meta?.pausedByCaptar` estiver preenchido **e** o card não for da etapa `captar` → sufixo `pausado para captação` (ex.: "Planejar pausado para captação").
- Se a etapa atual for `publicar` **e** `activeDispatchIds.has(card.id)` → sufixo `agendado` (ex.: "Publicar agendado"). Isso resolve o segundo ponto do usuário: hoje todos os cards ficam apenas como "Publicar" mesmo já tendo dispatch programado.
- Caso contrário → sufixo `em andamento` (ex.: "Captar em andamento", "Planejar em andamento").

Para o segundo caso, passar `activeDispatchIds` (já disponível via `useActiveDispatchIds`) como dependência do `useCallback` e usar dentro. O sufixo deve ser aplicado só para cards ativos — quando `isHistory` (Registro de Cards), manter o label puro.

Sem mudanças em `KanbanCard.tsx` — ele já renderiza `statusName` como está.

### 2. "Entregar minha parte" em cards Captar com múltiplos responsáveis

Fluxo atual (`proceedDemand.ts` → `handleCaptarProceed`): quando qualquer responsável avança um Captar, o card avança para o próximo do fluxo global e some da coluna de todos. Novo comportamento desejado:

- Se o card `captar` tem mais de um responsável (owner + `additional_assignees`), o botão principal do `TaskCard` passa a se chamar **"Entregar minha parte"** (em vez de "Prosseguir"). Só o último responsável remanescente vê o rótulo padrão "Prosseguir".
- Ao clicar em "Entregar minha parte":
  - Remove o `userId` atual (o usuário logado) do conjunto {`assigned_to`, `additional_assignees`}.
  - Registra em `demand_flow_history` uma linha `action = "partial_delivered"` com `from_user_id = user`, mantendo `from_function_key = to_function_key = captar` e `metadata = { remaining_assignees: [...] }`. Isso faz o card aparecer no Registro de Cards daquele responsável como entrega parcial no dia.
  - Se `assigned_to` era o próprio usuário e ainda restam responsáveis, promove o primeiro dos `additional_assignees` a `assigned_to` (transferência interna, sem mudar etapa nem datas).
  - Se após a remoção não sobra ninguém → cai no fluxo normal de `proceedDemand` (avança etapa global, limpa `additional_assignees`).
- O card **não** muda de datas (Captar tem horário fixo).

### 3. Implementação técnica

- Nova função `deliverMyPart({ tenantId, demandId, userId })` em `src/lib/proceedDemand.ts`:
  - `SELECT assigned_to, additional_assignees, current_function_key, tenant_id`.
  - Se `current_function_key !== 'captar'` ou não há múltiplos responsáveis → chama `proceedDemand` normal.
  - Caso contrário monta o novo par (`assigned_to`, `additional_assignees`) e faz `UPDATE`.
  - Chama `recordFlowHistory({ action: "partial_delivered", fromUserId: userId, toUserId: userId, fromFunctionKey: "captar", toFunctionKey: "captar", metadata: { remaining: [...] } })`.
- Botão em `TaskCard.tsx`: onde hoje aparece "Prosseguir" para Captar, detectar `isCaptar && (additional_assignees.length + (assigned_to?1:0)) > 1 && (currentUser está em assignees)` e mudar o texto/handler. Handler chama a nova função.
- Compatibilidade com o Registro de Cards: `demand_flow_history` já tem `action text` (livre), então `partial_delivered` é aceito. Na renderização da coluna Registro (`KanbanCentralPage.tsx`), incluir esse novo `action` como uma entrega válida do dia para aquele `from_user_id`.

### Arquivos afetados

- `src/pages/KanbanCentralPage.tsx` — `resolveStageLabel` com sufixo de estado, inclusão de `partial_delivered` na leitura do histórico por coluna.
- `src/lib/proceedDemand.ts` — nova `deliverMyPart`.
- `src/components/TaskCard.tsx` — botão "Entregar minha parte" condicional para Captar multi-responsável.

### Fora de escopo

- Não altero visual do card em si (badges do cliente/etapa continuam vindo do `subtitle`+`statusName` já existentes).
- Não mexo em edge functions nem em reorder — o campo `reorder_meta.pausedByCaptar` já é populado e será apenas lido para o sufixo.
- Não redesenho o Registro de Cards; só acrescento o novo `action` como evento válido.