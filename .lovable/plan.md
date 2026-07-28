## Diagnóstico

**1. Visualização quebrada (aba "Tempo estimado")**
No print, as colunas finais (`Revisar publicação`, `Total`, botão de reset) somem por baixo do lado direito do modal. Causa: `DialogContent` usa largura padrão (~`max-w-lg/2xl`) e a tabela tem 12 colunas + botão. O `overflow-auto` do wrapper existe, mas o próprio `DialogContent` limita a largura visível — dá para rolar horizontalmente, mas visualmente parece cortado / fade escuro. Fix: aumentar `max-w` do `DialogContent` (algo como `max-w-[95vw]` / `xl:max-w-[1200px]`) e garantir que o container da tabela tenha scroll horizontal claro.

**2. Retorno de "Aguardando cliente" a cada 4h — NÃO EXISTE hoje**
Confirmei via busca: não há nenhum mecanismo automático de retorno de `aguardando_cliente` → `enviar_cliente`. Hoje o retorno é 100% manual (via botão "voltar demanda" em `proceedDemand.ts:404`). Não existe cron, timer, edge function ou trigger nesse fluxo. A percepção de "volta a cada 4h" provavelmente vem do próprio colaborador movendo. Vamos **criar** esse retorno automático do zero.

---

## Plano

### A. Corrigir visualização do modal de fluxo
- `FunctionPermissionsModal.tsx`: aumentar largura do `DialogContent` para `max-w-[95vw]` (com um teto tipo `xl:max-w-[1400px]`).
- Melhorar o wrapper da tabela para deixar o scroll horizontal explícito e a última coluna "Total" ficar sticky à direita (opcional; se ficar complicado, mantém scroll simples).
- Ajuste idêntico para a aba "Participação" (mesmo problema).

### B. Retorno automático de "Aguardando cliente" com contagem de reenvios

**B.1 — Schema (migração)**
- `demands`: adicionar
  - `client_wait_started_at timestamptz` — quando entrou em `aguardando_cliente` na última rodada.
  - `client_resend_count int not null default 0` — quantas vezes voltou para `enviar_cliente`.
  - `client_last_resend_at timestamptz`.
- `flow_functions.config` (JSONB, já existe): quando `function_key = 'aguardando_cliente'`, passa a aceitar:
  - `wait_hours` (default 24): tempo mínimo em "Aguardando cliente" antes de ser elegível para retornar. Substitui semanticamente o valor de "Tempo estimado" para essa função (que hoje é minuto). Renderizar como "dia(s) / horas" na aba de tempo.
  - `return_times`: array de horários locais (ex.: `["10:00", "15:00"]`) em que o cron devolve os cards para `enviar_cliente`. Configurável.
  - `max_resends` (opcional, default null = ilimitado): trava de segurança.

**B.2 — Lógica de retorno (edge function + cron)**
- Nova edge function `return-awaiting-client-cards`:
  - Roda por tenant, lê `flow_functions.config` do `aguardando_cliente`, calcula quais cards já ultrapassaram `wait_hours`, e, se a hora atual (timezone do tenant) bate com algum `return_times` (janela de tolerância ±30 min desde a última execução), move para `enviar_cliente`:
    - `current_function_key = 'enviar_cliente'`
    - `client_resend_count += 1`
    - `client_last_resend_at = now()`
    - insere `demand_flow_history` (`action = 'auto_return_from_client'`, metadata com `resend_count`)
    - preserva `assigned_to`
  - Respeita `max_resends` quando configurado.
- Agendar via `pg_cron` de hora em hora (`0 * * * *`) chamando a edge function com `service_role`. (Migração de dados-sensíveis via `supabase--insert`, não via migration tool, conforme instrução de `pg_cron`.)

**B.3 — proceedDemand.ts**
- Ao entrar em `aguardando_cliente`: setar `client_wait_started_at = now()`.
- Ao voltar manualmente para `enviar_cliente`: também incrementar `client_resend_count` (mesma semântica do automático) para consistência.

**B.4 — UI**
- **Card (KanbanCard/TaskCard)**: badge discreto "Reenviada 2x" quando `client_resend_count > 0`; badge "Aguardando cliente há Xh" no grupo colapsado.
- **Aba "Tempo estimado"** (`FunctionPermissionsModal`): para a coluna `Aguardando cliente`, trocar input de "minutos" por controle específico:
  - Campo "Tempo mínimo antes de reenviar" em horas.
  - Editor de "Horários de retorno" (chips de horários HH:MM adicionáveis).
  - Campo opcional "Máximo de reenvios".
  - Persistidos em `flow_functions.config` desse `function_key` (tenant-wide).
- Sinalização no card em "Aguardando clientes" quando está elegível para retorno no próximo horário configurado.

### C. Compatibilidade
- Se `return_times` estiver vazio → não faz retorno automático (comportamento atual, só manual).
- Cards que já estão em `aguardando_cliente` sem `client_wait_started_at` recebem o valor via backfill = `updated_at` na migração.

---

## Detalhes técnicos

**Migração SQL principal**
```sql
ALTER TABLE public.demands
  ADD COLUMN client_wait_started_at timestamptz,
  ADD COLUMN client_resend_count int NOT NULL DEFAULT 0,
  ADD COLUMN client_last_resend_at timestamptz;

UPDATE public.demands
SET client_wait_started_at = updated_at
WHERE current_function_key = 'aguardando_cliente'
  AND client_wait_started_at IS NULL;
```

**Edge function**: usa `SUPABASE_SERVICE_ROLE_KEY` internamente; cron agenda via `net.http_post` com anon key + verificação de segredo no header.

**Cron via `supabase--insert`** (dado sensível, não migration tool):
```sql
select cron.schedule(
  'return-awaiting-client-hourly',
  '0 * * * *',
  $$ select net.http_post(url:='.../functions/v1/return-awaiting-client-cards', ...) $$
);
```

Arquivos alterados:
- `src/components/FunctionPermissionsModal.tsx` (largura + editor de retorno)
- `src/lib/proceedDemand.ts` (setar wait_started_at, incrementar resend no manual)
- `src/components/KanbanCard.tsx` / `src/components/TaskCard.tsx` (badges de reenvio)
- `src/pages/KanbanCentralPage.tsx` (badge no header do agrupamento "Aguardando clientes")
- Nova: `supabase/functions/return-awaiting-client-cards/index.ts`
- Migração + `supabase--insert` do cron.
