# Hub do Cliente: aproximar do layout de referência

O conteúdo já está certo; o que falta é a linguagem visual editorial da referência. Ajustes só de front-end/apresentação.

## 1. Barra fixa de topo (nova)

Faixa branca fina no topo do hub, acima de tudo:

```text
[LH] LEAL HOSPITAL VETERINÁRIO            01 AGO ——— 31 AGO   [ CAMPANHA ]
     Campanha Julho 26
```

- Monograma quadrado com as iniciais do cliente (fundo primary, texto primary-foreground).
- Nome em caps com tracking, subtítulo pequeno em muted.
- À direita: datas de início/fim separadas por um traço fino + bloco sólido primary com um rótulo curto do período.

## 2. Hero editorial (substitui o card com gradiente)

- Sem card, sem borda, sem gradiente: fundo da página, respiro grande.
- Kicker em caps laranja/primary: `PLANO OPERACIONAL · <período>`.
- Título gigante em 2–3 linhas (`text-5xl/6xl`, leading apertado), com a última linha em cor de destaque — ex.: "Cronograma de conteúdo **pronto para executar.**".
- Subtítulo em 2 linhas, largura máxima curta, muted.
- Métricas à direita, empilhadas em blocos separados por linha divisória (número enorme + label pequena ao lado), no lugar dos 4 cards atuais.
- Sem período ativo: mesmo hero com título alternativo e o caminho de setup como lista de passos.

## 3. Abas e barra de ações

- Abas viram texto sublinhado (underline na ativa, sem pílulas cinzas), sobre uma linha divisória horizontal que atravessa a largura.
- A barra de ações (chips) sai de cima das abas e passa a ficar **abaixo** do hero, como uma linha discreta de links/chips menores e mais leves (sem borda pesada), para não competir com o título.

## 4. Aba Demandas

- Busca com label `BUSCAR` em caps acima do input; filtros à direita em pílulas pequenas (ativa preenchida escura/primary).
- Linhas cheias, sem cards individuais: cada linha com coluna de data à esquerda (dia grande + mês pequeno em caps), código/eixo em caps pequenos, título em negrito, subtítulo com tipo/formato, badge de estado pastel à direita e seta `→`.
- Separadores finos entre linhas, hover suave.

## 5. Aba Calendário

- Grade semanal 7 colunas com cabeçalho escuro (DOM…SÁB) em caps.
- Cada célula: número do dia grande + mês pequeno, e itens como blocos pastel com borda esquerda colorida por tipo, hora + tipo em caps acima do título.
- Hoje destacado; a lista vertical atual por dia fica só no mobile.

## 6. Cuidados fundamentais / Estratégia

- Mesma tipografia editorial: títulos de seção em caps pequenos com tracking, números grandes na lista, colunas com divisória fina em vez de cards com borda.

## Detalhes técnicos

- Arquivos: `ClientHubHeader.tsx` (topbar + hero + métricas), `ClientHubActionBar.tsx` (chips mais leves), `DemandsTab.tsx`, `CalendarTab.tsx`, `StrategyTab.tsx`, `GuidelinesTab.tsx`, e o bloco de `Tabs` em `src/pages/ClientHub.tsx` (abas underline, ordem hero → ações → abas).
- Tipografia grande/tight e cores por token do design system (primary azul, muted, card); badges de estado usam tons suaves derivados dos tokens, sem hex hardcoded.
- Nenhuma mudança de dados, hooks, permissões ou lógica de geração.
