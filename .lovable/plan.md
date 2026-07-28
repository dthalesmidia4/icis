## Escopo
Três ajustes visuais no card e no modo foco da Visão Geral.

### 1. Suavizar entrada/saída do modo foco
Hoje `KanbanCentralPage.tsx` troca o array de colunas instantaneamente ao setar `focusedColumnId`, o que causa o corte seco.

Solução leve, só CSS (sem libs de animação, sem re-render extra):
- Aplicar `animate-fade-in` (já existente no tailwind: 0.3s ease-out, fade + slide-up de 10px) no wrapper de cada coluna do Kanban.
- Usar uma `key` que muda ao entrar/sair do foco (ex.: `focus:${focusedColumnId ?? 'none'}:${column.id}`) para que as sub-colunas do foco (Produção/Avaliar/Aguardando/Revisão) e as colunas normais toquem a animação ao montar.
- Nenhum listener JS extra, nenhum layout shift observado; animação é puramente `opacity` + `transform`, boa para máquinas fracas.

Como o react-beautiful-dnd exige que o `Droppable` esteja montado, não animamos saída — apenas a entrada dos novos elementos, o que já elimina a sensação de corte seco.

### 2. Remover badge "Sistemas"
Em `src/components/KanbanCard.tsx`:
- Remover o `<Badge>` "Sistemas" (linhas ~198–201).
- Manter a cor de fundo/borda `slate` do card (linha 168) como identificador visual único.
- Ajustar o `flex-wrap` container para só renderizar quando `isDailyCard` for verdadeiro (não depender mais de `isSistemas`).

Sem badge equivalente para "Mídia" — a cor default do card já representa mídia.

### 3. Etapa exibida após o nome da empresa
Hoje o subtítulo do `KanbanCard` mostra apenas `card.clientName`. A etapa (`card.status`) já é passada via prop `statusName` mas não é renderizada no cabeçalho.

Em `KanbanCard.tsx`, no bloco do subtítulo (linhas 173–180):
- Renderizar `clientName` seguido de `statusName` na **mesma fonte e tamanho** (`text-xs font-semibold`), separados por um divisor sutil `·` em `text-muted-foreground/60`.
- A etapa recebe cor mais suave (`text-muted-foreground`) para não competir com o nome da empresa, mas sem virar "badge" nem mudar tipografia.
- `line-clamp-2` preservado para não quebrar o layout do card.

Resultado no card: `Hospital Veterinário Leal · Revisar` acima do título da demanda.

## Detalhes técnicos
- Arquivos alterados: `src/components/KanbanCard.tsx`, `src/pages/KanbanCentralPage.tsx`.
- Sem mudanças no banco, edge functions, ou lógica de negócio.
- Sem novas dependências; usa apenas utilitários Tailwind já configurados (`animate-fade-in`).
