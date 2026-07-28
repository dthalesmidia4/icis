## Plano para corrigir o bug do modo “espiar”

### Diagnóstico confirmado
- A lógica atual troca `focusedColumnId` no `pointerenter` do título da coluna.
- A reversão depende quase só do `pointerleave` do board inteiro.
- Quando a coluna é movida/removida pela animação, o cursor deixa de estar sobre o título original, mas o evento esperado não é confiável porque o próprio elemento mudou de posição/desmontou.
- Resultado: o foco temporário fica preso e começa o ciclo de cliques/hover infinito relatado.

### Correção proposta
1. **Separar foco fixado de foco temporário**
   - Manter `pinnedFocusColumnId` apenas para clique.
   - Criar uma noção explícita de “peek temporário” iniciada por hover.
   - Ao clicar, converter para estado fixado e cancelar qualquer peek pendente.

2. **Trocar a reversão por detecção global de ponteiro**
   - Após ativar o peek, escutar `pointermove` em `window`.
   - Verificar com `document.elementFromPoint(x, y)` se o mouse ainda está sobre um acionador válido de foco.
   - Se não estiver, voltar imediatamente para o estado fixado anterior:
     - sem foco fixado: volta para visão geral;
     - com foco fixado: volta para o foco fixado.

3. **Marcar os títulos acionáveis com atributo estável**
   - Adicionar atributos como `data-focus-peek-trigger` e `data-focus-user-id` no botão/título da coluna.
   - Isso evita depender da posição antiga do elemento depois que a coluna anima para a esquerda.

4. **Remover a reversão baseada no `pointerleave` do board**
   - O board pode mudar de layout durante o hover, então `pointerleave` não é suficiente.
   - Manter no máximo como fallback simples, sem ser a regra principal.

5. **Garantir cancelamento limpo**
   - Limpar timers e listeners quando:
     - o usuário clicar para fixar/desfixar;
     - sair da página;
     - pressionar ESC;
     - o hover temporário terminar.

6. **Preservar a animação FLIP existente**
   - Não mexer na animação das colunas, apenas no controle de estado que decide quando entrar/sair.
   - A experiência esperada fica: passar o mouse “espia”; mover para qualquer outra área desfaz; clicar mantém.

### Validação
- Testar manualmente no Kanban Central:
  - hover em coluna normal entra no foco temporário;
  - mover mouse para fora volta para visão geral sem clique;
  - clicar fixa o foco;
  - com foco fixado, hover em título de subcoluna “espia” a visão geral;
  - mover mouse para fora volta ao foco fixado;
  - ESC limpa tudo;
  - sem loop infinito entre colunas.