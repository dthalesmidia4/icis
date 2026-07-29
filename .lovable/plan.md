## Correção dos sufixos de etapa por coluna

**Problema:**
1. "em andamento" aparece em **todos** os cards da coluna; deveria aparecer só no card do topo (o que o colaborador está efetivamente fazendo agora).
2. "pausado para captação" não aparece no card do Eric porque depende de `reorder_meta.pausedByCaptar`, que só é preenchido quando o "Reorganizar" roda. Quando existe uma captação **em andamento agora** (pseudo-grupo "CAPTAÇÃO · AGORA") na mesma coluna, os demais cards ativos daquele colaborador deveriam ser marcados como pausados dinamicamente.

**Ajustes em `src/pages/KanbanCentralPage.tsx`:**

1. **Sufixo "em andamento" só no primeiro card da coluna.**
   Trocar `resolveStageLabel(card)` por `resolveStageLabel(card, { isTop, isPausedByCaptarNow })`, chamado no render onde já sabemos a posição:
   - `isTop = true` só para o primeiro card renderizado da coluna (considerando a ordem final: `captarNow` primeiro, depois os grupos por data).
   - Cards de captar no pseudo-grupo "CAPTAÇÃO · AGORA" → recebem `isTop=true` (o "agora" implica em andamento).
   - Demais cards → sem sufixo (fica só "SmartVety · Planejar").

2. **Pausa dinâmica por captação ativa.**
   Ao montar cada coluna, verificar se existe algum card `captar` no pseudo-grupo "CAPTAÇÃO · AGORA" para aquele responsável. Se sim, `isPausedByCaptarNow = true` para todos os outros cards ativos dessa coluna (exceto o próprio card de captação, cards diários que rodam à parte e cards de `aguardando_cliente`). O sufixo passa a ser `"<etapa> pausado para captação"`.

3. **Ordem de precedência dos sufixos** em `resolveStageLabel`:
   - `reorder_meta.pausedByCaptar` **ou** `isPausedByCaptarNow` → `"<etapa> pausado para captação"`.
   - `publicar` + dispatch ativo → `"Publicar agendado"`.
   - `aguardando_cliente` → sem sufixo (a etapa já implica espera).
   - `isTop === true` → `"<etapa> em andamento"`.
   - Caso contrário → só o nome da etapa.

**Fora do escopo:** cores/estilos dos cards, comportamento do botão "Entregar minha parte" e demais fluxos já entregues no turno anterior.

**Resultado esperado no cenário do print:**
- Eric: card de captação → "Captar em andamento". Card SmartVety abaixo → "Planejar pausado para captação".
- Henrique: primeiro card ("Atividades SmartVety") → "Planejar em andamento". Os outros 3 → só "Planejar".