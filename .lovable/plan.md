# Refinamento do cabeçalho do TaskCard

## 1. Badge do cliente sem preenchimento

Hoje o nome da empresa vem em `Badge variant="secondary"` (fundo cinza-azulado). Compete com o título. Trocar por um chip "ghost":

- Remover background: `border-transparent bg-transparent px-0`.
- Cor do texto: `text-primary` (usa nosso azul semântico) — no dark mode, `dark:text-foreground` (branco/quase branco).
- Manter truncate/max-width para não empurrar o título.
- Sem borda, sem sombra. Só o nome, com peso semibold.

## 2. Título um pouco menor

Título atual: `text-3xl md:text-4xl`. Diminuir para `text-2xl md:text-3xl` (mantém hierarquia mas devolve espaço para os controles à direita).

## 3. Barra de controles reorganizada — tudo à esquerda, sem espaço vazio no meio

Situação atual: Responsável e Tipo à esquerda, `flex-1` empurrando Datas + Objetivo para a direita — sobra um vão no meio.

Nova ordem, tudo alinhado à esquerda com separadores discretos:

```
[👤 Lúcia Cotrim ▾]  ·  [🏷 Criativo estático ▾]   |   [📅 Início 23/02 09:00 ▾]  [📤 Pub 23/02 09:00 ▾]   |   [🎯]
```

Mudanças concretas:

- **Remover** o `<div className="flex-1" />` que criava o vão.
- **Separar Datas em dois chips independentes** (afetam mecanismos diferentes):
  - Chip "Início/Entrega" (ícone `Calendar`, âmbar) — abre popover com Início de Produção + Data de Entrega + Datas adicionais.
  - Chip "Publicação" (ícone `Send` ou `CalendarClock`, azul primário) — abre popover só com Data de Publicação + hora.
  - Cada chip mostra o valor resumido inline, ou `+ Início` / `+ Publicação` quando vazio.
  - Enter em qualquer input continua salvando e fechando (comportamento já implementado no popover atual, será replicado nos dois novos).
- **Objetivo (Estratégia da empresa)**: reduzir a só o ícone `Target` como chip clicável. `aria-label="Estratégia da empresa"` + `title="Estratégia da empresa"` mostra o texto no hover. Quando o campo tem conteúdo, o ícone ganha um dot indicador (`bg-primary`) no canto para sinalizar "há conteúdo". Abre o mesmo popover atual com o `BlockEditor`.
- Separadores: bullet `·` fino entre Responsável e Tipo; barra vertical `|` (`h-4 w-px bg-border`) entre grupos lógicos (identidade | datas | estratégia).

## 4. Etapa integrada aos botões Voltar / Prosseguir

Situação atual: uma linha inteira só para mostrar o chip "Etapa: Planejar" + chip "Período". E os botões `Voltar demanda` / `Prosseguir` no topo direito só mostram o rótulo genérico.

Nova composição na linha superior direita (substitui os dois botões atuais + o chip "Etapa" da linha 2):

```
[ ← Revisar ]  [ Planejar ▾ ]  [ Criar arte → ]
```

- **Botão Voltar**: mostra a seta e o **nome da etapa anterior** do fluxo (ex.: `← Revisar`). Se não houver anterior, o botão fica oculto (como hoje).
- **Chip central "Etapa atual"**: mostra o nome da etapa atual (ex.: `Planejar`) com um chevron `▾`. Clicar abre um popover com a lista de todas as etapas do pipeline daquele `demand_type_key`, destacando a atual e permitindo pular para qualquer outra. Selecionar uma etapa dispara o mesmo mecanismo de `handleProceed`/`handleRegress` estendido — ou uma variante que aceita "ir para função X" (chama a lógica existente de `pickAssigneeForFunction` + update em `current_function_key`, reaproveitando o padrão de `proceedDemand.ts`).
- **Botão Prosseguir**: mostra a seta e o **nome da próxima etapa** (ex.: `Criar arte →`). Mantém as variantes especiais atuais:
  - Última função → `Entregar ✓`
  - `publicar` → `Agendar Publicação`
  - `enviar_cliente` → `Enviar ao cliente →`
- Peso visual: os três botões ficam `variant="ghost"` com padding leve; o central usa `bg-muted/40` para indicar que é o "estado atual"; setas usam `text-muted-foreground` e ganham `text-primary` no hover.
- Fechar (`X`) permanece à direita, separado por um `flex-1` para empurrar apenas ele.

Para descobrir prev/next names sem duplicar lógica: adicionar um helper leve em `src/lib/flowFunctions.ts` (`getPipelineSequence(demandTypeKey)`) que carrega `flow_functions` uma vez e devolve o array — o TaskCard usa isso para renderizar os nomes; o clique continua chamando `proceedDemand` / `regressDemand` já existentes.

## 5. Linha "Etapa + Período" enxugada

Como Etapa migrou para os botões, a segunda linha do header fica só com o chip **Período** (quando aplicável) e o select de cliente (no modo draft). Isso reduz o header em uma linha inteira.

## Arquivos afetados

- `src/components/TaskCard.tsx`:
  - Linhas ~1074–1077: refazer badge do cliente (ghost, azul/branco).
  - Linhas ~1087–1096: reduzir tamanho do título.
  - Linhas ~1148–1210: substituir botões Voltar/Prosseguir pela composição `[← prev] [etapa atual ▾] [next →]`.
  - Linhas ~1328–1356: remover chip Etapa da linha 2 (movido para os botões).
  - Linhas ~1437–1900: reordenar barra de controles — remover `flex-1` do meio, separar chip de Datas em dois (Início/Entrega e Publicação), reduzir Objetivo a ícone com tooltip + dot indicador.
- `src/lib/flowFunctions.ts`: adicionar `getPipelineSequence(demandTypeKey)` helper (ou expor a partir do que `proceedDemand.ts` já usa internamente).
- `src/lib/proceedDemand.ts`: opcionalmente exportar/expor uma função `jumpToFunction(demandId, functionKey)` para o novo dropdown de etapa (reaproveitando `pickAssigneeForFunction` + update). Se preferir menor risco: primeiro passo pode ser dropdown read-only mostrando as etapas, sem permitir pular — decidir na implementação.

## Fora do escopo

- Nada de lógica de negócio nova nem mudança em edge functions, RLS, ou schema.
- Comportamento de save (blur, Enter) dos popovers permanece.
- Nenhuma mudança no body do card (abas Conteúdo/Anexos/etc).
