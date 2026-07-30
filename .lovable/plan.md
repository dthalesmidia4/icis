## Problema

No **Registro de entregas** (modo histórico de uma coluna), os cards passam pela mesma lógica de agrupamento dos cards ativos em `src/pages/KanbanCentralPage.tsx`. Essa lógica cria um pseudo-grupo prioritário `__captar_now__` ("CAPTAÇÃO · AGORA") para qualquer card cuja etapa seja `captar` e cujo horário de início já passou — o que é correto para produção, mas errado para um registro, que é um evento passado. Além disso, o cabeçalho do card em modo histórico mostra apenas `toLocaleDateString` (data sem hora).

## Correções

1. **Desativar priorização operacional no Registro** (`KanbanCentralPage.tsx`, bloco de agrupamento por data):
   - Quando `isHistoryMode`, não separar `captarNow` — todos os cards vão para `remaining`, sem o pseudo-grupo `__captar_now__`.
   - Também desativar no modo histórico o boost secundário de `captar` dentro do sort do grupo e o marcador "pausado por captação" (`isPausedByCaptarNow` → sempre falso), que só faz sentido na fila ativa.

2. **Agrupar o Registro pela data da entrega**:
   - Em modo histórico, a chave do grupo passa a ser o dia de `_historyAt` (data do evento em `demand_flow_history`), não `due_date`/`delivery_date`; ordenação decrescente (entregas mais recentes primeiro) dentro e entre grupos.
   - Cabeçalhos continuam usando `formatHeader` (Hoje / Ontem / dd/mm/aaaa).

3. **Mostrar o horário da entrega**:
   - No cabeçalho do card em modo histórico, trocar a data isolada por data + hora, ex.: `30/07 16:52`, usando `toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })`, mantendo o badge "Hoje: {responsável atual}" à direita e o rótulo da etapa realmente entregue já existente.

## Notas técnicas

- Mudanças restritas ao render da coluna em `src/pages/KanbanCentralPage.tsx` (bloco `captarNow` / `groups` / `entries` / cabeçalho `isHistory`). Nenhuma alteração em `fetchColumnHistory`, banco ou fluxo operacional — sem risco de regressão na visão ativa, pois todos os novos comportamentos são condicionados a `isHistoryMode`.
