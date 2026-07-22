## Diagnóstico

- O container real com scroll é `<main className="flex-1 overflow-auto ...">` em `src/components/Layout.tsx`. As colunas do Kanban Central herdam essa rolagem (não há `overflow-y` próprio nas colunas).
- Ao abrir um card, `TaskCard` renderiza um overlay `fixed inset-0` e, no `useEffect`, aplica `document.body.style.overflow = 'hidden'`. Isso não trava/preserva o scroll do `<main>` — em alguns browsers/rerenders o scrollTop do `<main>` acaba indo a 0 quando o overlay fecha (o layout do main é reavaliado e o valor não é restaurado).
- Resultado: ao fechar (X, Esc ou clique fora), o usuário volta ao topo da coluna e perde a posição.

## Solução (simples, sem overhead)

Guardar o `scrollTop` do container `<main>` no momento em que o TaskCard abre e restaurar quando fecha. Sem observadores, sem listeners contínuos — apenas 1 leitura ao abrir e 1 escrita ao fechar.

### Alterações

**`src/pages/KanbanCentralPage.tsx`**
1. Adicionar `const savedScrollRef = useRef<{ el: HTMLElement | null; top: number } | null>(null);`
2. Criar helper `captureMainScroll()`: sobe pelo DOM a partir de `document.activeElement` ou de um ref no root da página até achar `main` (ou o elemento com `overflow-auto`); salva `{ el, top: el.scrollTop }`.
3. No `handleTaskClick` (linha ~800), antes de `setSelectedCard`/`setIsTaskCardOpen(true)`, chamar `captureMainScroll()`.
4. Idem no efeito de auto-open por URL (linha ~460) para o caso `openCard=true`.
5. Adicionar `useEffect` que observa `isTaskCardOpen`: quando muda de `true → false` e `savedScrollRef.current` existe, usar `requestAnimationFrame(() => { el.scrollTop = top; savedScrollRef.current = null; })` para restaurar após o re-render.

Alternativa mais robusta (se preferir): pegar o `<main>` uma única vez via `document.querySelector('main')` dentro do `captureMainScroll` — evita ref-passing pelo Layout.

## Fora de escopo

- Não vamos remover o `document.body.style.overflow = 'hidden'` do TaskCard (protege modais aninhados).
- Não vamos aplicar rolagem interna por coluna (mudaria layout e UX de toda a Visão Geral e Modo Foco).
- Não vamos usar `sessionStorage` — a memória é apenas em runtime, curta e barata.

## Verificação

- Abrir Visão Geral, rolar a coluna da Lúcia até um card no meio, abrir card, clicar em fechar/Esc → a posição da coluna deve permanecer exatamente onde estava.
- Repetir em Modo Foco (`CollaboratorDemands`) — aplicar a mesma técnica lá se o problema também ocorrer (aguardo confirmação; escopo inicial é apenas `KanbanCentralPage`).
