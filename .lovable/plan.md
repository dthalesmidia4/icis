## Escopo
Tornar visível a transição entrar/sair do modo foco e permitir sair clicando no cabeçalho de qualquer sub-coluna do foco.

### 1. Animação real da reorganização das colunas
`animate-fade-in` só toca no mount — quem já existia (a coluna da Lúcia à direita, por exemplo) não se move visivelmente para a esquerda. Para animar a mudança de posição sem lib pesada, usar a **View Transitions API** nativa do browser (`document.startViewTransition`), que faz FLIP automático entre estados do DOM.

Em `src/pages/KanbanCentralPage.tsx`:
- Criar um helper `withViewTransition(fn)` que chama `document.startViewTransition(fn)` quando disponível, senão executa `fn()` direto (fallback silencioso).
- Envolver as trocas de foco: `enterFocus`, `exitFocus` e o ESC handler passam por `withViewTransition`.
- Em cada wrapper de coluna, adicionar `style={{ viewTransitionName: \`kcol-${column.id}\` }}`. Como a coluna do responsável mantém o mesmo `columnUserId` na sub-coluna "production" (ex.: `<uid>::production` vs `<uid>`), usar um nome estável baseado em `columnUserId` para essa sub-coluna, para que o browser reconheça como o mesmo elemento e faça o slide para a esquerda. As demais sub-colunas (avaliar/aguardando/revisão) recebem nomes únicos e entram com o cross-fade padrão da API.
- Custo: nenhum listener JS de animação; o browser faz o snapshot e roda transição em compositor (bom para máquinas fracas). Sem impacto em dispositivos que não suportam a API (fallback direto).

### 2. Sair do foco clicando no header de qualquer sub-coluna
Hoje, em `KanbanCentralPage.tsx`, o botão-header só é clicável quando `!focusKind || focusKind === 'production'`. Sub-colunas Avaliar/Aguardando/Revisão ficam com `<div>` estático.

Alterar a condição `isFocusToggle` para: `columnUserId !== "__unassigned__" && !isHistoryMode && (!focusKind || focusKind === 'production' || focusKind)`. Simplificando: quando há `focusKind` (qualquer valor), o header vira botão de "Sair do foco". O ícone `Focus` continua sendo mostrado como indicador ativo apenas na sub-coluna do responsável (production) para não poluir; nas demais sub-colunas mostra apenas o título clicável com `title="Sair do modo foco"`.

### 3. Detalhes técnicos
- Arquivo alterado: `src/pages/KanbanCentralPage.tsx`.
- Adicionar CSS mínimo em `src/index.css` para tunar a duração da view transition (`::view-transition-group(*) { animation-duration: 260ms; }`) — mantém a sensação "breve e rápida" pedida pelo usuário.
- Sem novas libs, sem mudança de banco, sem mudança em edge functions.
