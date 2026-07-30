## Diagnóstico (verificado no banco e no código)

- Existem **49 registros** em `client_touchpoints`, mas **todos** com `source = auto`, `touchpoint_type = entrega` e **`subclient_id` nulo** (são de clientes de Mídia, gerados ao passar por `enviar_cliente`/`aguardando_cliente`).
- A tela lê `loadSystemsClientHealth`, que filtra `client_touchpoints` com `.not("subclient_id","is",null)` → resultado zero, logo "Último contato: nunca registrado" para Bellotti, LEAL e Pontes Gestal.
- Existem **3 demandas** com cliente solicitante e origem de cliente (`cliente_solicitacao` ×2, `cliente_feedback` ×1, todas `work_area = sistemas`, com `subclient_id` e `subclient_ids` preenchidos) — ou seja, **há evidência de contato, mas nada no sistema converte isso em touchpoint**.
- Causa raiz: `recordStageTouchpoint` é o único gerador automático, e ele (a) só dispara em etapas voltadas ao cliente, (b) grava apenas `client_id`, nunca `subclient_id`. Não existe nenhum registro de contato no momento da **criação** do card com origem de cliente.

## Correções propostas

### 1. Registrar contato na origem do card (novo gatilho)
Criar `recordOriginTouchpoint(tenantId, demandId)` em `src/lib/recordTouchpoint.ts`:
- Mapeia origem → tipo: `cliente_solicitacao` → `solicitacao`, `cliente_feedback` → `feedback`, `interno` → nenhum.
- Grava **um touchpoint por subcliente** presente em `subclient_ids` (fallback para `subclient_id`), com `client_id` = empresa do card, `source = "auto"`, `occurred_at` = criação do card, resumo com o título.
- Idempotente por (demanda, subcliente, tipo).
- Chamado na criação do card e quando a origem/os solicitantes são alterados no `TaskCard`.

### 2. Fan-out por subcliente nas etapas de cliente
`recordStageTouchpoint` passa a ler também `subclient_ids`/`subclient_id` da demanda e inserir uma linha por subcliente (mantendo a linha da empresa, para não quebrar o painel de Mídia). Idempotência por (demanda, subcliente, tipo, dia).

### 3. Backfill dos dados existentes (migração SQL)
- Inserir touchpoints de origem para todas as demandas já criadas com `origin <> 'interno'` e subcliente definido (usa `created_at` como `occurred_at`).
- Inserir touchpoints de entrega por subcliente a partir de `demand_flow_history` para transições que caíram em `enviar_cliente` / `aguardando_cliente` / `entregar_cliente` / `feedback_cliente`.
- Com `NOT EXISTS` para não duplicar; sem alterar as 49 linhas atuais.

### 4. Cálculo de saúde resiliente (não depender só da tabela)
Em `loadSystemsClientHealth`: considerar como "último contato" o máximo entre (a) touchpoints do subcliente e (b) a data de criação da demanda mais recente com origem de cliente daquele subcliente. Assim a tela nunca mostra "nunca registrado" havendo evidência, mesmo que o registro automático falhe. O motivo exibido indica a fonte ("via demanda").

### 5. Gráfico e histórico coerentes
`loadSubclientTouchpointTimeline` e `buildCadenceSeries` passam a usar a mesma lista consolidada (touchpoints + contatos derivados de demandas), corrigindo as linhas retas de 90–185 dias do gráfico e populando o painel "Histórico" de cada cliente.

## Detalhes técnicos

- Arquivos: `src/lib/recordTouchpoint.ts`, `src/lib/clientHealth.ts`, `src/lib/proceedDemand.ts`, `src/components/TaskCard.tsx`, `src/components/customer-success/CadenceLineChart.tsx`, mais uma migração de backfill.
- Sem mudanças de schema: `client_touchpoints.subclient_id` já existe e tem RLS/grants.
- Nenhuma alteração no comportamento do painel de Mídia (`loadClientHealth` continua por `client_id`).
