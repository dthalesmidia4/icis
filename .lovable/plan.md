## Objetivo

No card em "Aguardando clientes", quando ele já está pronto para publicar, o atalho vira:

**Cliente aprovou · Agendar post para 05/08 09:00 →**

Ao confirmar: cria o disparo de publicação, move o card para o status **Agendar Publicação**, desaloca o responsável, e o card some da coluna do colaborador — passando a ser visível em Conteúdos agendados.

## Verificações feitas (sem premissas soltas)

- **A publicação automatizada NÃO exige que o card venha de `publicar`.** `run-scheduled-dispatches` lê exclusivamente a tabela `scheduled_publication_dispatches` (status `scheduled` + `scheduled_at` vencido). Ele nem consulta `current_function_key` ou `status_id` do card para decidir publicar. Só usa `demands` para pegar a legenda mais recente (`post_caption`).
- **Depois de publicar, o próprio dispatcher reassume o card:** define status "Publicado", `current_function_key = 'revisar_publicacao'` e escolhe um revisor pela mesma regra de balanceamento do Prosseguir. Ou seja, deixar `assigned_to = null` durante o agendamento é seguro — o card volta com responsável na etapa de revisão de publicação.
- **A saída da coluna é automática:** o Kanban já filtra `baseCards` por `activeDispatchIds` (disparos `scheduled`/`dispatching`), então basta o disparo existir.
- **Conteúdos agendados** lista por dispatch (`Scheduled.tsx` busca dispatches e depois as demands por `card_id`), independente de responsável ou status — o card aparece lá corretamente.
- **Legenda não é obrigatória** para o disparo: `createOrUpdateScheduleDispatch` valida mídia final por tipo de conteúdo, data futura e redes sociais ativas do cliente — mas não exige caption. Então a legenda não entra como requisito bloqueante (a legenda usada na hora da publicação é sempre a `post_caption` mais atual).
- **Trigger `validate_demand_stage_assignment`** retorna cedo quando `assigned_to` é nulo — nenhum efeito colateral ao desalocar.
- **Se o disparo falhar** no futuro (`status = failed`), o card reaparece no quadro sem responsável, na coluna "Sem responsável" que já existe no Kanban — fica visível e recuperável, não some.

## Mudanças

### 1. `src/components/kanban/AwaitingClientActions.tsx`
- Novas props vindas do card: `clientId`, `publishDate`, `publishTime`, `caption`, `attachments`, `demandType`, `title`.
- **Estado "pronto para agendar"** (usado só para escolher o rótulo): tem `publish_date` + `publish_time`, o horário ainda é futuro e existe ao menos 1 anexo. As regras completas continuam sendo aplicadas por `createOrUpdateScheduleDispatch` no clique.
- Rótulos:
  - pronto → `Cliente aprovou · Agendar post para dd/MM HH:mm`; confirmação: `Confirmar agendamento para dd/MM HH:mm?`
  - não pronto → comportamento atual (`Cliente aprovou · Enviar para {próxima etapa}`).
- Ação de agendar, em ordem:
  1. `createOrUpdateScheduleDispatch(...)`. Se falhar, mostra o motivo exato em toast (ex.: "cliente sem redes conectadas", "anexe a imagem final") e **não altera o card** — nada de estado intermediário inconsistente.
  2. Sucesso → atualiza `demands`: `status_id` do status "Agendar Publicação" **resolvido pelo `pipeline_id` do próprio card** (não por um pipeline global), `current_function_key = 'publicar'`, `assigned_to = null`, e limpa `client_wait_started_at` / `client_resend_count` / `client_last_resend_at`. Se o status não existir naquele pipeline, mantém o status atual e segue (o disparo já garante a saída da coluna).
  3. Registra histórico: `proceeded` de `aguardando_cliente` → `publicar` e a entrega da etapa anterior via `recordStageDeliveries` (já exportado em `proceedDemand.ts`), preservando Registro de entregas e a trava anti-regressão.
  4. Toast de sucesso com data/hora e `onDone()`.
- Se já houver disparo ativo para o card (`hasActiveDispatch`), o helper apenas atualiza o disparo existente — sem duplicar.

### 2. `src/pages/KanbanCentralPage.tsx`
- Passar os dados do card para `AwaitingClientActions` (cliente, `publish_date`/`publish_time`, `post_caption` ou descrição, anexos, tipo, título).
- Nenhuma mudança na renderização das colunas.

## Pontas que este plano fecha

- Não há dependência de o card passar por "Publicar" para a automação funcionar.
- Regras de validação continuam em um único lugar (mesmo helper do modal de agendamento) — sem divergência entre atalho e modal.
- Fallback intacto: faltando qualquer requisito, o botão volta a ser o fluxo normal para "Publicar", nunca bloqueando a aprovação do cliente.
