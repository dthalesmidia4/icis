# Fluxo mais permissivo (etapa ↔ responsável) e reorganização com início editável

Duas frentes independentes, ambas com causa confirmada no código/banco.

## Parte 1 — Trocar etapa e trocar responsável nunca devem travar

Comportamento desejado (o que você descreveu):

- Mudei a **etapa** → o sistema resolve o responsável. Se o responsável atual estiver entre os habilitados daquela etapa, **mantém ele**.
- Mudei o **responsável** → o sistema resolve a etapa. Prefere a etapa atual (se ele a tem), senão a próxima etapa habilitada dele à frente; **se não houver nenhuma à frente, volta para a etapa habilitada mais próxima atrás** (registra como regressão). Só bloqueia se ele não tiver *nenhuma* etapa habilitada na área do card.

O que está causando os bloqueios hoje:

1. Ao trocar de etapa (`jumpToFunction`), o "manter quem já está no card" só vale para uma lista fixa de etapas (`STICKY_STAGES`); em `revisar*` o responsável atual é ativamente excluído. Resultado: a etapa muda de mãos sem necessidade, ou falha com "nenhum colaborador tem a função".
2. Ao trocar de responsável (`evaluateReassign`) só é aceito remapeamento **para frente**; sem etapa à frente a transferência é bloqueada com "X não tem a função Y na área Z".
3. A mesma regra existe no banco: `resolve_function_for_assignee` retorna `NULL` quando não há etapa permitida à frente, e o trigger `validate_demand_stage_assignment` transforma isso em erro — então mesmo corrigindo só o frontend o banco continuaria barrando.

Correções:

- **Sticky universal na troca de etapa**: se o responsável atual tem a função da etapa-alvo (na área do card), ele é mantido — inclusive em etapas de revisão, quando a troca é manual/regressão. A anti-autorrevisão continua valendo apenas no avanço automático ("Prosseguir").
- **Fallback para trás na troca de responsável**: quando não há etapa à frente, escolher a etapa habilitada imediatamente anterior à atual e prosseguir, marcando a mudança como `moved_back` no histórico de fluxo.
- **Banco alinhado**: `resolve_function_for_assignee` passa a devolver a etapa habilitada anterior mais próxima como último recurso (antes de `NULL`), de modo que o trigger remapeie em vez de lançar exceção. O bloqueio permanece só no caso real de incompatibilidade total.
- **Mensagens úteis**: quando houver remapeamento, o toast diz para qual etapa o card foi (ex.: "Movido para Criar arte com Eric — etapa ajustada ao fluxo dele"). Bloqueio total continua explicando que faltam funções na área.

## Parte 2 — Reorganizar sequência: início editável e cascata

Reproduzi o cenário com o motor real: com o primeiro card em andamento (início hoje 09:00, término amanhã 10:00), o segundo card é jogado para amanhã 10:05. Ao fixar manualmente o início do primeiro para hoje 14:30, o motor recalcula corretamente e o segundo card cai para hoje 15:05 — ou seja, **o motor já faz a cascata; o que falta é a interface**.

Causa confirmada: em `ReorderProposalRow`, quando a proposta é de um card em execução (`keepStart`), o painel "Ajustar" só oferece **novo término** — não existe campo de início. Por isso "nada acontece" quando você tenta mudar o início.

Correções:

- No painel de ajuste, sempre exibir **Início (data/hora)**, **Término (data/hora)** e duração — também para o card em execução. O texto explicativo passa a dizer que o início histórico é preservado *até* você editá-lo.
- Editar o início de um card em execução desliga a preservação daquele card (já é o comportamento do motor) e o `due_date`/`due_time` volta a ser gravado no banco (a proteção de escrita só ignora o início quando não há ajuste manual).
- Ao mudar o início, os campos de término/duração se reajustam automaticamente e todos os cards seguintes recalculam a partir do novo término (cascata), sem exigir ajuste manual card por card.
- Cobertura de regressão nos testes existentes de `reorderSequence`: (a) primeiro card em andamento sem ajuste → início preservado; (b) com ajuste de início → início gravado e seguintes recalculados; (c) cards futuros → empacotados a partir de agora.

## Detalhes técnicos

- `src/lib/proceedDemand.ts`: sticky do responsável atual em `jumpToFunction` (checando `collaborator_function_assignments` por área) antes de `pickAssigneeForFunction`; manter exclusão de executores apenas no avanço automático.
- `src/lib/reassignDemand.ts`: substituir `usableForward` por resolução em duas fases (frente → trás), expor `direction: "forward" | "backward"` em `ReassignEvaluation` e usar `moved_back` no `recordFlowHistory`.
- Migração: `CREATE OR REPLACE FUNCTION public.resolve_function_for_assignee(...)` com fallback para a etapa permitida anterior mais próxima; trigger `validate_demand_stage_assignment` permanece como é.
- `src/components/kanban/ReorderProposalRow.tsx`: remover o ramo exclusivo de `p.keepStart` no painel de ajuste, mantendo validações (início não pode ser passado, término > início).
- `src/lib/reorderSequence.ts`: nenhuma mudança de motor prevista além de testes; `buildReorderScheduleUpdate` já grava o início quando existe override.
