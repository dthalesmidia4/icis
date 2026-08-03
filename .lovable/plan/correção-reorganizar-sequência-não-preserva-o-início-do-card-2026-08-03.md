# Correção: reorganizar sequência não preserva o início do card em andamento

## Problema observado

Na coluna do Henrique, o primeiro card ("Atividades SmartVety", etapa *Especificar em andamento*) tem início **27/07 13:30** e término **03/08 10:56**. Ao abrir "Reorganizar sequência", a proposta troca o início para **03/08 09:23** (o horário-base do cálculo) e marca o card como "reagendado", apagando o início histórico.

## Causa confirmada

Em `src/lib/reorderSequence.ts`, o card do topo é detectado corretamente como em andamento (`inProgressFirst`), mas o trecho que trata "em andamento com término futuro" (linhas ~1101-1106) faz:

```text
start = agora
end   = término original
```

Ou seja, ele preserva o término, mas sobrescreve o início com o horário atual. O caminho que existe para preservar o início histórico (`keepStart` + `allocStart`) só é acionado quando o card está atrasado (`treatAsStuck`), não neste caso.

Além disso, essa preservação só acontece quando o término original cai **no mesmo dia** de hoje; um card em andamento cujo término é em outro dia perde início e término.

## Correção proposta

Em `src/lib/reorderSequence.ts`, no cálculo do card em andamento (sem ajuste manual):

1. Manter o término vigente e agendar apenas o tempo restante a partir de agora (comportamento atual), mas usar o mesmo mecanismo já existente de `allocStart`/`keepStart`: o intervalo realmente ocupado na agenda passa a ser `agora → término`, enquanto o **início exibido e gravado continua sendo o início histórico** do card.
2. Remover a restrição de "mesmo dia": qualquer card em andamento com término futuro tem o início preservado (o término segue sendo o original).
3. Com o início preservado e o término inalterado, o card deixa de ser contado como "reagendado" na proposta e passa a exibir o selo de execução em vez de linha riscada, e nenhum `UPDATE` é enviado para ele ao aplicar.
4. Os cards seguintes continuam sendo empilhados a partir do término real desse card em execução (o cursor segue usando `allocStart`/`end`), então nada colide.

## Detalhes técnicos

- Arquivo único: `src/lib/reorderSequence.ts`, bloco `if (!manualEnd && !treatAsStuck && inProgressFirst && ...)`.
- Reaproveitar `allocStart` (já capturado antes) para o cursor e os bloqueios, e `start = origStart` para o resultado apresentado.
- `changed` é derivado da comparação com `due_date/due_time/delivery_date/delivery_time` originais, então a preservação já zera o "reagendado" sem lógica extra.
- `ReorderSequenceModal.tsx` não precisa mudar: ele apenas renderiza a proposta e envia os cards com `changed === true`.
