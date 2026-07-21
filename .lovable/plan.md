
## Objetivo
Dar ao avaliador, dentro da Visão Geral e do Modo Foco, as mesmas informações e ações da tela `/approve-cards`, e corrigir o truncamento dos cards de avaliação.

## Problemas identificados no print
1. Cards da seção "Avaliar" truncados (título, badge do cliente e meta).
2. Modal só mostra Objetivo/Conteúdo/Legenda — faltam Instruções, CTA, Hook, Tom de voz, Racional, Conceito Ultra, Observações.
3. Sem botão Editar (na tela completa dá para ajustar título, tipo, canal, objetivo, conteúdo, data antes de aprovar).
4. Reprovar dispara sem confirmação nem motivo.
5. Sem indicação/proteção contra card já materializado como demand.
6. Sem atalho para abrir a tela completa quando o avaliador quer contexto de período.

## Escopo

### 1. `src/components/EvaluatePlanCardModal.tsx`
- Renderizar seções extras já persistidas por `approvePlanCard`: Instruções de produção, CTA, Hook, Tom de voz, Racional estratégico, Conceito ultra, Observações. Manter Objetivo, Conteúdo, Legenda.
- Botão **Editar** abre painel inline (título, tipo, canal, objetivo, conteúdo, data sugerida) — mesmos campos de `ApproveCards.handleOpenEditCard`. Salvar chama novo helper `updatePlanCard` que reescreve o item no `default_plan`/`ultra_plan`.
- Botão **Abrir na tela completa** → seta `selectedClient` do card e navega para `/approve-cards`.
- Reprovar passa por sub-confirmação com textarea "Motivo (opcional)".
- Antes de aprovar, verifica `demands` por `period_plan_id + title` para evitar duplicidade (corrida com o hook).

### 2. `src/lib/evaluatePlanCard.ts`
- `rejectPlanCard` aceita `reason?: string`; grava `_rejectReason` no item de `rejected_plan` (aditivo, `reevaluate-card` segue funcionando).
- Novo `updatePlanCard({ periodId, source, indexInPlan, patch, currentDefault, currentUltra })` para persistir edições no JSON.

### 3. Cards da seção "Avaliar" — sem truncamento
Em `src/pages/KanbanCentralPage.tsx` e `src/pages/CollaboratorDemands.tsx`, ajustar apenas o bloco de renderização dos itens de `usePendingEvaluationCards`:
- Título: `line-clamp-2 break-words` (remove `truncate` de linha única).
- Badge do cliente: `truncate max-w-full block`.
- Linha meta (tipo + data + badge Ultra): `flex flex-wrap gap-1`.
- Padding lateral reduzido para caber melhor na coluna.

### 4. Modo Foco
Já usa o mesmo modal — herda todas as melhorias. Só o ajuste visual dos cards precisa espelhar o item 3.

## Fora de escopo
- Migração de banco (nenhuma necessária).
- Alteração em `reevaluate-card` (o novo `_rejectReason` é lido opcionalmente).
- Mudança na tela `/approve-cards` em si.

## Detalhes técnicos
- Arquivos:
  - `src/components/EvaluatePlanCardModal.tsx` (novos campos, edição inline, confirmação de reprovação, ação abrir tela completa, guarda anti-duplicação).
  - `src/lib/evaluatePlanCard.ts` (`rejectPlanCard.reason`, novo `updatePlanCard`).
  - `src/pages/KanbanCentralPage.tsx` (classes do card de avaliação).
  - `src/pages/CollaboratorDemands.tsx` (classes do card de avaliação).
- Sem mudança de contrato de dados: `_rejectReason` é campo aditivo no JSON de `rejected_plan`.
