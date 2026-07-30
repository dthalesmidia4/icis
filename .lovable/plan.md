## Diagnóstico confirmado

O banco **está salvando corretamente**: a demanda **“Agente de Vacinas”** possui atualmente dois clientes em `subclient_ids` — **Bellotti** e **Pontes Gestal**.

A perda acontece na interface atual, **Evolução das Demandas**: ao carregar os cards, `ClientEvolution.tsx` não inclui `subclient_id`, `subclient_ids` nem `origin` no mapeamento. Assim, ao fechar e reabrir, o modal recebe um card sem esses campos e mostra a seleção vazia, embora os dados continuem no banco.

## Correção

1. **Completar o modelo compartilhado do card**
   - Declarar `work_area`, `origin`, `origin_note`, `subclient_id` e `subclient_ids` em `KanbanCardData`, eliminando os casts frágeis e garantindo que todas as telas preservem esses campos.

2. **Corrigir a tela Evolução das Demandas**
   - Mapear `subclient_id`, `subclient_ids` e `origin` ao carregar as demandas.
   - Atualizar também a lista local de cards quando a seleção mudar, não apenas o card aberto.
   - Reabrir o card usando os valores realmente persistidos.

3. **Fechar os caminhos equivalentes**
   - Auditar os demais pontos que abrem `TaskCard` e garantir que seus mapeamentos não descartem os mesmos campos.
   - Completar o handler de realtime do Kanban para propagar alterações de `subclient_id` e `subclient_ids`, evitando que uma atualização em tempo real substitua o estado correto por dados incompletos.

4. **Tornar o salvamento verificável**
   - Após o `UPDATE`, ler de volta os campos salvos e sincronizar o estado do modal com a resposta do banco.
   - Em caso de erro, restaurar a seleção anterior e mostrar a mensagem real, em vez de deixar uma seleção otimista que aparenta ter sido salva.

5. **Validar o fluxo real**
   - Na tela `/client-evolution`, selecionar dois clientes, fechar o card, reabrir e confirmar que ambos permanecem marcados.
   - Recarregar a página e repetir a verificação.
   - Confirmar que a mesma demanda continua atribuída aos dois clientes no Customer Success.