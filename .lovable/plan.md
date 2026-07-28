## Objetivo

Transformar o "Modo foco" em uma visão focada **dentro da própria Visão Geral**, mostrando apenas o responsável escolhido, mas com cada agrupamento (Produção, Avaliar, Aguardando clientes, Em revisão) virando uma **coluna independente lado a lado** — no mesmo formato visual dos cards atuais, sem sair da tela.

## Comportamento

**Ativação:**
- Substituir o ícone discreto `<Focus />` no header da coluna por um botão maior/mais visível, no mesmo local (canto direito do header da coluna). Rótulo curto "Focar" com ícone; on-hover fica destacado. Também dá para clicar no nome do colaborador para ativar.
- Remove o `navigate('/colaboradores/:id')`. O modo foco passa a ser um **estado local** da própria página (`focusedColumnId: string | null`), sem trocar de rota. A rota `/colaboradores/:userId` continua existindo para links diretos, mas o botão da coluna deixa de usá-la.
- Adicionar botão "Sair do foco" no header secundário da Visão Geral quando ativo, e tecla `Esc` para sair.

**Layout no modo foco:**
- Ocultar todas as outras colunas de colaboradores.
- A coluna do responsável foco se decompõe em N sub-colunas (cada uma com o mesmo visual/largura de coluna existente `w-[280px]`):
  1. **Produção** — cards que hoje ficam soltos na coluna (não estão em Avaliar/Aguardando/Revisão).
  2. **Avaliar** — se houver `evaluateCards`.
  3. **Aguardando clientes** — se houver `awaitingCards`.
  4. **Em revisão** — se houver `reviewCards` (mesma regra atual: só aparece se ≥3, mas em modo foco sempre aparece se >0, para consistência visual).
- Colunas vazias não aparecem.
- Header de cada sub-coluna: nome do agrupamento + contagem + cor do estado. Mantém o mesmo `KanbanCard` para renderizar.
- Drag-and-drop entre sub-colunas fica **desabilitado no modo foco** (evita ambiguidade de status vs função operacional). Cards continuam clicáveis e abrem o modal normalmente.

**Animação (leve, sem prejuízo de performance):**
- Usar `animate-fade-in` (300ms) para as sub-colunas surgirem e `animate-fade-out` para as outras colunas saírem.
- Aplicar `transition-transform` na coluna focada para deslizar até a esquerda (uma única transformação CSS, sem reflow de todas as outras).
- Não usar Framer Motion nem reordenar DOM em massa. Simplesmente:
  1. Ao ativar: outras colunas ganham classe `animate-fade-out` e depois `hidden` (via `focused && column.id !== focusedColumnId`).
  2. A coluna focada permanece; um `useMemo` gera as sub-colunas e um wrapper flex as renderiza com stagger natural via CSS delay (`style={{ animationDelay: `${i * 40}ms` }}`).
- Total de nós DOM no modo foco tende a ser MENOR que o modo normal (só cards de 1 responsável), então performance melhora, não piora.

## Escopo técnico

Editar somente `src/pages/KanbanCentralPage.tsx`:

1. Adicionar estado `focusedColumnId: string | null` e helpers `enterFocus(id)` / `exitFocus()`.
2. Trocar o handler do botão `<Focus />` para `enterFocus(column.id)` e melhorar aparência (maior, com texto "Focar" em telas ≥ md).
3. No render das colunas, quando `focusedColumnId` estiver setado:
   - Filtrar `visibleColumns = columns.filter(c => c.id === focusedColumnId)`.
   - Dentro dessa coluna, em vez de renderizar o layout atual (com collapsibles), renderizar N sub-colunas via um novo componente inline `FocusSubColumns` que reaproveita a lógica já existente de `awaitingCards / reviewCards / evaluateCards / columnCards`.
4. Header secundário: renderizar chip "Foco: <Nome>" com botão × para sair. Adicionar `useEffect` para `keydown Escape → exitFocus()`.
5. Desabilitar `<Droppable />` / `<Draggable />` no modo foco (passar `isDropDisabled` e `isDragDisabled`).
6. Preservar scroll horizontal ao entrar/sair (usar o mesmo `scrollTop` preservation já existente).

**Não alterar:**
- Rota `/colaboradores/:userId` e `CollaboratorDemands.tsx` (ficam como estão, para links externos/breadcrumbs).
- Realtime, filtros globais, badges, popover de histórico — tudo continua funcionando; sub-colunas leem dos mesmos arrays já computados.
- Lógica de status ou função operacional dos cards.

## Fora de escopo

- Nada de reordenar cards nas sub-colunas.
- Sem novo endpoint / query — puramente client-side sobre dados já carregados.
- Sem mudar mobile/tablet layout além de garantir que a barra rolável horizontal continua funcionando quando várias sub-colunas aparecem.
