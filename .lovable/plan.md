# Correção: descarte de cards na Avaliação não persistia

## Diagnóstico (confirmado)

Verifiquei os 3 cards do print no período `2f4e9f93` (CAMPANHA JULHO 26) de Hospital Veterinário Leal:

- `Nos Bastidores do Leal…` continua em `default_plan`
- `Erros comuns no pós‑op…` continua em `ultra_plan`
- `O que o mascote Dr. Leal…` continua em `ultra_plan`
- Nenhum dos 3 títulos aparece em `rejected_plan` (nem com `_discardedAt`, nem com `_rejectedAt`)

Ou seja: o clique em "Descartar" **nunca chegou a gravar** no banco. Por isso reapareceram hoje.

### Causa raiz

Em `src/components/EvaluatePlanCardModal.tsx → handleDiscard`:

1. Antes de descartar, o código chama `callReevaluate()` só para "aprender" novas exigências.
2. Se a IA sugere alguma exigência (`learningStatus = "meaningful"` ou `"ambiguous"`), abre-se o modal de diff de exigências e o descarte **só é gravado se o usuário clicar em "Aplicar" ou "Pular"** dentro desse segundo modal (via `handleDiffConfirm → finalizeDiscard`).
3. Se o usuário fechar o diff (clique fora / X / ESC), `onOpenChange(false)` só faz `setDiffOpen(false); setPendingAction(null)` — o card **não** é removido de `default_plan`/`ultra_plan` nem inserido em `rejected_plan`. Nenhum erro, nenhum toast — silencioso.

Foi isso que aconteceu com a Lúcia: o descarte ficou refém de um modal secundário de "aprendizado". Como o objetivo primário é descartar, isso está invertido.

Efeito colateral relacionado (a corrigir junto):
- `finalizeDiscard` usa `card.indexInPlan` capturado na abertura do modal. Se o plano mudou entre abrir e confirmar (reavaliações, outros descartes, realtime), o `splice(index, 1)` remove o item errado. Precisamos casar por título+source, não por índice.

## Correção

### 1. `src/components/EvaluatePlanCardModal.tsx`
- `handleDiscard`: gravar o descarte **primeiro** (chamar `finalizeDiscard` imediatamente, com toast de sucesso e fechar modal). Só **depois** chamar `callReevaluate` em background para eventual proposta de exigências — abrindo, se houver, um diff modal só para "aprender regra" (sem repetir o descarte). O botão "Descartar" nunca mais deve depender do resultado da IA.
- Ajustar `handleDiffConfirm` para, no ramo `"discard"`, não chamar `finalizeDiscard` de novo (o descarte já foi feito); apenas persistir exigências se `action === "apply"`.
- Mesma proteção leve em `handleReevaluate` não é necessária agora (a Reavaliação depende do `updatedCard` da IA por definição), mas vou blindar `finalizeDiscard`/`finalizeReevaluate` contra índice obsoleto no item 2.

### 2. `src/lib/evaluatePlanCard.ts`
- `rejectPlanCard` e `applyReevaluatedToActivePlan` passam a localizar o item por `(source, title)` — usando o índice recebido só como pista. Se o título no índice não bater, procura por título; se não achar, lança erro claro ("card já removido/alterado — recarregue").
- Adiciona `_originalIndex` no payload salvo em `rejected_plan` só para debug.

### 3. Backfill dos 3 cards do print
Executar update em `period_plans 2f4e9f93` para mover os 3 títulos de `default_plan`/`ultra_plan` para `rejected_plan` com `_discarded=true, _discardedAt=now(), _rejectReason='Descarte manual — Lúcia (backfill 28/07)'`, para que sumam da Visão Geral e apareçam corretamente na tela de Reprovados.

## Validação
1. Recarregar `/kanban-central` → os 3 cards não aparecem mais em "Avaliar" de Hospital Veterinário Leal.
2. Em `/rejected-cards` → os 3 aparecem como descartados hoje.
3. Descartar um card de teste e fechar o diff de exigências no X → o card sai da Avaliação e vai para Reprovados (comportamento novo).
4. Descartar dois cards seguidos no mesmo período → cada um remove o item certo (matching por título).

## Detalhes técnicos
- Sem mudança de schema.
- Sem mudança nas edge functions.
- `usePendingEvaluationCards` continua ignorando cards que não estão em `default_plan`/`ultra_plan`; o problema era apenas o descarte não persistir.
