# Arrastar cards no Escritório Virtual: trocar por arraste por ponteiro

O arraste atual usa o drag-and-drop nativo do HTML5 (`draggable` + `dataTransfer`). Nesse cenário ele é frágil: a folha da fila vive dentro de um painel em portal que é ocultado durante o arraste, e as mesas ficam dentro de containers com `transform: scale(...)`. O sintoma relatado (nada acontece ao arrastar; destaque azul preso nas mesas) é compatível com o drag nativo nunca iniciar ou ser cancelado — mas isso ainda não está confirmado, então a primeira etapa é verificar antes de trocar tudo.

## O que vamos fazer

1. **Confirmar o comportamento atual** (passo de investigação): abrir a tela e observar se o arraste inicia, se a mesa de destino reage e se o estado de arraste é limpo. O resultado decide se o passo 2 é aplicado integralmente.

2. **Substituir o arraste nativo por arraste por ponteiro** (pointer events), que funciona igual no cenário 2.5D, dentro do painel lateral e no card do monitor:
   - Segurar ~250ms (ou mover ~6px) inicia o arraste — clique curto continua abrindo o card.
   - Um "ghost" leve (folha com o título) segue o cursor.
   - A mesa sob o cursor é detectada por posição e recebe destaque; ao soltar fora de qualquer mesa, nada acontece.
   - Soltar sobre outra mesa chama exatamente o mesmo fluxo canônico de hoje (guard de saída de passagem + `smartAdministrativeReassign`), sem nova regra de negócio.

3. **Limpeza garantida do estado visual**: fim de arraste, cancelamento, `Esc` ou perda de foco sempre limpam o card em arraste e o destaque das mesas (fim do retângulo azul preso).

4. **Painel lateral**: ao segurar um card da fila, o painel se oculta (continua montado) e reaparece quando o arraste termina — comportamento já pretendido, agora sem depender do drag nativo.

5. **Ver a animação de transferência**: hoje o "ghost card" entre mesas depende do evento realtime/refetch. Vamos disparar a animação também localmente logo após uma transferência bem-sucedida (mesmo dedupe já existente evita animação duplicada quando o realtime chegar).

## Detalhes técnicos

- Novo hook `src/hooks/useOfficeCardDrag.ts`: estado do arraste (cardId, origem, posição), long-press por `pointerdown` + threshold, `document.elementFromPoint` para achar a mesa alvo via `data-office-desk-user`, e `pointercancel`/`keydown Esc` para abortar.
- `OfficeDesk.tsx`: passa a expor `data-office-desk-user={userId}`, mantém o destaque de destino via prop (sem handlers de DnD nativo) e o card do monitor inicia o arraste por ponteiro.
- `OfficeQueueSheet.tsx`: itens da fila iniciam o arraste por ponteiro; remove `draggable`/`dataTransfer`.
- `Office.tsx`: consome o hook, renderiza o ghost em `position: fixed`, mantém `handleDropCard` intacto (guard + `smartAdministrativeReassign`) e enfileira a animação local após sucesso.
- Sem mudanças de banco, de regras de etapa ou de agendamento. Pilha continua única e leve.
