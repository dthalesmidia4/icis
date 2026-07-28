
## Diagnóstico

Consulta ao banco confirmou o ciclo: cards vão para `period_plans.rejected_plan` sem `_discarded=true`, e uma rotina de "backfill legado" na tela de Reprovados os devolve ao plano ativo, fazendo-os reaparecer na seção **Avaliar** (Visão Geral).

**Onde falha:**

- `src/pages/ApproveCards.tsx` `handleReject` (linhas 340-346): grava em `rejected_plan` **sem** `_discarded`/`_discardedAt`.
- `src/pages/RejectedCards.tsx` (linhas 180-230): `bulkRestoreNonDiscarded` roda a cada montagem e devolve todos os itens sem `_discarded` para `default_plan/ultra_plan`.
- Uma vez restaurados, `src/hooks/usePendingEvaluationCards.ts` volta a listá-los → coluna do avaliador (Lúcia).

O `EvaluatePlanCardModal` (botão **Descartar** dentro do Avaliar) já grava `_discarded: true` — ele não é o problema. O ciclo é criado pelo caminho **Aprovar Produção → Reprovar** + backfill.

## Correções

### 1. `src/pages/ApproveCards.tsx` — reprovação vira descarte explícito

No `handleReject`, ao empurrar para `rejected_plan`, incluir também:

```ts
_discarded: true,
_discardedAt: new Date().toISOString(),
```

Assim toda reprovação — venha do Avaliar ou da tela Aprovar Produção — chega em Reprovados como arquivo intencional e nunca mais é restaurada automaticamente.

### 2. `src/pages/RejectedCards.tsx` — desligar o backfill

Remover o bloco `bulkRestoreNonDiscarded` (linhas 180-230) do `fetchData`. Deixar o helper existir em `evaluatePlanCard.ts` (não removo para não quebrar tipagens/imports em outros lugares), mas parar de invocá-lo. Também remover o `useState` `backfilledPeriods` e sua importação, e limpar a chamada de refetch subsequente.

### 3. `src/pages/RejectedCards.tsx` — exibir todos os itens de `rejected_plan` dentro dos 30 dias

Alterar o filtro em `fetchData` (linha 238) de `if (!item?._discarded) return;` para tratar itens legados (`_discarded` ausente) como descartados também. Regra:

- Se `_discarded === true` **ou** o item tem `_rejectedAt` sem outra sinalização → mostrar em Reprovados (respeitando janela de 30 dias por `_rejectedAt`).

Isso resolve os itens já em produção sem migração destrutiva: eles passam a aparecer em `/rejected-cards` (onde deveriam) e param de reaparecer no Avaliar (porque a etapa 2 não os devolve mais).

### 4. Limpar reaparição imediata para Lúcia

Como os cards legados hoje estão em `rejected_plan` (com `_discarded=false`), a etapa 2 já garante que não voltarão. A etapa 3 garante que eles fiquem visíveis em Reprovados. Nenhuma migração de dados é necessária.

## Detalhes técnicos

- Escopo: só front-end em `src/pages/ApproveCards.tsx` e `src/pages/RejectedCards.tsx`. Zero SQL, zero edge function, zero mudança em schema/RLS.
- Não altero `EvaluatePlanCardModal` nem `rejectPlanCard`/`bulkRestoreNonDiscarded` (o helper fica órfão intencionalmente, para não mexer em outras chamadas).
- `usePendingEvaluationCards` continua igual — ele já ignora tudo que estiver em `rejected_plan` (porque só olha `default_plan`/`ultra_plan`). Como não haverá mais restauração automática, a coluna da Lúcia deixa de receber os descartes de volta.

## Verificação após aplicar

- Reprovar um card na tela **Aprovar Produção** → some da Visão Geral (Avaliar) e aparece em `/rejected-cards` como "Descartado".
- Descartar via Avaliar (modal) → continua funcionando como já funcionava.
- Abrir `/rejected-cards` → nada é devolvido para o plano ativo; a lista mostra todos os cards reprovados dos últimos 30 dias.
