
## 1. Cliques repetidos ao criar demanda

**Diagnóstico:** o botão "Salvar Demanda" (modo draft do `TaskCard`) chama `handleDraftSave` em `KanbanCentralPage.tsx`, que executa uma RPC + `UPDATE` + `recordFlowHistory` + `fetchAllCards`. Não há trava — cada clique dispara uma nova criação em paralelo.

**Correção:**
- Adicionar estado `isSavingDraft` em `KanbanCentralPage.tsx`. Guarda no início de `handleDraftSave` (retorna se já `true`), `finally` reseta.
- Passar `savingDraft={isSavingDraft}` para `TaskCard`.
- No `TaskCard` (bloco isDraft, linhas ~1090-1102): aceitar prop `savingDraft`, aplicar `disabled={savingDraft}` no botão "Salvar Demanda" e trocar ícone por `Loader2 animate-spin` + texto "Salvando…" enquanto ativo. Desabilitar também o botão "Descartar" durante o save.
- Como camada extra de segurança, usar `useRef<boolean>` para descartar chamadas concorrentes mesmo se o React ainda não re-renderizou.

## 2. Nome da empresa antes do título

No `KanbanCard.tsx` o `subtitle` (nome do cliente) já vem, mas hoje é renderizado como badge azul pequena (fonte 11px, cores primary). O usuário quer o nome da empresa **acima do título, no mesmo estilo tipográfico do título**.

**Correção em `src/components/KanbanCard.tsx`:**
- Remover o wrapper de badge (background/border/uppercase) do `subtitle`.
- Renderizar como texto simples acima do título: mesma família de fonte, `text-sm font-semibold text-foreground`, `line-clamp-1` e `truncate` para não estourar. Manter `title={subtitle}` para tooltip.

## 3. Datas de início e término em uma única linha

Hoje, em `KanbanCard.tsx` (bloco `showStartEndLabels`), início e término ocupam duas linhas empilhadas.

**Correção:**
- Substituir por **um componente único** clicável (`button` do card, `stopPropagation`) que exibe: à esquerda "Início: dd/mm HH:MM", separador vertical, à direita "Término: dd/mm HH:MM". Mesma linha, `flex justify-between items-center`, texto compacto (`text-xs`), fundo neutro (`bg-muted/40`), cor vermelha se overdue.
- Ao clicar, abrir um `Popover` contendo dois calendários lado a lado (Início | Término), cada um com input de horário. O Popover reaproveita o `Calendar` (shadcn) já existente.
- A confirmação do Popover chama uma nova prop `onDatesChange({ due_date, due_time, delivery_date, delivery_time })`, propagada de `KanbanCentralPage` para atualizar via `supabase.from("demands").update(...)` + realtime.
- Fora do Kanban Central (Cronograma, etc.), a nova prop é opcional; sem handler o Popover fica somente leitura ou é substituído pela visualização não-clicável.

## 4. Agrupar cards na coluna de Revisão (por responsável)

Hoje só cards com `current_function_key === 'aguardando_cliente'` são agrupados em "Aguardando clientes". Queremos comportamento análogo para revisão, mas condicional.

**Correção em `KanbanCentralPage.tsx` (bloco de montagem da coluna, ~linhas 1650-1660 e 1828-1887):**
- Separar `revisionCards = columnCards.filter(c => c.current_function_key === 'revisar' || status name inclui 'revis')`. Confirmar o valor real inspecionando `flow_functions` — se a chave for outra (`revisao`, `revisar_arte`, etc.), listar todas as function_keys do fluxo e agrupar as que representam revisão. Se houver dúvida, adicionar helper `isReviewFunction(key)` centralizado em `src/lib/flowFunctions.ts` (novo).
- Aplicar regra: se `revisionCards.length >= 3`, remover esses cards de `columnCards` e renderizar uma seção colapsável **"Em Revisão (N)"** com o mesmo estilo visual da seção "Aguardando clientes", em cor distinta (âmbar/laranja). Se `< 3`, manter renderização inline atual (sem seção).
- Estado de colapso: reutilizar padrão de `collapsedAwaiting` — criar `collapsedReview: Set<string>` (por `column.id`) e helper `toggleReview`.

## Detalhes técnicos

- Arquivos alterados:
  - `src/pages/KanbanCentralPage.tsx` — guard `isSavingDraft`, agrupamento de revisão, handler `onDatesChange`.
  - `src/components/TaskCard.tsx` — prop `savingDraft`, botão desabilitado + loader.
  - `src/components/KanbanCard.tsx` — subtitle como título superior; componente único de datas com Popover.
  - `src/lib/flowFunctions.ts` (novo) — helper `isReviewFunction`.
- Sem migrações de banco. Sem alteração de contratos server-side.
- Verificar após mudanças: build TS, e um smoke visual do Kanban Central (screenshot Playwright) confirmando: nome da empresa em cima, datas numa linha só, botão de salvar bloqueado no segundo clique, agrupamento de revisão aparecendo em coluna com ≥3 cards.
