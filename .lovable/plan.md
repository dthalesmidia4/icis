
## Objetivo

1. Fazer a tela **Aprovar Produção** (hub do cliente, `/approve-cards`) listar cards pendentes de **todos** os períodos do cliente, como já faz a **Visão Geral**.
2. Retirar do fluxo de avaliação todos os cards com `period_start ≤ 2026-05-31`, marcando-os como reprovados/arquivados sem regeneração — para "entrar na linha" a partir de hoje.
3. Auditar o fluxo de reprovação existente e responder se já é possível "reprovar e deletar" vs "reprovar e reenviar para correção".

---

## 1. Corrigir escopo em `src/pages/ApproveCards.tsx`

Hoje `fetchData()` filtra `operational_status === 'em_andamento'` e escolhe **um único** período (`bestPeriod`). Isso esconde períodos anteriores com pendências assim que um novo é gerado.

Mudanças:
- Trocar o modelo de "1 período" por "N períodos com pendências", igual à `usePendingEvaluationCards`:
  - Buscar todos `period_plans` do cliente com `operational_status = 'em_andamento'` (mesmo critério da Visão Geral).
  - Consolidar `default_plan` + `ultra_plan` de todos os períodos em uma única lista, excluindo os cards já materializados como `demands` (match por `period_plan_id` + `title`).
  - Renderizar agrupado por período (título + datas), preservando a UI atual dos cartões.
- Ajustar `handleApprove`, `handleReject`, `handleOpenEditCard`/`handleSaveEditCard` e "Aprovar todos" para operarem por `(periodId, source, indexInPlan)` em vez de assumir um único `period`.
- Manter os modais de edição de período e config apontando para o período do card selecionado.
- Preservar o realtime existente (`useRealtimePeriodPlans` + `useRealtimeDemands`).

Resultado: hub e Visão Geral passam a ver exatamente o mesmo conjunto de cards pendentes.

## 2. Zerar backlog ≤ 31/05/2026

Rodar uma migração de dados (script SQL executado via `supabase--insert`) que, para cada `period_plans` com `period_start <= '2026-05-31'` da tenant afetada:

- Move todos os itens de `default_plan` e `ultra_plan` para `rejected_plan`, anotando em cada card:
  - `_originalSource: 'default' | 'ultra'`
  - `_rejectedAt: now()`
  - `_rejectReason: 'Arquivamento em lote — backlog anterior a 31/05/2026'`
  - `_archivedBatch: true` (flag para diferenciar de reprovações comuns e evitar reavaliação automática)
- Esvazia `default_plan` e `ultra_plan` desses períodos (`'[]'::jsonb`).
- **Não** cria demands, **não** dispara reavaliação.

O fluxo atual de reavaliação (`supabase/functions/reevaluate-card`) já lê `rejected_plan`; para garantir que estes não voltem, a flag `_archivedBatch` será ignorada por ele (ajuste pontual no filtro do edge, se necessário — a confirmar durante a implementação lendo o edge). Se o edge já exigir trigger manual do usuário, nada mais precisa ser feito.

Como a Visão Geral só lê `default_plan`/`ultra_plan`, esvaziar essas colunas já remove os 117 cards da fila de avaliação imediatamente.

## 3. Fluxo de reprovação — aferição

Auditar o que já existe:
- `EvaluatePlanCardModal` → `rejectPlanCard`: move o card para `rejected_plan` com `_rejectReason` opcional. **Não deleta permanentemente**, **não regera** — fica aguardando reavaliação manual.
- `ApproveCards` → `handleReject`: idêntico, sem motivo.
- Reavaliação: existe fluxo separado (`reevaluate-card` edge + tela `RejectedCards`) que **o usuário dispara manualmente** para regerar.

Portanto, hoje "reprovar" **nunca** regera automaticamente. A distinção que o usuário pediu ("reprovar e deletar" vs "reprovar e reenviar para correção") **já existe implicitamente**: reprovar apenas guarda o card + motivo; a regeneração é uma ação explícita posterior em `RejectedCards`. Vamos deixar isso claro no modal de reprovação com um texto curto ("O card fica salvo em Reavaliação; a regeneração é opcional e feita depois na tela de Cards Reprovados") — sem criar novo fluxo.

Se após esta explicação o usuário quiser um botão explícito "Reprovar e descartar (não reavaliar)", tratamos como escopo separado.

---

## Detalhes técnicos

Arquivos a editar:
- `src/pages/ApproveCards.tsx` — refactor do fetch + handlers para múltiplos períodos.
- `src/components/EvaluatePlanCardModal.tsx` — adicionar nota explicativa no passo de confirmação de reprovação (1 parágrafo).

Migração de dados (via `supabase--insert`, não `migration` — é apenas UPDATE em linhas):
```sql
UPDATE public.period_plans
SET
  rejected_plan = COALESCE(rejected_plan, '[]'::jsonb)
    || (
      SELECT COALESCE(jsonb_agg(
        elem || jsonb_build_object(
          '_originalSource', src,
          '_rejectedAt', now(),
          '_rejectReason', 'Arquivamento em lote — backlog anterior a 31/05/2026',
          '_archivedBatch', true
        )
      ), '[]'::jsonb)
      FROM (
        SELECT jsonb_array_elements(COALESCE(default_plan, '[]'::jsonb)) AS elem, 'default' AS src
        UNION ALL
        SELECT jsonb_array_elements(COALESCE(ultra_plan, '[]'::jsonb)) AS elem, 'ultra' AS src
      ) s
    ),
  default_plan = '[]'::jsonb,
  ultra_plan = '[]'::jsonb
WHERE period_start <= DATE '2026-05-31'
  AND (jsonb_array_length(COALESCE(default_plan,'[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(ultra_plan,'[]'::jsonb)) > 0);
```

Sem mudanças de schema, RLS ou edge functions (a menos que a auditoria do `reevaluate-card` mostre que a flag `_archivedBatch` precisa ser respeitada — verifico ao implementar).
