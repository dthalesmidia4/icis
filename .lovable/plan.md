# Ajustes: barra de progresso, alocação de "Publicar agendado" e entregas parciais

## 1. Barra de progresso conta agendados como concluídos

Em `src/pages/ClientEvolution.tsx`, a barra hoje usa apenas `done`; o `+8 agendados` é meramente informativo. Vamos tratar "Publicar agendado" como concluído para fins de percentual, mantendo distinção visual.

- Novo cálculo: `progress = (done + scheduledPublish) / total`. No exemplo do print: (10+8)/24 = 75%.
- Barra em dois segmentos empilhados:
  - Segmento esmeralda: `done / total`
  - Segmento sky (adjacente, mesma faixa): `scheduledPublish / total`
  - Restante: cinza claro
- Tooltip nativo (`title=`) em cada segmento: "10 concluídas" / "8 agendadas para publicação".
- Legenda numérica ao lado direito passa a mostrar `18/24 · 75%` com sub-linha `10 concluídas · 8 agendadas`, em vez de `10/24 · 42% · +8 agendados`.

## 2. "Publicar agendado" sem alocação no reorganizador

Hoje cards em `publicar` com dispatch ativo aparecem em Agendamentos (fora do Kanban Central), mas o `reorderSequence` ainda pode considerá-los se estiverem na coluna. Vamos torná-los explicitamente sem alocação, como Concluídos:

- Em `src/lib/reorderSequence.ts` (`computeReorder`): descartar cards cujo `current_function_key === 'publicar'` E que tenham dispatch ativo (passar `activeDispatchIds` como parâmetro adicional). Esses cards não entram na lista de itens a reagendar nem em `blocked`.
- Em `src/pages/KanbanCentralPage.tsx` (chamada do modal Reorganizar): já filtramos `activeDispatchIds` da entrada; agora também passamos o Set adiante para que a função interna trate igualmente.
- Impacto em automações: **nenhum**. O dispatch continua registrado em `scheduled_publication_dispatches` com `scheduled_at` próprio; `run-scheduled-dispatches` não usa `due_date`/`delivery_date` do card para decidir publicação. Removê-lo da alocação apenas evita que o horário do card empurre outras demandas.
- UI opcional (baixo custo): em `TaskCard.tsx`, quando o card está agendado, esconder o alerta de conflito de área e o realce de "atrasado" (já parcialmente coberto por estar fora do Kanban).

## 3. Histórico de entregas parciais visível no card

`deliverMyPart` já grava `demand_flow_history` com `action='partial_delivered'` (from_user_id = quem entregou). Vamos exibir isso ao abrir o card.

- Em `src/components/TaskCard.tsx`, ao carregar o card (Captar com múltiplos responsáveis OU com histórico de entregas parciais):
  - Buscar `demand_flow_history` onde `demand_id = card.id` e `action = 'partial_delivered'` ordenado por `created_at` asc.
  - Mapear `from_user_id` → nome (usar `useCollaborators` já disponível).
- Renderizar, dentro do bloco de responsáveis do Captar (já existente), uma seção compacta:

```text
Já entregaram sua parte:
  ✓ Fulano · há 2h
  ✓ Beltrano · ontem 15:40
```

- Estilo: linha com ícone `CheckCircle2` esmeralda, nome em `text-foreground`, timestamp em `text-muted-foreground text-[11px]`, sem borda pesada — segue padrão de listagens do card.
- Mostrar mesmo se o card já não estiver mais em `captar` (útil para consultar depois), quando houver registros.

## Detalhes técnicos

- Arquivos: `src/pages/ClientEvolution.tsx`, `src/lib/reorderSequence.ts`, `src/pages/KanbanCentralPage.tsx`, `src/components/TaskCard.tsx`.
- Sem migrações. `demand_flow_history` já tem os dados necessários.
- Nenhuma alteração em edge functions ou dispatcher.
