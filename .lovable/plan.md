## Contexto verificado

- Em `src/components/FunctionPermissionsModal.tsx`, a etapa `aguardando_cliente` aparece na aba **Tempo estimado** com input editável (linhas 637-677) e entra no cálculo de **Total do ciclo** via `rowSubtotal` (linhas 432-442), já que é `STAGE_KIND = "espera"` mas não é excluída dos totais.
- Em `src/lib/flowFunctions.ts` (linhas 17-28), `aguardando_cliente` já é tratada como estado de espera e não compete por slot operacional; `src/lib/reorderSequence.ts` não usa a duração dessa etapa. Ou seja, o número configurado hoje é inerte — só confunde.
- A configuração real da espera (horas de espera, horários de retorno, reenvios) já existe na aba **Retorno do cliente** (`saveAwaitingConfig`, linhas 451-476).

## Ajuste proposto

1. **Manter a coluna "Aguardando cliente"** na aba Tempo estimado (para leitura do fluxo completo), mas sem input:
   - Renderizar a célula como estado, não como número: um chip discreto “sem prazo” (ícone de relógio/pausa, texto `text-muted-foreground`), com tooltip “Estado de espera pelo cliente — configurado na aba Retorno do cliente”.
   - Cabeçalho da coluna recebe estilo neutro/tracejado indicando “estado”, distinto das colunas de produção.
2. **Excluir da soma**: criar um conjunto `UNTIMED_STAGE_KEYS = ["aguardando_cliente"]` e ignorá-lo em `rowSubtotal`, para que não afete **Total produção** nem **Total do ciclo**.
3. **Renomear/reescrever a legenda** para refletir a nova semântica: “Total do ciclo = produção + revisões + envio ao cliente + publicação (não inclui o tempo em que o card fica parado com o cliente)”.
4. **`resetDurationsForType`** passa a ignorar a etapa sem prazo (não grava/limpa duração para ela).
5. **Aba Participação**: sem alteração — continua possível marcar se a etapa `aguardando_cliente` participa do fluxo de cada tipo de demanda.
6. **Ponteiro para a configuração certa**: pequeno link/texto na célula ou na legenda indicando que a espera é configurada em “Retorno do cliente”.

## Detalhes técnicos

- Arquivo único: `src/components/FunctionPermissionsModal.tsx`.
- Nada muda no banco: durações antigas de `aguardando_cliente` em `flow_functions.config.durations` simplesmente deixam de ser lidas/exibidas (opcionalmente limpas no reset da linha).
- Nenhuma mudança em `reorderSequence.ts` / `flowDurations.ts`, pois já não consomem essa duração.
