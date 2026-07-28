## Modo foco por hover ("espiar")

Adicionar preview do modo foco ao passar o mouse sobre o nome da coluna, mantendo o clique como forma de fixar (pin). O clique continua sendo a fonte de verdade; o hover apenas espia.

### Comportamento

- **Sem foco fixado + mouse sobre o nome da coluna** → entra em foco temporário nessa coluna (mesma animação FLIP que hoje).
- **Com foco fixado + mouse sobre o nome de qualquer coluna** (a fixada ou outra) → sai temporariamente do foco, mostrando todas as colunas de volta.
- **Sair do hover** → retorna ao estado fixado (nenhum ou a coluna clicada).
- **Clicar no nome** → alterna o estado fixado (mesma lógica atual). O hover posterior continua funcionando por cima.
- `ESC` continua limpando somente o estado fixado.

### Problema do "mouse fora após animar" — solução

Quando entra em foco, a coluna se desloca para a esquerda e sai de baixo do cursor, o que dispararia `mouseleave` imediatamente e criaria um flicker infinito. Solução:

1. O gatilho de "sair do preview" **não** é o `mouseleave` do header. É o `mouseleave` do container do board (`kanban-board-wrapper`).
2. Enquanto o cursor estiver em qualquer lugar do board (colunas, gaps, sub-colunas do modo foco), o preview atual se mantém.
3. Mover o cursor para o header de outra coluna apenas troca o alvo do preview (com pequeno debounce de ~120 ms para evitar tremidos ao atravessar).
4. `mouseleave` do board wrapper com grace de ~180 ms → limpa o preview e volta ao estado fixado.
5. Pointer events com `pointerType !== 'mouse'` (touch) são ignorados — hover não faz sentido em toque; só o clique fixa.
6. Respeitar `prefers-reduced-motion`: quando reduzido, o hover ainda funciona, apenas sem a animação FLIP (já é o caminho atual).

### Alterações no código

Arquivo único: `src/pages/KanbanCentralPage.tsx`.

- Novo state `previewFocusColumnId: string | null` e um ref `hoverTimerRef` para debounce.
- Derivar `effectiveFocusColumnId`:
  - Se `previewFocusColumnId === '__none__'` → `null` (preview de "sair do foco" quando há pinned).
  - Senão `previewFocusColumnId ?? focusedColumnId`.
- Substituir todo uso interno de `focusedColumnId` na renderização/animação por `effectiveFocusColumnId`. Manter `focusedColumnId` só para o estado fixado, chip do header ("Modo foco: …") e ESC.
- No botão do header da coluna (linhas ~2255-2270), adicionar `onPointerEnter` / `onPointerLeave` que:
  - Ignora `pointerType !== 'mouse'`.
  - Agenda `changeFocusColumn` com 120 ms:
    - Se `focusedColumnId` estiver setado → preview = `'__none__'`.
    - Se não → preview = `columnUserId` desta coluna.
  - `onPointerLeave` apenas cancela o timer pendente; **não** limpa preview.
- Adicionar `onPointerLeave` no wrapper do board (elemento com scroll horizontal, hoje em ~linha 2115) para agendar limpeza de `previewFocusColumnId` com grace de 180 ms; `onPointerEnter` cancela essa limpeza.
- Sempre que `previewFocusColumnId` muda, chamar `changeFocusColumn(next)` para acionar a mesma animação FLIP já existente (a função já lida com capturar layout antes / animar depois). Nada muda em `captureKanbanColumnLayout` nem no CSS.
- Ao clicar no header: manter `enterFocus/exitFocus` atuais, e adicionalmente zerar `previewFocusColumnId` para evitar que um preview pendente sobrescreva a decisão fixada.
- Cleanup no unmount: limpar `hoverTimerRef` e o timer de exit do board.

### Detalhes técnicos

- Usar `pointerenter/pointerleave` (não `mouseenter`) para lidar melhor com sub-elementos.
- Debounce de entrada (~120 ms) evita foco acidental ao apenas atravessar o header indo para outro alvo.
- O `data-focus-order` continua sendo recalculado com base em `effectiveFocusColumnId`, então o stagger de entrada das sub-colunas segue funcionando ao espiar.
- Sem novas dependências, sem alterações em outros arquivos.

### Verificação

- Preview local: entrar/sair do foco por hover em diferentes colunas, checando que não há flicker quando a coluna sai de baixo do cursor.
- Verificar que clicar fixa e que hover subsequente sobre outra coluna mostra "todas" temporariamente e volta à fixada ao sair do board.
- Verificar em `prefers-reduced-motion` que ainda funciona (sem animação).