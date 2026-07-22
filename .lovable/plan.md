
## Objetivo

Refinar o header do modal de demanda (`src/components/TaskCard.tsx`) para reduzir o peso visual dos controles principais, reorganizar a linha do título com a Estratégia à esquerda, unificar os popovers de data com o padrão já usado nos cards da Visão Geral, e eliminar a linha solta do Período.

## Mudanças

### 1. Aliviar os botões "Planejar / Criar arte" (linha 1197–1288)

O grupo hoje usa `Button variant="secondary"` (etapa atual) + `Button variant="default"` (próxima etapa), ambos com background sólido, o que os faz parecerem "colados" e competirem entre si. Vamos transformar o grupo em uma única barra segmentada leve:

- Container: manter `rounded-lg bg-muted/40 p-0.5`, mas reduzir altura para `h-8` (mais discreto) e apertar espaçamento (`gap-0`).
- Botão "voltar etapa" (prev): já é `ghost` — manter, só ajustar para `h-8` e remover borda visível.
- Botão "etapa atual" (popover trigger): trocar `variant="secondary"` por `variant="ghost"` com `text-foreground/80` e um pequeno `border-x border-border/40` que sirva de divisor sutil, em vez de um bloco preenchido.
- Botão "próximo passo" (Planejar / Criar arte / Agendar Publicação / Entregar): manter como ação primária mas suavizar — usar `variant="ghost"` + `text-primary hover:bg-primary/10` + ícone `ArrowRight` primário; para o caso `isLastFn` (Entregar) e `nextIsPublicar` (Agendar Publicação) manter também em ghost primário para consistência. A hierarquia continua legível porque só ele fica com cor primária, mas sem mais o bloco azul chapado.

Resultado: uma única faixa cinza clara com três chips fantasmagóricos, ação principal indicada por cor primária no texto/ícone.

### 2. Estratégia do cliente como primeiro item da linha do título (linha 1078–1106 e 1808–1840)

Hoje o "Objetivo estratégico" (ícone `Target`) vive na barra inferior de controles. Ele passa a ser o **primeiro item** da linha 1 do header, antes do nome da empresa e do título:

Nova ordem da linha 1:
```
[🎯 Estratégia] · [Yön Contadores] [Título da demanda]        [prev · atual · próx] [X]
```

- Remover o Popover do Objetivo da barra inferior (linhas 1808–1840).
- Reinseri-lo antes de `card.clientName`, dentro do mesmo `div` flex do título:
  - Trigger: botão pequeno `h-8 w-8` (ghost) com ícone `Target` (`text-primary` quando `hasContent`, senão `text-muted-foreground`), mesmo dot indicador de conteúdo.
  - `aria-label`, `title` e um pequeno `<span className="sr-only">Estratégia do cliente</span>` para leitores de tela.
  - Adicionar também um `Label`/hint visível **dentro do PopoverContent** no topo: `<div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Estratégia do cliente</div>` — é a "label" pedida para descrever o que é aquele ícone/popover, sem poluir a linha do título.
- O `PopoverContent` mantém o `BlockEditor` existente e a persistência via `handleFieldSave('objective', ...)`.

### 3. Datas com o mesmo popover da Visão Geral (linha 1540–1806)

Hoje a linha inferior tem dois "chips" (Produção e Publicação) que abrem popovers customizados com duas linhas empilhadas. Vamos alinhar com o padrão de `src/components/KanbanCard.tsx` (linhas 130–226), que abre lado a lado dois calendários (Início | Término) com inputs de hora e navegação Tab/Enter — exatamente o que o usuário está pedindo.

Passo a passo:

- Extrair o corpo do popover atual do `KanbanCard.tsx` (o `<PopoverContent>` com dois `<Calendar>` lado a lado + inputs `time` com `tabIndex` 1/2 e `endTimeRef` para Tab) para um componente compartilhado:
  - Novo arquivo: `src/components/kanban/StartEndDatePopover.tsx` (`StartEndDatePopover` para Produção e um `SingleDateTimePopover` para Publicação, no mesmo arquivo).
  - Props: `startDate`, `startTime`, `endDate`, `endTime`, `onSave({due_date, due_time, delivery_date, delivery_time})`, `disabled`, `trigger` (ReactNode).
  - Preservar o comportamento de Tab do input `Início/Hora` → foco em `Término/Hora`, e Enter salvando.
- Refatorar `KanbanCard.tsx` para consumir esse componente (mesma UI, zero regressão).
- Em `TaskCard.tsx`, substituir o Popover atual de "Produção" (chip com `Início Segunda, 23/02/2026`) pelo mesmo `StartEndDatePopover`, usando o chip existente como `trigger`.
- Para o chip "Publicação", usar `SingleDateTimePopover` (mesma estética: um Calendar + input `time` com Tab/Enter e botão Salvar), preservando o suporte a `additional_publish_dates` como sub-lista logo abaixo do Calendar, dentro do mesmo `PopoverContent` (mantém o comportamento atual, só troca a moldura para o padrão visual do KanbanCard).

Isso resolve: mesma experiência visual do card da Visão Geral, mesmos atalhos de teclado (Tab entre horas, Enter para salvar), e um único ponto de manutenção.

### 4. Período inline, no fim da barra de controles (linhas 1409–1471)

- Remover o bloco `Período` da linha própria (linhas 1412–1471).
- Reinserir dentro da mesma barra `bg-muted/30` da linha "Responsável · Tipo · Produção · Publicação · Objetivo", depois de Publicação e antes do (agora removido) Objetivo:
  ```
  [👤 Responsável] · [🏷 Tipo] · [📅 Produção] · [📣 Publicação] · [🔗 inteligencia continua 4.0 ✕]
  ```
- Estilo do chip: `inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded hover:bg-background/60`, ícone `Link` em `text-muted-foreground`, título do período truncado em `max-w-[200px]`. Botão `✕` continua desvinculando via `supabase.from("demands").update({ period_plan_id: null })`.
- Quando não vinculado e `periodPlans.length > 0`, exibir mini `Select` inline com placeholder "Vincular período".
- Isso elimina a linha inteira que hoje o Período ocupa sozinho e mantém a hierarquia coerente com os demais chips.

## Detalhes técnicos

- Nenhuma mudança em lógica de negócio ou schema. Só reestruturação visual e extração de um componente reutilizável de date picker.
- `handleFieldSave`, `onSave`, `handlePublishDateChange`, `handlePublishTimeChange`, `handleAddAdditionalDate`, `handleRemoveAdditionalDate`, `handleLinkPeriod`, `proceedDemand`, `regressDemand`, `jumpToFunction`, `handleDeliver` permanecem inalterados; só os wrappers visuais mudam.
- O padrão `pointer-events-auto` no Calendar dentro de Popover é preservado (necessário no shadcn Popover).
- Componente compartilhado localizado em `src/components/kanban/StartEndDatePopover.tsx` para ser importado tanto por `KanbanCard.tsx` quanto por `TaskCard.tsx`.

## Arquivos afetados

- `src/components/TaskCard.tsx` — header, barra de controles.
- `src/components/KanbanCard.tsx` — passa a consumir o componente compartilhado.
- `src/components/kanban/StartEndDatePopover.tsx` — novo.

## Fora de escopo

- Nenhuma alteração em lógica de estágios, tipos de demanda, RLS, ou edge functions.
- Não mexer no comportamento de "Datas adicionais" além de recolocá-lo dentro do novo popover de Publicação.
