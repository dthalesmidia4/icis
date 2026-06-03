## Objetivo

Quando um card for movido para o status **Agendar Publicação**, o sistema:
1. Valida o card (cliente, mídia final, legenda, data/hora, redes conectadas).
2. Cria um **disparo interno** (`scheduled_publication_dispatches`) com status `scheduled`.
3. Um **cron** roda a cada minuto, executa disparos vencidos, publica nas redes do cliente e atualiza o card para **Publicado**.

A mudança de coluna **não** publica imediatamente — só registra o disparo.

---

## 1. Banco (migration)

**Tabela `scheduled_publication_dispatches`**
- `id`, `tenant_id`, `client_id` (FK `companies`), `card_id` (FK `demands`), `created_by`
- `content_type` (post | carrossel | video | video_capa)
- `scheduled_at` (timestamptz), `timezone` (text, default `America/Sao_Paulo`)
- `caption` (text)
- `media_files` (jsonb — array ordenado `{url, order, mime, role}`)
- `cover_file` (jsonb null)
- `social_accounts` (jsonb — quais redes conectadas do cliente serão usadas)
- `status` (text: `scheduled | dispatching | published | failed | cancelled`)
- `dispatched_at`, `published_at`, `error_message`, `external_post_ids` (jsonb)
- `created_at`, `updated_at`

GRANTs + RLS por `user_has_tenant_access(tenant_id)`. Service role total.
Índices: `(status, scheduled_at)`, `(card_id)`, `(client_id, scheduled_at)`.
Unique parcial: 1 disparo ativo (`status in ('scheduled','dispatching')`) por `card_id`.

Habilitar `pg_cron` e `pg_net`. Agendar cron a cada minuto chamando a edge function `run-scheduled-dispatches`.

---

## 2. Frontend — ao mover card para "Agendar Publicação"

No handler de mudança de status do Kanban (`Scheduled.tsx` / handler de drop), quando o destino for "Agendar Publicação":

1. Carregar dados do card: `client_id`, `tenant_id`, tipo de conteúdo, `publish_date`, `publish_time`, legenda final, anexos finais (do `card_attachments` marcados como finais), redes conectadas do cliente (`platform_logins` ou tabela equivalente).
2. Rodar **validações** (lista abaixo). Em qualquer falha → toast com mensagem padronizada do brief e **abortar** a mudança de status.
3. Se já existir disparo ativo → `ConfirmationModal` "Este card já possui uma publicação agendada. Deseja atualizar?"
   - Sim → `UPDATE` no disparo existente.
   - Não → cancelar.
4. Caso ok → `INSERT` em `scheduled_publication_dispatches` com `status='scheduled'`.
5. Atualizar status do card para `Agendar Publicação` (já existente).
6. Mostrar badge no card: **"Agendado para DD/MM/AAAA às HH:mm"**.

**Validações** (todas no client, espelhadas no edge function dispatcher):
- cliente vinculado, tipo de conteúdo, legenda final, data, horário (não passou)
- redes conectadas (>=1)
- post estático: 1 imagem final
- carrossel: ≥2 mídias finais com ordem, dentro do limite da rede (Instagram=10)
- video: arquivo de vídeo final
- video_capa: vídeo final + capa (se rede permitir)
- todos arquivos acessíveis (HEAD check opcional)

Mensagens exatamente como no brief.

---

## 3. Edge function `run-scheduled-dispatches` (cron, sem JWT)

A cada minuto:
1. `SELECT ... FROM scheduled_publication_dispatches WHERE status='scheduled' AND scheduled_at <= now() FOR UPDATE SKIP LOCKED LIMIT 20`.
2. Para cada disparo:
   - `UPDATE status='dispatching', dispatched_at=now()`.
   - Para cada `social_account`, chamar a API correspondente (Meta Graph para Instagram/Facebook; outras conforme conectadas) com o payload certo por `content_type`:
     - **post**: imagem + caption
     - **carrossel**: cria container por mídia (ordem preservada), depois `carousel_container` agregando todos, depois publica
     - **video**: upload + publish como REELS/video, caption
     - **video_capa**: video + thumbnail (se aceito)
   - Coletar `external_post_ids`.
   - Sucesso → `status='published', published_at=now()`, atualizar `demands.status` para "Publicado", salvar IDs.
   - Falha → `status='failed', error_message=...`. Card permanece em "Agendar Publicação" com badge de erro e botão "Tentar novamente" (re-enfileira).
3. Logs detalhados (`console.log`) — visíveis em Edge Function logs.

Token/credenciais das redes vêm das tabelas existentes do cliente (ex.: `platform_logins`). Nenhum segredo novo necessário neste passo se os tokens já estão por cliente; se faltarem, a função registra `failed` com mensagem clara.

---

## 4. UI — exibição

- **KanbanCard** (na coluna "Agendar Publicação"): se há disparo `scheduled`, mostrar pill "Agendado para DD/MM/AAAA às HH:mm". Se `failed`, pill vermelha com erro + botão "Tentar novamente".
- **TaskCard / modal**: aba/linha "Publicação agendada" com status, scheduled_at, redes alvo, links externos quando `published`.

---

## 5. Logs

Cada criação/execução grava em `console.log` da edge function e nos campos do próprio disparo (`error_message`, `external_post_ids`, timestamps). Auditoria suficiente para o brief.

---

## Detalhes técnicos

- **Tipos de conteúdo**: derivados de `demands.demand_type` mapeado para `post | carrossel | video | video_capa`.
- **Mídias finais**: lidas de `card_attachments` filtradas por flag final/aprovado, ordenadas por `order` (ou `created_at`).
- **Fuso**: armazenar `scheduled_at` em UTC + `timezone='America/Sao_Paulo'` para exibir.
- **Lock**: `FOR UPDATE SKIP LOCKED` evita execução dupla quando o cron rodar em paralelo.
- **Duplicidade**: unique partial index `(card_id) WHERE status IN ('scheduled','dispatching')`.
- **Sem segredos novos**: usa credenciais já guardadas por cliente. Se a integração das redes ainda não estiver implementada, o dispatcher fica preparado mas grava `failed` com mensagem "Integração X não configurada" — a parte de criação do disparo e cron já funciona end-to-end.

---

## Entregáveis

1. Migration: tabela + índices + RLS + cron job.
2. Edge function `run-scheduled-dispatches` (+ `config.toml` com `verify_jwt = false`).
3. Hook `useSchedulePublication` (validação + insert/update + modal de duplicidade).
4. Integração no handler de drop/status do Kanban.
5. Badge no `KanbanCard` e seção no `TaskCard`.
6. Botão "Tentar novamente" para disparos `failed`.

Após sua aprovação eu envio a migration (passa por aprovação separada do Supabase) e depois implemento código + edge function.