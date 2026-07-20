## Diagnóstico confirmado

1. **Header/breadcrumb**
   - O texto `Kanban Central` aparece no breadcrumb em `src/hooks/useBreadcrumb.tsx` para:
     - `/kanban-central`
     - `/scheduled`
   - Portanto, para o header ficar como solicitado, a rota deve exibir `Home > Visão Geral > Agendamentos`.

2. **Erro dos posts publicados no calendário**
   - A tabela `scheduled_publication_dispatches` usa os status reais:
     - `scheduled`
     - `dispatching`
     - `published`
     - `failed`
     - `cancelled`
   - O job `run-scheduled-dispatches` marca posts concluídos como `published` e preenche `published_at`.
   - A tela `Scheduled.tsx` está buscando status incorretos:
     - busca `sent`, mas o banco usa `published`
     - busca `canceled`, mas o banco usa `cancelled`
     - não busca `published`
   - Resultado: assim que um post é publicado, ele sai da consulta da tela e desaparece do calendário.
   - A consulta ao banco confirmou que existem **17 dispatches publicados** e **9 agendados**, mas o filtro atual da tela só captura os **9 agendados**.

## Plano de correção

1. **Renomear o header/breadcrumb**
   - Alterar `src/hooks/useBreadcrumb.tsx`:
     - `/kanban-central`: `Kanban Central` → `Visão Geral`
     - `/scheduled`: `Home > Visão Geral > Agendamentos`

2. **Corrigir a busca do calendário de agendamentos**
   - Em `src/components/Scheduled.tsx`, trocar o filtro de status para os valores reais do banco:
     - de `scheduled`, `dispatching`, `sent`, `failed`, `canceled`
     - para `scheduled`, `dispatching`, `published`, `failed`, `cancelled`

3. **Corrigir o badge/status visual no modal do dia**
   - Em `Scheduled.tsx`, trocar:
     - `sent` → `published` com label `Publicado`
     - `canceled` → `cancelled` com label `Cancelado`

4. **Usar a melhor data para posicionar publicados**
   - Ajustar a estrutura do card para também carregar `published_at`.
   - Priorizar a data assim:
     1. `published_at`
     2. `dispatched_at`
     3. `scheduled_at`
     4. `publish_date`
     5. `due_date`
   - Isso evita que um conteúdo já publicado apareça em data incorreta caso a demanda tenha sido movida ou alterada depois.

5. **Manter integridade do fluxo**
   - Não alterar banco, RLS, edge function ou status do job.
   - A correção será apenas de leitura/visualização, alinhando a tela aos status reais que o sistema já grava.

6. **Validação após implementar**
   - Confirmar no preview que datas passadas de julho exibem os posts `Publicado`.
   - Confirmar que o contador da tela sobe de 9 para incluir também os publicados.
   - Confirmar que o breadcrumb fica `Home > Visão Geral > Agendamentos`.