## O que ficou faltando da rodada anterior

Confirmei no código e no histórico (6 regras propostas — R1 a R6). Foram implementadas R1, R2, R4 e uma versão **parcial** de R3. Ficam desta rodada:

1. **R3 completo — Captar sobe ao topo absoluto da coluna** (hoje sobe só dentro do grupo Ontem/Hoje/Amanhã).
2. **R5 — Modal de Reorganizar sempre com o conjunto completo do responsável** (hoje recebe `cards` já filtrados pelos filtros globais, causando colisões silenciosas com cards ocultos).
3. **Indicação de "pausado para executar Captar"** — em vez do R6 antigo (rejeitado, já existe a cor cinza para Sistemas), sinalizar visualmente quando um card foi partido/empurrado por um Captar que entrou no meio do seu intervalo.

## O que fazer

### 1. R3 real — Captar sai do grupo de data e vai ao topo absoluto

Em `KanbanCentralPage.tsx`, no bloco que monta `entries` por data da coluna:

- Antes do agrupamento por data, extrair captar do responsável cujo `due_datetime` já chegou e que ainda estejam ativos (etapa continua `captar`).
- Renderizar um **pseudo-grupo fixo no topo** com cabeçalho âmbar "Captação · agora" contendo esses cards, fora do fluxo Ontem/Hoje/Amanhã.
- Remover esses cards do restante para não duplicar.
- Sem captar no horário → grupo não aparece. Boost dentro dos grupos de data permanece para captar futuros do próprio dia.

### 2. R5 — Modal recebe sempre todos os cards ativos do responsável

Em `KanbanCentralPage.tsx` (bloco 3138–3179):

- Ao abrir o `ReorderSequenceModal`, passar o array **bruto** de `cards` (todos os ativos do tenant carregados no estado), filtrando só por `assigned_to === columnId || additional_assignees.includes(columnId)`, sem aplicar filtros globais (cliente/período/status/área).
- Manter `hasActiveFilters` para o aviso existente no modal ("considera todos os cards ativos desta coluna") passar a ser verdadeiro sempre.

### 3. Sinalização de "pausado por Captar"

Ao computar a proposta em `reorderSequence.ts`, o alocador já contorna intervalos bloqueados (R2). Falta expor esse fato ao usuário:

- Em `computeReorder`, quando `allocateAcrossDays` divide um card em mais de um intervalo por causa de um bloqueio de `captar` (não daily/aguardando), anexar em `ReorderProposal` um novo campo `pausedByCaptar?: { at: string; captarId?: string; captarTitle?: string }`.
- Na coluna do Kanban Central (`TaskCard` compacto): quando o card tem `pausedByCaptar` no último resultado do reorder (persistido junto ao card ou marcado via um flag leve — ver detalhe técnico), exibir um chip discreto **"Pausado às HH:mm para captação"** ao lado das pílulas de data, com tooltip nomeando o captar.
- No `ReorderSequenceModal`, na linha da proposta, exibir o mesmo chip para o usuário entender antes de aplicar por que aquele card ficou partido/empurrado.

## Detalhes técnicos

- Arquivos: `src/pages/KanbanCentralPage.tsx` (pseudo-grupo Captar + fonte do array no modal), `src/lib/reorderSequence.ts` (detectar overlap com captar e emitir `pausedByCaptar` na proposta), `src/components/kanban/ReorderSequenceModal.tsx` (chip na linha da proposta), `src/components/TaskCard.tsx` (chip no card compacto quando aplicável).
- Persistência do "pausado": sinal efêmero no resultado da última reorder é suficiente para o modal. Para o card compacto ver o chip fora do modal, gravar em `demands.reorder_meta` (JSONB nullable já usável — se não existir, cai em migração mínima adicionando a coluna). Se o usuário preferir não persistir, o chip aparece apenas no modal — decido pela persistência para dar valor duradouro; migração é 1 coluna JSONB sem RLS mudanças.
- Sem alteração em edge functions. Realtime já cobre `demands` updates.

## Fora de escopo

- Mudar o algoritmo de reorder (R1/R2/R4 já entregues).
- Diferenciação "Publicar agendado × Publicar agora" (tópico separado, tratamos em outro ciclo).
