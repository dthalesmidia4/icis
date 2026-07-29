## Diagnóstico (verificado)

O banco tem os dados corretos: os 3 cards em `aguardando_cliente` do Yön Contadores possuem `client_wait_started_at` preenchido (29/07/2026 13:25–13:26).

O problema está no mapeamento do Kanban Central: em `src/pages/KanbanCentralPage.tsx`, a consulta traz `*`, mas o objeto do card é montado campo a campo em `mapDemand` (linhas ~845-891) — e `client_wait_started_at` **não** está nessa lista. Logo, em `awaitingCardsSorted.map` a leitura `(card as any).client_wait_started_at` retorna `undefined`, e o pill cai no texto genérico "Enviado ao cliente", sem data. O mesmo vale para `client_resend_count`, usado por `AwaitingClientActions`.

## O que fazer

1. **`src/pages/KanbanCentralPage.tsx`**
   - Incluir em `mapDemand` (e no mapeamento equivalente do realtime insert, ~linha 620): `client_wait_started_at`, `client_resend_count` e `client_approved_at` (se existir na tabela).
   - Verificar que o mesmo objeto é usado pelas seções "Aguardando clientes" e pelo Modo Foco.

2. **`src/pages/CollaboratorDemands.tsx`**
   - Conferir se o mapeamento dessa tela também descarta `client_wait_started_at`; se sim, incluir o campo para a coluna "Enviado ao cliente em ..." funcionar.

3. **Rótulo redundante**
   - Confirmar em tela que o subtítulo do card exibe apenas o nome do cliente (sem "· Aguardando cliente"). O código já passa `statusName={undefined}` nessa seção; se ainda aparecer, ajustar a origem do rótulo.

## Verificação

Abrir `/kanban-central`, expandir "Aguardando clientes" na coluna da Lúcia e confirmar que cada card mostra **"Enviado ao cliente em 29/07/2026 13:25"** com o tempo relativo à direita, e que o botão "Cliente aprovou" continua funcionando.
