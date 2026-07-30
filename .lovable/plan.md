## Diagnóstico (verificado no banco e no código)

Card `Hospital Veterinário Leal – vídeos : dia dos pais` (`df357810…`), tipo `video_captado`. Sequência configurada: Planejar → Criar roteiro → **Captar** → Revisar captação → **Editar vídeo** → Revisar → Enviar cliente → Aguardando cliente → Publicar → Revisar publicação.

Histórico real (`demand_flow_history`):
- 29/07 14:39 — `partial_delivered` **Letícia** (captar) → Eric vira responsável único da captação.
- 29/07 14:54 — `proceeded` de **Eric** com `from_function_key = editar_video` → `revisar` (Lúcia).
- 29/07 20:43 — card volta para `captar` com Letícia **sem nenhum registro no histórico**.

Duas causas distintas:

1. **Eric não aparece como "entregou a parte"**: `proceedDemand` confia no `currentFunctionKey` enviado pela tela (que estava `editar_video`, desatualizado) em vez de ler `demands.current_function_key`. Como a chave não era `captar`, o bloco que registra a entrega do último captador (`hadPriorCaptarPartialDelivery`) nunca rodou.

2. **Card voltou para "Captar" com a Letícia**: a mudança das 20:43 não passou por Voltar/Prosseguir (não há histórico). Foi a troca de **Responsável** no card, que chama `resolveFunctionForAssignee`. Como `revisar` não é função permitida da Letícia, a função caiu no fallback `allowedSeq[0]` — a **primeira** função permitida dela na sequência, ou seja, `captar`. O sistema regrediu o card para uma etapa que ela já havia entregue, e ainda sem registrar histórico.

A estrutura necessária **já existe**: `demand_flow_history` guarda `partial_delivered`, `proceeded`, `moved_back` com `from_user_id` e `from_function_key` — dá para saber quais etapas já foram concluídas e por quem.

## Correção

### 1. Fonte da verdade da etapa atual
Em `src/lib/proceedDemand.ts`, `proceedDemand`, `regressDemand` e `jumpToFunction` passam a ler `current_function_key` (e `assigned_to`, `additional_assignees`) direto do banco; o parâmetro vira apenas fallback. Isso elimina toda a classe de erros causada por estado desatualizado da tela.

### 2. Registro completo das entregas de captação
Com (1) corrigido, ao sair de `captar` o último captador passa a gerar seu `partial_delivered`. Também será feito um backfill pontual do registro faltante do **Eric** neste card, com a data/hora real da transição (29/07 14:54).

### 3. Novo helper de etapas já concluídas
Criar `src/lib/stageCompletions.ts`:
- `getStageCompletions(tenantId, demandId)` → mapa `function_key → { userIds[], lastAt }`, derivado de `proceeded`, `partial_delivered` e `delivered` no histórico.
- Usado pela troca de responsável, pelo Voltar e pela exibição no card.

### 4. Troca de responsável nunca regride o fluxo
Em `resolveFunctionForAssignee` (`src/lib/initialFlowFunction.ts`):
- Só considerar funções permitidas **na posição atual ou adiante**; remover o fallback para `allowedSeq[0]`.
- Descartar etapas que aquele usuário já concluiu (via helper do item 3) — no caso, Letícia pula `captar` e o card fica em `editar_video`.
- Se não houver etapa válida à frente, **manter a etapa atual** e avisar: "Letícia não tem função disponível a partir de Revisar — a etapa foi mantida".
- Registrar `manual_assignment` no histórico sempre que a etapa/responsável mudar por esse caminho.

### 5. Voltar demanda com escolha assistida
No `TaskCard`, o botão de voltar passa a abrir um seletor das etapas anteriores, cada uma com quem a executou e a data, marcando as já entregues com selo "já entregue" (selecionáveis, mas com confirmação). O padrão sugerido é a **última etapa anterior ainda pendente** (aqui: Editar vídeo / Eric), e o responsável sugerido é quem executou aquela etapa, em vez do colaborador de menor carga.

### 6. Visibilidade no card
O bloco "X entregou parte" passa a listar também quem concluiu a captação ao prosseguir (não só quem usou "Entregar parte"), com nome e horário.

## Detalhes técnicos
- Arquivos: `src/lib/proceedDemand.ts`, `src/lib/initialFlowFunction.ts`, `src/lib/stageCompletions.ts` (novo), `src/components/TaskCard.tsx`.
- Sem mudança de schema; apenas um `update`/`insert` pontual de backfill do registro do Eric.
