
## Diagnóstico

Você tem razão. Como o fluxo de "Descartar" só foi introduzido recentemente, **todos os cards atualmente em `rejected_plan` são reprovações antigas que deveriam estar em Avaliar**, não num arquivo de descartes. Além disso, a tela hoje tem 4 ações com papéis sobrepostos:

- **Reavaliar com IA** → regera + volta para Avaliar. Faz sentido.
- **Resgatar para avaliação** → devolve o card sem regerar. Redundante como ação manual — é exatamente o que deveria ter acontecido automaticamente na reprovação antiga.
- **Aprovar e enviar ao Kanban** → aprova, mas mostra só o título; usuário não vê conteúdo, canal, CTA, objetivo. Aprovação às cegas.
- **Abrir Avaliação** → abre o modal completo. Redundância com o card em si.

## O que fazer

### 1. Backfill: devolver reprovados legados para Avaliar
Migração one-shot (client-side, executada uma vez ao carregar a tela ou via script curto no `RejectedCards`) que percorre todos os `period_plans` do tenant/cliente atual e move cada item de `rejected_plan` que **não** tenha a flag `_discarded: true` de volta para `default_plan` ou `ultra_plan` conforme `_originalSource`, preservando `_rejectReason` no card para que a próxima reavaliação use como contexto.

Depois do backfill, `rejected_plan` só conterá cards que o usuário explicitamente descartar daqui pra frente.

### 2. Marcar descartes futuros
No `EvaluatePlanCardModal`, quando o usuário escolher **Descartar** (fluxo já existente), gravar `_discarded: true` + `_discardedAt` no item movido para `rejected_plan`. Assim a tela Reprovados passa a mostrar só descartes intencionais.

### 3. Redesenhar a tela Reprovados
Como agora ela mostra apenas descartes (não reprovações no fluxo), simplificar para 2 ações + preview completo:

- **Remover** os botões "Resgatar para avaliação" e "Abrir Avaliação" (redundantes).
- **Manter** duas ações:
  - **Reavaliar com IA** — regenera com o motivo e devolve para Avaliar.
  - **Aprovar e enviar ao Kanban** — só habilitado depois que o usuário expandir/ler o conteúdo.
- **Expandir o card** para mostrar todos os campos planejados (objetivo, descrição/conteúdo, instruções, CTA, canal, data) num bloco colapsável "Ver conteúdo planejado", de modo que a aprovação seja informada.

### 4. Corrigir duplicação do nome da empresa
No título dos cards desta tela, remover o prefixo `"<Nome do Cliente> – "` quando presente (o badge já identifica o cliente). Regra aplicada só na renderização — não altera dados.

## Detalhes técnicos

- `src/pages/RejectedCards.tsx`:
  - Novo `useEffect` (executa uma vez por período carregado) que faz o backfill: para cada item sem `_discarded`, chama uma variante batch do `restoreRejectedCard` que devolve todos de uma vez por período (um único `update` por `period_plans` para reduzir writes).
  - Remover handlers/botões `handleRestoreCard` e link "Abrir Avaliação".
  - Renderizar bloco colapsável com os campos do `raw` (objetivo, conteúdo, instruções, cta, canal, data). Estado local `expandedIds: Set<string>`.
  - Função utilitária `stripClientPrefix(title, clientName)` para limpar o título só no render.
- `src/lib/evaluatePlanCard.ts`:
  - Nova função `bulkRestoreNonDiscarded(periodId, plan)` usada pelo backfill.
  - Ao marcar como descartado no fluxo de avaliação, incluir `_discarded: true` + `_discardedAt` (ajuste onde hoje empurramos para `rejected_plan` a partir do descarte).
- `src/components/EvaluatePlanCardModal.tsx`: garantir que a ação "Descartar" grave a flag `_discarded` no item movido.

Nada muda em RLS, edge functions ou schema — é tudo JSONB em `period_plans`.

## Fora de escopo

- Alterar o fluxo de "Reavaliar com IA" em si (continua igual).
- Alterar tela de Avaliar / Visão Geral.
