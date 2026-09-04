# Fechar a consolidação: Entregar, Entregar minha parte e Aprovação do cliente

Faltam três ações que ainda gravam responsável/etapa por conta própria, fora do fluxo canônico do Supabase. Depois delas, todo movimento de demanda passa por um único caminho.

## O que muda para quem usa

- **Entregar**: o card vai para "Feito" e sai da operação exatamente como hoje, com a mesma mensagem, mas gravado de uma só vez pelo fluxo oficial (sem risco de gravar metade).
- **Entregar minha parte** (cards de Captar com vários responsáveis): a saída do colaborador e a promoção de quem assume passam a acontecer juntas, sem chance de dois cliques simultâneos se atropelarem.
- **Cliente aprovou → agendar publicação**: o agendamento continua igual; o movimento do card para "Agendar Publicação" passa a ser feito pelo fluxo oficial e deixa de gerar registro de histórico duplicado.

Nada muda no visual, nos textos ou nas regras de negócio.

## Detalhes técnicos

1. `src/lib/proceedDemand.ts`
   - `deliverDemand`: manter a busca do status final "Feito"/"Feitos" (para preservar a mensagem `NO_FINAL_STATUS` e o retorno `statusId/statusName`), substituir o `.update` direto e o histórico manual por `kernelCommit({ intent: "deliver", targetStatusId: done.id })`. Manter `recordStageDeliveries` apenas se o kernel não o cobrir (o kernel grava histórico `delivered`, não as entregas de etapa agregadas do app).
   - `deliverMyPart`: manter as leituras de validação (etapa `captar`, participação do usuário, mais de um responsável) para as mensagens atuais, e trocar o `.update` + histórico por `kernelCommit({ intent: "partial_deliver", actorUserId: userId })`. `becamePrimary`/`remainingCount` passam a vir do `final` retornado pela RPC, não do cálculo local.
2. `src/components/kanban/AwaitingClientActions.tsx`
   - Após `createOrUpdateScheduleDispatch`, trocar o `.update` de `current_function_key/assigned_to/client_*` e o `recordFlowHistory` manual por `transitionDemand({ intent: "schedule_publication", targetStatusId: <status "Agendar Publicação">, expected: { functionKey } , source: "cliente_aprovou_agendar" })`. Manter a resolução do status pelo pipeline do card, o toast e `onDone`.
3. Testes
   - Regressões de payload em `demandTransition`: `deliver` envia `target_status_id`; `partial_deliver` envia `actor_user_id`; `schedule_publication` envia status e origem.
   - Ajustar/remover entradas da allowlist de `assignedToWriteGuard.test.ts` que deixarem de escrever `assigned_to`.
4. Validação: typecheck + suíte completa do Vitest.

Sem migrations e sem alterações de backend — o kernel já está publicado.
