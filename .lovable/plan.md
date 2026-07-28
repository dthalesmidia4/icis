## Auditoria — Retorno automático do cliente

### O que já está funcionando
- Migração aplicada: colunas `client_wait_started_at`, `client_resend_count`, `client_last_resend_at` + índice parcial.
- Edge function `return-awaiting-client-cards` deployada.
- Cron `return-awaiting-client-hourly` ativo (schedule `0 * * * *`).
- `proceedDemand.ts` inicializa `client_wait_started_at` ao entrar em `aguardando_cliente` (fwd) e incrementa `client_resend_count` + limpa o timer ao voltar manualmente para `enviar_cliente`.
- Modal "Configurar funções do fluxo" tem a aba **Retorno do cliente** com wait_hours, max_resends e horários.
- KanbanCentralPage renderiza badges "Reenviado Nx" e "Xh aguardando" na seção Aguardando Clientes.

### Pontas soltas encontradas

**1. Bug crítico — chave de config incompatível entre UI e cron**

O modal salva a configuração em `flow_functions.config.client_return.{wait_hours,return_times,max_resends,timezone}` (linhas 186 e 350 de `FunctionPermissionsModal.tsx`).

A edge function `return-awaiting-client-cards/index.ts` lê `config.wait_hours`, `config.return_times`, `config.max_resends` diretamente na raiz de `config`.

Resultado: a cron sempre entra no ramo `skipped: "no_return_times"` e nenhum card é devolvido automaticamente. Todo o pipeline de retorno automático está inerte hoje.

**2. Timer não é limpo em outras transições saindo de `aguardando_cliente`**

Só o caminho `aguardando_cliente → enviar_cliente` (regress manual) limpa `client_wait_started_at`. Se o card avançar para `agendar_publicacao` (ou qualquer outra função) via `proceedDemand`, o timestamp fica preso e o card, mesmo já publicado/agendado, aparece indefinidamente com badges "aguardando" caso volte para essa função futuramente. `client_resend_count` também deveria zerar quando o ciclo se encerra positivamente (aprovação do cliente).

**3. Menor — sem seletor de timezone na UI**

O modal já persiste `timezone: "America/Sao_Paulo"` como default e a edge function respeita `cfg.timezone`, mas não há campo visível. Aceitável para agora; documentar como default fixo até haver demanda multi-fuso.

### Plano de correção

**Passo 1 — Alinhar leitura da edge function ao formato aninhado `client_return`**

Em `supabase/functions/return-awaiting-client-cards/index.ts`, trocar:
```ts
const cfg = (row.config || {}) as Partial<AwaitingConfig>;
```
por:
```ts
const cfg = ((row.config || {}).client_return || {}) as Partial<AwaitingConfig>;
```
Manter fallback opcional para o formato flat (caso algum tenant já tivesse salvo assim) só se detectarmos dados legados — verificar rapidamente com um SELECT antes de decidir.

**Passo 2 — Limpar estado ao sair de `aguardando_cliente` para qualquer função ≠ `enviar_cliente`**

Em `src/lib/proceedDemand.ts`, nos caminhos `proceedDemand` (forward) e `jumpToFunction`, quando `currentFunctionKey === "aguardando_cliente"` e o destino não for `enviar_cliente`, incluir no update:
```ts
client_wait_started_at: null,
client_resend_count: 0,
client_last_resend_at: null,
```
Assim o ciclo encerra corretamente quando o cliente aprova e o card avança.

**Passo 3 — Verificação pós-correção**

- Rodar a edge function manualmente via `curl_edge_functions` fora do slot horário: deve retornar `skipped: "outside_window"` para tenants configurados (prova que agora enxerga o `return_times`).
- Confirmar em `demand_flow_history` que registros `auto_return_from_client` são gerados na próxima execução dentro do horário.
- Abrir um card de teste em `aguardando_cliente`, avançar para `agendar_publicacao` e verificar que `client_wait_started_at` e `client_resend_count` zeram na base.

Sem mudanças de UI, tabela, cron ou secrets — apenas edge function e `proceedDemand.ts`.