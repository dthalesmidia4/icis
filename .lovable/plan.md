# Modo foco do colaborador: sem piscada e com memória

Dois problemas na Visão Geral (`src/pages/KanbanCentralPage.tsx`):

1. **Piscada**: hoje o foco é aplicado em um `useEffect` que só roda depois de a função do usuário terminar de carregar. Enquanto isso, o quadro completo já foi renderizado — por isso aparece a visão geral inteira e só depois a coluna focada.
2. **Foco não persiste**: o código guarda apenas uma marca de "já focou uma vez" (`kanban_auto_focus_done`) e não a coluna focada. Ao sair da tela e voltar, a marca continua lá, então o foco não é reaplicado e o usuário cai na visão completa.

## O que será feito

### 1. Eliminar a piscada
- A tela já tem uma etapa de carregamento (usada para tenant, demandas e permissões de coluna). Incluir nela também o carregamento da função do usuário e a decisão de foco.
- Enquanto não se sabe se o usuário é gestor ou colaborador, nada de colunas é renderizado — o quadro aparece uma única vez, já no estado correto.

### 2. Lembrar o modo foco
- Passar a salvar **qual coluna está focada** (por usuário) em vez de apenas "já focou".
- Ao abrir a Visão Geral, restaurar esse valor antes do primeiro render das colunas.
- Regras de gravação:
  - Entrar no foco de uma coluna → salva aquela coluna.
  - Sair do foco (botão "Sair do foco" ou Esc) → salva explicitamente "sem foco", para que voltar à tela não force o foco de novo.
  - Colaborador sem preferência salva (primeiro acesso) → abre focado na própria coluna, como hoje.
- Gestores continuam abrindo na visão completa por padrão, mas se entrarem em foco manualmente esse foco também é lembrado ao voltar.
- A preferência é por usuário e sobrevive à navegação dentro do app; se o usuário trocar de conta, a preferência do outro usuário não é aplicada.

### 3. Coerência do foco restaurado
- Se a coluna salva não existir mais no quadro (colaborador removido, filtro de área/permissão sem aquela coluna), o foco é descartado silenciosamente e a visão completa é exibida — sem tela vazia.

## Detalhes técnicos

- `KanbanCentralPage.tsx`:
  - `focusedColumnId` passa a ser inicializado de forma sincronizada (lazy initializer) a partir de `localStorage`, com chave por usuário (`kanban_focus_column:<userId>`), quando o id do usuário já está disponível; caso contrário, é resolvido no mesmo passo em que a decisão de foco é liberada.
  - Novo estado `focusDecisionReady`; o gate de carregamento em ~L1975 passa a ser `tenantLoading || loading || permissionsLoading || roleLoading || !focusDecisionReady`.
  - `changeFocusColumn` grava/limpa a preferência (`""` para "sem foco") junto com `setFocusedColumnId`, mantendo a animação FLIP atual intacta.
  - O efeito de auto-foco atual (com `kanban_auto_focus_done` em `sessionStorage`) é substituído pela lógica de preferência persistida; a chave antiga deixa de ser usada.
  - Após as colunas serem calculadas, um efeito valida se `focusedColumnId` existe entre elas; se não, limpa o foco.
