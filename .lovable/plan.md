## Diagnóstico (verificado no código e no banco)

**1. Conflito Mídia × Sistemas — causa confirmada**

`flow_functions` tem chaves duplicadas entre áreas: `revisar` e `aguardando_cliente` existem tanto em `midia` (pos. 9 / 11) quanto em `sistemas` (pos. 7 / 9).

Já `collaborator_function_assignments` **não tem coluna `work_area`** e o upsert usa `onConflict: tenant_id,user_id,function_key` (`CollaboratorFunctionAssignmentsModal.tsx`). Ou seja: marcar "Revisar" na aba Sistemas grava a mesma linha que a aba Mídia. Hoje no banco só **Henrique** tem `revisar = true` — e ele é o dev de Sistemas. Por isso todo card de Mídia que chega em "Revisar" cai no Henrique.

Onde isso vaza:
- `pickAssigneeForFunction` (`proceedDemand.ts`) filtra só por `function_key` — sem área.
- DB `resolve_function_for_assignee` monta a sequência a partir de `flow_functions` filtrando apenas `tenant_id AND active` — **ignora `work_area`** e ainda mistura as posições das duas áreas.
- Trigger `validate_demand_stage_assignment` valida a atribuição sem considerar área.
- `clientStageAssignments.ts` (aguardando/enviar cliente) também é cego a área.
- `getPipelineSequence` é o único ponto que já filtra `work_area` corretamente.

**2. Reordenação trocando a ordem / mexendo no primeiro card — causa confirmada**

`sortForReorder` particiona em *tiers* (Produção 0 → Revisão 1 → Avaliar 2) **antes** de identificar o card em execução, e depois `computeReorder` aplica `isFirstActive` (preservar início / extensão de atraso) apenas ao primeiro item da lista já particionada.

No print: "Templates personalizados de anamnese" está em **Revisar** desde 28/07 13:45 (em execução, tier 1) e "Correção de Bug" está em Produção (tier 0). O tier joga o card realmente em execução para a 3ª posição e trata o card de produção como "em andamento". Daí o primeiro card ter início alterado e a ordem embaralhar.

Além disso, `prioritizePublishDate` reordena por `publish_date` sem olhar distância: o card do Hospital Veterinário Leal, com publicação em 18/08 (18 dias à frente), passou na frente por estar simplesmente ordenado por data de publicação.

---

## Plano

### Parte A — Isolamento de área nas funções operacionais

1. **Migração**: adicionar `work_area work_area NOT NULL DEFAULT 'midia'` em `collaborator_function_assignments`; trocar a unique para `(tenant_id, user_id, function_key, work_area)`. Backfill: as linhas atuais viram `midia`, exceto as chaves exclusivas de Sistemas (`especificar`, `desenvolver`, `corrigir_bug_n*`, `testar`, `ajustar`, `entregar_cliente`, `feedback_cliente`), que passam a `sistemas`. As chaves ambíguas (`revisar`, `aguardando_cliente`) ficam em `midia` e serão duplicadas para `sistemas` conforme a intenção real (Henrique = Sistemas; será preciso confirmar com você quem revisa Mídia).
2. **Migração**: reescrever `resolve_function_for_assignee` para receber/derivar a área do card e filtrar `flow_functions` + `demand_type_flow_rules` + `collaborator_function_assignments` por `work_area`; atualizar `validate_demand_stage_assignment` para validar por `(function_key, work_area)`.
3. **Frontend**: `pickAssigneeForFunction`, `resolveNextStage`, `collectStageExecutors` e `clientStageAssignments.ts` passam a receber `workArea` obrigatório e a filtrar por ele. `CollaboratorFunctionAssignmentsModal` grava/lê por área (aba já existe; só falta a coluna no conflito).
4. **Auditoria de correção**: identificar cards já parados numa etapa da área errada (ex.: card de Mídia em `revisar` com responsável só de Sistemas) e realocar ao responsável correto, registrando em `demand_flow_history`.

### Parte B — Nova política de ordenação da reorganização

5. **Corrigir a detecção do card em execução**: identificar o card em andamento (`due_date/due_time` no passado e etapa iniciada) **antes** do particionamento por tier e travá-lo na posição 1 sempre. Só ele recebe `keepStart`; e o acréscimo de 30% passa a ser aplicado **apenas quando há atraso real** (término previsto já vencido) — sem atraso, nada de acréscimo e o início permanece intacto.
6. **Classificação de entrada na fila** (usando `demand_flow_history` → entrada na etapa atual, já carregado no modal):
   - **em execução** → posição 1, início preservado;
   - **já estava na sequência** (entrou na etapa antes da abertura da fila / tem janela válida no futuro) → mantém a posição relativa por `due_date`;
   - **acabou de entrar na coluna** e sem risco de atraso → vai para o **fim** da fila (resolve o cenário do usuário que solta um card e clica em reorganizar sem analisar).
7. **Janela de risco por ciclo restante** (substitui o "priorizar por data de publicação" cru): para cada card com prazo (publicação ou entrega), calcular o **tempo de ciclo restante** somando as durações das etapas seguintes obrigatórias do fluxo (`flow_functions.config.durations` + `demand_type_flow_rules`, por área), em **minutos úteis** (expediente, almoço, fim de semana, feriados e `user_area_schedules` da área). O card só é promovido à frente se `prazo − agora ≤ fator × ciclo_restante`. No exemplo: "Vídeo captado" em `editar_video` com ~50min restantes e publicação em 18 dias → fator 3 ⇒ janela de ~2,5h úteis ⇒ **não** promove.
8. **Nova aba "Prioridade e risco"** em Configurar funções de fluxo (`FunctionPermissionsModal`), por área, persistida em `flow_functions.config` (ou config do tenant), com: fator de segurança (default 3×), folga de atraso (default 30%), e opção de considerar publicação apenas dentro da janela. Nada hardcoded.
9. **Modal de reorganização**: o toggle atual passa a "Priorizar por risco de prazo" e cada card ganha um selo explicando a decisão — `em execução`, `na sequência`, `entrou agora → fim da fila`, `em risco (prazo em Xh vs ciclo restante Yh)`. Ajustes manuais em cascata continuam funcionando como hoje.

### Detalhes técnicos

- Arquivos principais: `src/lib/reorderSequence.ts` (ordenação, janela de risco, atraso), `src/lib/flowDurations.ts` (ciclo restante por área), `src/components/kanban/ReorderSequenceModal.tsx`, `src/components/FunctionPermissionsModal.tsx`, `src/components/CollaboratorFunctionAssignmentsModal.tsx`, `src/lib/proceedDemand.ts`, `src/lib/clientStageAssignments.ts`, `src/lib/initialFlowFunction.ts`.
- Migrações: coluna + unique em `collaborator_function_assignments`; reescrita de `resolve_function_for_assignee` e `validate_demand_stage_assignment` com filtro de área.
- O motor de expediente (`dayBlocks`, `businessMinutesBetween`, `allocateAcrossDays`) é reutilizado como está para todos os cálculos de minutos úteis — nenhuma duplicação de lógica de calendário.
- `scheduleOccupancy` / `block_conflicting_assignment` permanecem intactos; ganham só a área na validação de compatibilidade de função.

### Confirmação necessária antes de aplicar

Quem deve ficar com **"Revisar" da área Mídia**? Hoje só Henrique (Sistemas) tem a função, e sem essa definição os cards de Mídia continuarão sem revisor após o isolamento por área.
