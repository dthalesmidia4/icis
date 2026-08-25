# Plano — Status seguro de fatura em Assinaturas e ferramentas

## Objetivo
Corrigir o badge de itens pagos no cartão dentro do escopo **Assinaturas e ferramentas**, sem liberar dados do Financeiro completo para usuários `tools-only`.

## Backend
- Criar uma RPC segura `public.list_finance_safe_card_statement_status(_tenant_id uuid, _competence_month date)`.
- A RPC será `SECURITY DEFINER`, com `search_path = public`, e validará acesso com `public.has_finance_tools_access(_tenant_id)`.
- Retorno permitido apenas:
  - `card_id`
  - `competence_month`
  - `due_date`
  - `paid`
  - `paid_at`
- A fonte será somente ocorrência real de fatura: `finance_occurrences` ligada a `finance_items.kind = 'card'` na competência solicitada.
- Não retornar valores monetários, limite, orçamento, câmbio, anexos, observações ou dados administrativos.
- Revogar execução de `PUBLIC`/`anon` e conceder execução apenas a `authenticated` e `service_role`.

## Frontend
- Adicionar o tipo seguro `SafeCardStatementStatus` e helpers para mapear status por `cardId|competence`.
- Atualizar `useFinanceTools` para chamar a nova RPC em paralelo com as leituras já existentes.
- Retornar `statementStatuses` no hook, sem consultar diretamente faturas/cartões completos.
- Estender `RowStatusContext` com `safeStatementStatuses`.
- Atualizar `resolveRowStatus` para, em cobranças no cartão:
  1. manter `row.paid` como prioridade máxima;
  2. manter vínculo explícito/snapshot com `statementRows` como prioridade;
  3. usar o status seguro da fatura real da competência quando não houver vínculo contábil;
  4. só exibir `Aguardando dados da fatura` se não existir fatura real segura e o ciclo estiver incompleto.
- Atualizar `SubscriptionsPanel` para não exibir warning de ciclo incompleto quando o grupo tem fatura real segura na competência; nesse caso mostrar um estado discreto da fatura real.
- No Financeiro completo, derivar o mesmo mapa seguro a partir de `statementRows` reais e passar ao `SubscriptionsPanel`, mantendo a mesma semântica entre `full` e `tools`.

## Sem alterações de dados
- Não alterar `statement_closing_day`/`statement_due_day` do cartão 7587.
- Não alterar faturas, pagamentos, vencimentos ou links históricos.
- Não preencher `statement_occurrence_id` por inferência.
- Não alterar escopos ou permissões além do `EXECUTE` da nova RPC.

## Testes e validação
- Testes unitários para:
  - fatura segura paga no cartão 7587/Ago-2026 não exibir `Aguardando` e exibir `Fatura paga`;
  - fatura real aberta vencendo hoje não exibir `Aguardando`;
  - fatura real atrasada exibir `Fatura atrasada`;
  - ausência de fatura real + ciclo incompleto continuar como `Aguardando dados da fatura`;
  - fallback seguro não persistir/criar `statement_occurrence_id`;
  - warning do grupo não contradizer fatura real paga;
  - `full` e `tools` usarem a mesma semântica de status.
- Testes de hardening SQL para confirmar que a nova RPC não expõe valores monetários e bloqueia `anon`/`PUBLIC`.
- Conferir que o hardening do modal de pagamento já está no HEAD; se não estiver, incorporar sem duplicar.
- Rodar testes relevantes, suíte completa, typecheck e build.
