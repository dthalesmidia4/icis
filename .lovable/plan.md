## Auditoria: o que já está pronto

Verifiquei banco, motor de fluxo e telas.

Pronto e funcionando:
- Migração aplicada: `flow_functions.work_area` + `requires_client_origin` (índice único por tenant+área+key), `demand_type_flow_rules.work_area`, `demands.origin`/`origin_note` com check, novos `demand_type_key` de Sistemas, `tenant_companies` com campos opcionais + `contact_cadence_days`, tabela `client_touchpoints` com GRANTs/RLS/índice/trigger e backfill do histórico.
- Etapas de Sistemas semeadas (`especificar` → `desenvolver`/`corrigir_bug_n1..n3` → `testar` → `ajustar` → `revisar` → `entregar_cliente` → `aguardando_cliente` → `feedback_cliente`) com regras por tipo.
- `getPipelineSequence` em `proceedDemand.ts` filtra por área e pula etapas `requires_client_origin` quando a origem é interna; `jumpToFunction`, `regressDemand`, `resolveInitialFunctionKey` usam essa sequência.
- `FunctionPermissionsModal` já tem alternância Mídia × Sistemas com queries escopadas por área.
- Kanban Central já filtra cards por área.

## Pontas soltas confirmadas

1. Helpers sem filtro de área: `src/lib/initialFlowFunction.ts` (`resolveInitialFunction`, `resolveFunctionForAssignee`) e `src/lib/flowDurations.ts` (`loadDurationsForTenant`) consultam `flow_functions` sem `work_area`. Como `revisar`/`ajustar` existem nas duas áreas, posição e duração podem vir da área errada.
2. Classificação de etapas incompleta: `src/lib/flowFunctions.ts` só conhece `aguardando_cliente` como espera de cliente e apenas keys `revis*` como revisão. Faltam `entregar_cliente`/`feedback_cliente` (não devem ocupar slot operacional de produção) e `testar` como etapa de revisão (não deve cair em quem desenvolveu).
3. Modal de permissões por colaborador (`CollaboratorFunctionAssignmentsModal.tsx`) lista as duas áreas juntas, com keys repetidas.
4. Card (`TaskCard.tsx`): o seletor de tipo usa só `OFFICIAL_DEMAND_TYPES` (Mídia), então card de Sistemas não consegue receber `bug_n1`, `desenvolvimento`, etc. Também não há seletor de **Origem**, que é o que dispara o pulo das etapas de cliente.
5. Criação de demanda no Kanban Central não define área nem origem (grava `demand_type_key: null` e área padrão).
6. `client_touchpoints` só tem dados do backfill: nada registra contato em tempo de execução ao enviar/entregar/dar feedback ao cliente.
7. Customer Success não existe: sem `src/lib/clientHealth.ts`, sem página, sem rota, sem entrada na navegação.
8. Cadastro leve de cliente (sem CNPJ/setor obrigatórios) não tem UI, apesar do banco já permitir.

## Plano de fechamento

### Fase 1 — Isolamento de área (correção de bugs)
- `initialFlowFunction.ts`: `workArea` como parâmetro nas duas funções, com `.eq("work_area", area)` nos selects de `flow_functions` e uso de `demand_type_flow_rules` da mesma área; atualizar todos os chamadores (`TaskCard`, `KanbanCentralPage`, `createCardFromContent`, trigger de validação no cliente).
- `flowDurations.ts`: `loadDurationsForTenant(tenantId, workArea)`; ajustar chamadores (`reorderSequence`, modais de duração).
- `flowFunctions.ts`: incluir `entregar_cliente` e `feedback_cliente` como etapas de cliente (fora da alocação operacional de produção) e `testar` no conjunto de revisão/anti-autoavaliação.

### Fase 2 — UI sensível à área
- `TaskCard.tsx`: trocar `OFFICIAL_DEMAND_TYPES` por `demandTypesForArea(card.work_area)`; ao mudar de área, limpar tipo incompatível e re-resolver a etapa inicial. Adicionar seletor de **Origem** (`DEMAND_ORIGINS`) + campo `origin_note`, salvando em `demands`, com aviso de que origem interna pula etapas de cliente.
- Criação de demanda no Kanban Central: campos Área e Origem, com lista de tipos filtrada pela área.
- `CollaboratorFunctionAssignmentsModal.tsx`: abas Mídia × Sistemas, query filtrada por área e chaves React compostas (`area:function_key`).

### Fase 3 — Registro automático de contato
- Novo helper `src/lib/recordTouchpoint.ts` chamado por `proceedDemand`/`jumpToFunction` quando a etapa destino é `entregar_cliente`, `aguardando_cliente` ou `feedback_cliente`: grava `client_touchpoints` (`source: 'auto'`, tipo `entrega`/`feedback`) sem duplicar o mesmo card+etapa no mesmo dia.

### Fase 4 — Customer Success de Sistemas
- `src/lib/clientHealth.ts`: score por cliente a partir de `client_touchpoints` + `contact_cadence_days` + demandas entregues/pendentes → status Quente / Morno / Frio, dias desde último contato e próxima data alvo.
- Nova página `src/pages/CustomerSuccessSistemas.tsx` + rota `/customer-success` + card na Home/Sidebar:
  - lista de clientes com status, último contato, cadência e demandas abertas;
  - gráfico de contatos por mês/cliente;
  - filas de ação: clientes frios e feedbacks pendentes;
  - registro manual de contato (tipo, data, resumo);
  - modal de **cadastro leve de cliente** (nome obrigatório, contato e cadência opcionais, área padrão Sistemas).

### Detalhes técnicos
- Nenhuma nova migração é necessária; todo o esquema exigido já existe.
- Toda leitura de `flow_functions`/`demand_type_flow_rules` passa a exigir `work_area` explícito para evitar colisão de keys homônimas.
- Realtime da tela de CS usa os hooks existentes em `src/hooks/realtime/`.
