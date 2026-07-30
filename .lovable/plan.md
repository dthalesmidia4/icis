## Situação atual (verificada no código)

- `src/lib/proceedDemand.ts` grava `partial_delivered` **apenas** na etapa `captar` (bloco `hadPriorCaptarPartialDelivery` e `recordFlowHistoryForUsers` em torno das linhas 485-513). Em qualquer outra etapa, prosseguir grava só um `proceeded`.
- `src/components/TaskCard.tsx` (linhas 743-765) lista "quem entregou" com uma consulta fixa em `from_function_key = 'captar'` — por isso a entrega da Letícia em "Editar vídeo" nunca aparece.
- `src/lib/stageCompletions.ts` já trata `proceeded`, `partial_delivered` e `delivered` como conclusão de etapa, mas não é usado nessa parte da UI.

Ou seja: o dado da entrega da Letícia até existe (como `proceeded` de `editar_video`), mas não é registrado como entrega nem exibido. É fácil de resolver.

## Solução

### 1. Registrar entrega em qualquer etapa (backend/lib)
Em `src/lib/proceedDemand.ts`, ao avançar de uma etapa (`proceedDemand`, `deliverDemand` e `jumpToFunction` para frente):
- gravar, além do `proceeded` da transição, um `partial_delivered` para **cada responsável da etapa de origem** (o `assigned_to` e todos os `additional_assignees`), com `from_function_key` = etapa de origem e `metadata: { auto: true }`.
- generalizar a lógica hoje restrita a `captar`: a coleta de `additional_assignees` passa a valer para qualquer etapa.
- evitar duplicidade: quem já tem `partial_delivered` naquela etapa (via "Entregar minha parte") não recebe outro registro.
- não gravar entrega quando a transição é para/desde `aguardando_cliente` sem execução (envio ao cliente continua com o registro próprio) nem em `regressDemand`.

### 2. Mostrar as entregas por etapa (UI)
Em `src/components/TaskCard.tsx`:
- trocar a consulta fixa em `captar` pelo `getStageCompletions()` de `src/lib/stageCompletions.ts`.
- exibir as entregas agrupadas por etapa: nome da etapa + avatares/nomes de quem entregou + data/hora (mantendo o mesmo estilo de chip atual "N entregou parte").
- a etapa atual continua mostrando o botão "Entregar minha parte" quando houver múltiplos responsáveis.

### 3. Consistência com o "Voltar demanda"
Como o seletor de etapas anteriores já lê `stageCompletions`, as novas entregas passam automaticamente a aparecer nele com o executor correto — sem mudança adicional.

## Detalhes técnicos
- Arquivos: `src/lib/proceedDemand.ts`, `src/components/TaskCard.tsx` (e uso de `src/lib/stageCompletions.ts`).
- Sem mudança de schema: tudo usa `demand_flow_history` (`action = 'partial_delivered'`).
- Opcional (recomendado): backfill único convertendo `proceeded` históricos em entregas exibíveis — não é necessário, pois a UI passa a considerar `proceeded` como conclusão de etapa.
