## Diagnóstico (confirmado no banco)

O card "Teste" está em `aguardando_cliente` com `client_wait_started_at = null`. O histórico mostra a transição real: `planejar → aguardando_cliente` (pulou `enviar_cliente`).

Hoje o carimbo de data só é gravado quando a etapa **anterior** é exatamente `enviar_cliente` (`src/lib/proceedDemand.ts`, nas duas funções: `proceedDemand` e `jumpToFunction`). Qualquer outro caminho até `aguardando_cliente` entra sem data — por isso o pill mostra só "Enviado pela 1ª vez ao cliente", sem data/hora.

## O que fazer

### 1. Gravar a data em toda entrada em "Aguardando clientes"
Em `src/lib/proceedDemand.ts`, trocar a condição: sempre que a etapa **destino** for `aguardando_cliente` (independentemente da origem), preencher `client_wait_started_at = now()`. Aplicar em `proceedDemand` e em `jumpToFunction`, mantendo a regra atual de preservar o responsável quando a origem é `enviar_cliente`.

Também garantir que ao sair de `aguardando_cliente` os campos sejam limpos (já existe) e que o reenvio automático continue incrementando `client_resend_count`.

### 2. Backfill do card atual
Migração simples: preencher `client_wait_started_at` dos cards em `aguardando_cliente` que estejam nulos, usando o `created_at` da última entrada em `demand_flow_history` com `to_function_key = 'aguardando_cliente'`.

### 3. Registrar cada envio no histórico
Ao entrar em `aguardando_cliente`, gravar em `demand_flow_history` uma linha com `action = 'sent_to_client'` e `metadata = { send_number }`, além da linha `proceeded` já existente. O reenvio automático (`return-awaiting-client-cards`) já sabe a contagem; a numeração vem de `client_resend_count + 1`.

### 4. Consulta discreta dentro do card
No card do Kanban (`src/components/KanbanCard.tsx`), o pill "Enviado pela Nª vez ao cliente em dd/mm hh:mm" vira clicável (ícone pequeno de histórico ao lado, sem aumentar a altura do card). Ao clicar, abre um popover leve listando os envios:

```text
Envios ao cliente
1º envio — 29/07/2026 13:25
2º envio — 30/07/2026 09:10  (reenvio automático)
```

Os dados vêm de `demand_flow_history` (entradas `sent_to_client`), carregados sob demanda ao abrir o popover. Se não houver registros históricos, mostra o envio atual a partir de `client_wait_started_at` / `client_last_resend_at`.

O mesmo popover fica disponível na lista do colaborador (`src/pages/CollaboratorDemands.tsx`), acionado pelo mesmo texto.

## Detalhes técnicos
- Arquivos: `src/lib/proceedDemand.ts`, `src/components/KanbanCard.tsx`, novo `src/components/kanban/ClientSendHistoryPopover.tsx`, `src/pages/CollaboratorDemands.tsx`, `src/pages/KanbanCentralPage.tsx` (passar `demandId`/`tenantId` ao pill).
- Uma migração de backfill (somente UPDATE de dados, sem mudança de schema).
- Nenhuma alteração no realtime além do que já existe.
