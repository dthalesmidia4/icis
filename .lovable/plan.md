## Situação atual (verificada)

- `flow_functions` (tenant Mídia) tem: planejar(0) → criar_roteiro(1) → criar_arte(2) → captar(3) → revisar_captacao(4) → gerar_video(5) → editar_video(6) → revisar(7) → enviar_cliente(8) → aguardando_cliente(9) → publicar(10) → revisar_publicacao(11). **Não existe `revisar_roteiro`.**
- `proceedDemand()` sempre escolhe o próximo responsável por `pickAssigneeForFunction` (menor carga), **nunca mantém a pessoa atual** e **nunca pula etapa**. Ou seja: hoje o mesmo colaborador pode acabar revisando o próprio trabalho, e não existe "sticky" para quem já é responsável pela etapa seguinte.
- `demand_type_flow_rules` define required/disabled por tipo (`criar_roteiro` é required em vídeo captado, vídeo gerado e anúncio; disabled em carrossel/estático/outro).

## O que será feito

### 1. Nova etapa `revisar_roteiro` (banco)
- Inserir função `revisar_roteiro` — "Revisar roteiro" — logo após `criar_roteiro` (reposicionando as demais).
- Inserir regras em `demand_type_flow_rules`: `required` exatamente nos tipos em que `criar_roteiro` é required; `disabled` nos outros.
- Semear `collaborator_function_assignments` de `revisar_roteiro` para quem já tem `revisar` permitido (senão a etapa fica sem candidatos).

### 2. Inteligência de atribuição no `proceedDemand`
Duas regras novas, aplicadas ao calcular a próxima etapa:

- **Sticky em etapas de produção** (`criar_roteiro`, `criar_arte`, `captar`, `gerar_video`, `editar_video`, `enviar_cliente`, `publicar`): se o responsável atual (ou um dos `additional_assignees`) já tem essa função permitida, o card **fica com ele** em vez de sortear por carga. Caso contrário, mantém a escolha por menor carga.
- **Revisão nunca é auto-revisão** (`revisar_roteiro`, `revisar_captacao`, `revisar`, `revisar_publicacao`): o candidato escolhido exclui quem executou a etapa anterior (responsável + entregas parciais registradas em `demand_flow_history`). Se sobrar candidato → vai para ele; **se o único candidato possível for o próprio executor → a etapa de revisão é pulada** e o fluxo avança para a etapa seguinte (com a mesma lógica, em cascata, registrando no histórico `action: proceeded` com `metadata.skipped: ["revisar_roteiro"]`).

Isso reproduz exatamente o exemplo: Lúcia cria (planejar) → prosseguir vai para `criar_roteiro` e **fica com ela** se ela tiver a função; se só outra pessoa tem, vai para essa pessoa; essa pessoa prossegue → `revisar_roteiro` cai na Lúcia (revisor diferente do executor); se a Lúcia mesma tivesse feito o roteiro e fosse a única revisora, a revisão é pulada.

### 3. Pontas soltas que serão tratadas (do levantamento do fluxo)
- `aguardando_cliente` e `publicar` continuam com o tratamento especial existente (mantêm responsável / carimbam envio) — o sticky não altera esse caminho.
- `regressDemand` / popover "Voltar demanda": passa a considerar `revisar_roteiro` na sequência e continua respeitando etapas já concluídas por usuário (`stageCompletions`).
- `resolveFunctionForAssignee` (troca manual de responsável) recebe a mesma exclusão de auto-revisão, para não empurrar alguém para revisar o próprio trabalho.
- `AwaitingClientActions` e o atalho "Cliente aprovou · enviar para X" usam `getPipelineSequence`, que passa a incluir a etapa nova — o rótulo continua correto.
- `reorderSequence` / durações por etapa: `revisar_roteiro` herda a duração padrão de revisão (mesmo tratamento de `revisar_captacao`); nada bloqueia a alocação.
- Cards já existentes em `criar_roteiro` continuam válidos: ao prosseguir, passam pela nova etapa (ou pulam, conforme a regra).
- Etapas de revisão pulada não geram entrega falsa: nenhum `partial_delivered` é gravado para etapa não executada.

### Técnico
- Migração SQL: insert em `flow_functions`, reposicionamento, inserts em `demand_type_flow_rules` e `collaborator_function_assignments` (com GRANTs já existentes nas tabelas).
- `src/lib/flowFunctions.ts`: `isReviewFunction` passa a reconhecer `revisar_roteiro` (já cobre via prefixo `revis`), e novo helper `isProductionFunction`.
- `src/lib/proceedDemand.ts`: nova função interna `resolveNextStageAndAssignee()` com sticky + skip em cascata, usada por `proceedDemand` e `jumpToFunction`.
- `src/lib/initialFlowFunction.ts`: exclusão de auto-revisão em `resolveFunctionForAssignee`.
