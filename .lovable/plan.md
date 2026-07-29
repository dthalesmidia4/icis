## 1. Coluna "Área" como texto simples (Evolução das Demandas)

Arquivo: `src/pages/ClientEvolution.tsx`.

- Substituir o componente `AreaBadge` por um texto: "Mídia", "Sistemas" ou "—", com `text-muted-foreground text-[12px]`, sem pílula, sem bolinha, sem fundo.
- Manter a barrinha vertical colorida na primeira coluna (já é sutil e serve como marcador).

## 2. Ocultar responsável quando `Publicar agendado` (Evolução das Demandas)

Arquivo: `src/pages/ClientEvolution.tsx` (célula `RESPONSÁVEL` em `TableRow`, ~linha 790–792).

- Quando `row.isScheduledPublish` for `true`, exibir "—" no lugar do nome do responsável. Concluídas já não exibem alocação; a lógica passa a ser: `isDone || isScheduledPublish → "—"`.
- Não altera dados no banco; é somente apresentação (o dispatcher continua funcionando pelo `scheduled_publication_dispatches`).

## 3. Nova etapa `revisar_captacao` entre Captar e Editar

Objetivo: após `captar`, o card cai numa etapa de revisão (gestor operacional decide quem edita) antes de `editar`. O fluxo geral do tipo "vídeo captado" passa a ser:

```text
planejar → captar → revisar_captacao → editar → revisar → publicar → concluir
```

Alcance: aplicar apenas aos tipos que hoje passam por `captar` (vídeo captado). Demais tipos permanecem intactos.

Passos:

- Migração SQL:
  - Inserir `flow_functions.function_key = 'revisar_captacao'` (nome: "Revisar captação", `active = true`, posicionada logo após `captar`) para cada tenant que já tenha `captar` ativa. Reordenar `position` das etapas posteriores.
  - Inserir `pipeline_function_rules` com `requirement = 'required'` para o tipo de demanda que usa `captar` (vídeo captado), replicando as permissões existentes.
  - Backfill: cards atualmente em `captar` continuam onde estão; não movemos automaticamente.
- Roteamento inicial: `src/lib/initialFlowFunction.ts` e `resolve_function_for_assignee` (RPC) passam a reconhecer `revisar_captacao` como etapa válida via `flow_functions`/`pipeline_function_rules` — nada hardcoded.
- Área/agenda: `revisar_captacao` herda a mesma checagem de área (Mídia/Sistemas) que as demais revisões — sem código específico.

## 4. Correção do registro de entrega do último captador

Contexto: em captação com 2 responsáveis, quando o primeiro clica "Entregar parte", a outra pessoa fica sozinha e o botão passa a ser "Prosseguir". Isso avança o fluxo mas não grava `partial_delivered` para essa última pessoa — logo o card abrindo depois só mostra 1 entrega (a de Letícia), perdendo o histórico do Eric.

Correção em `src/lib/proceedDemand.ts` (`proceedDemand` e `proceedToNext`, ramo `currentFunctionKey === 'captar'`):

- Antes de fazer o `update` que move para a próxima etapa, se o card tinha `additional_assignees` originalmente **ou** se já existe pelo menos um `partial_delivered` em `demand_flow_history` para este card na etapa `captar`, registrar um `partial_delivered` para o `previousAssignee` (usuário que executou o proceed), com `metadata: { final_of_capture: true, remaining_count: 0 }`.
- Só depois emitir o `proceeded` normal para a etapa seguinte (`revisar_captacao` após o item 3).
- Isso garante que o histórico exiba todos que trabalharam na captação, inclusive quem clicou em "Prosseguir".

Também no popover "Entregar parte" (`src/components/TaskCard.tsx`): quando restar apenas 1 responsável após a entrega, exibir dica "Ao prosseguir, sua entrega também será registrada." (texto informativo, sem mudança de lógica).

## 5. Verificação

- Build passa.
- Abrir Evolução: "Área" aparece como texto; linhas em Publicar agendado mostram "—" em Responsável.
- Criar/mover card de vídeo captado: após Captar aparece Revisar captação; depois Editar.
- Simular captação com 2 responsáveis: primeiro clica Entregar parte, segundo clica Prosseguir. Reabrir o card → popover "entregou parte" lista os dois.

## Detalhes técnicos

- Nenhum breaking change em tipos: `revisar_captacao` é apenas uma linha nova em `flow_functions`/`pipeline_function_rules`; toda a UI já lê essas tabelas.
- `deliverMyPart` fica inalterado; a correção do "último" ocorre no `proceedDemand`/`proceedToNext` para não duplicar registros quando não há histórico de captação múltipla.
- Sem impacto em dispatchers, reorganizador ou áreas — `revisar_captacao` entra automaticamente na sequência ordenada por `position`.
