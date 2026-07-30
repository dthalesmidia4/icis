## Diagnóstico (verificado no banco)

Card `DIA DOS PAIS L&C` (id `e8e0c03b…`):
- Histórico: `enviar_cliente → aguardando_cliente` (30/07 13:16) e `aguardando_cliente → publicar` (30/07 14:41).
- Datas atuais: `due_date/due_time = 30/07 10:15`, `delivery_date/delivery_time = 30/07 10:20` — **não foram tocadas** na volta do cliente. Por isso o card reentrou já em atraso (vermelho).
- No histórico **não existe** nenhum `partial_delivered` para `enviar_cliente`. Em `proceedDemand.ts`, a transição para `aguardando_cliente` grava só `proceeded` + `sent_to_client` e nunca chama `recordStageDeliveries`. Logo o fluxo pode regredir para `enviar_cliente`, e o Registro de entregas não mostra essa entrega.

## Correções

### 1. Registrar a entrega da etapa ao enviar para o cliente
Em `src/lib/proceedDemand.ts`, nos dois ramos que entram em `aguardando_cliente` (`proceedDemand` e `proceedDemandTo`), chamar `recordStageDeliveries(tenantId, demandId, currentFunctionKey, [assignee, ...extras])` antes de retornar. Isso grava `partial_delivered` da etapa de origem (ex.: `enviar_cliente`), que já é o sinal usado por:
- `resolveFunctionForAssignee` / `stageCompletions` → impede o "Voltar demanda" de regredir para uma etapa já entregue;
- Registro de entregas por coluna → passa a mostrar corretamente "Enviar cliente" entregue naquele dia.

`recordStageDeliveries` continua ignorando `stage === "aguardando_cliente"` (espera do cliente não é entrega).

### 2. Reagendar o card ao voltar do cliente (fim do atraso falso)
O tempo parado no cliente não é responsabilidade do colaborador, então as datas antigas não devem ser herdadas. Nas transições em que `currentFunctionKey === "aguardando_cliente"` e o destino é uma etapa operacional (todo caso exceto voltar para `enviar_cliente`), além de limpar `client_wait_started_at`/`client_resend_count`, aplicar novo início/fim:

- Novo `due_date`/`due_time` = **agora**, arredondado para o próximo múltiplo de 5 minutos.
- Novo `delivery_date`/`delivery_time` = início + a duração da etapa de destino, usando a duração já definida em `src/lib/flowDurations.ts` (mesma fonte usada pelo reorganizador); se não houver duração configurada, preserva a duração anterior do card (fim − início) e, na falta dela, usa o padrão da etapa.
- Se o novo fim cruzar o fim do expediente da área (`work_area`), manter o comportamento do reorganizador: não estourar o dia — apenas alocar no primeiro horário válido; o reorganizador da coluna pode reposicionar depois.
- Aplicar isso no mesmo `update` já existente (`proceedPayload` / `updatePayload`), sem query extra.

Efeito: o card volta como "em andamento" agora, e não em atraso.

### 3. Botão "Cliente aprovou" no card
Nenhuma mudança de UI necessária — ele usa `proceedDemand`, então herda os dois comportamentos acima automaticamente.

## Notas técnicas

- Arquivos: `src/lib/proceedDemand.ts` (principal) e, se preciso, um helper pequeno de reagendamento em `src/lib/flowDurations.ts`.
- Regressão controlada: o reagendamento só dispara quando a etapa de origem é `aguardando_cliente`; nenhuma outra transição muda datas.
- Volta `aguardando_cliente → enviar_cliente` (reenvio) continua sem mexer em datas.
- Cards já retornados antes da correção (como o `DIA DOS PAIS L&C`) mantêm as datas antigas; podem ser corrigidos pelo reorganizador da coluna ou manualmente.
