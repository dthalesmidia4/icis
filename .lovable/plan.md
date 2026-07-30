## 1. Tela inicial — o código já está correto

`src/lib/constants/navigation.ts` já contém, nesta ordem: **Clientes Mídia** → **Clientes Sistemas** → Visão Geral das Tarefas → Ver Conteúdos Agendados. O print mostra "Cliente" e a ordem antiga, ou seja, o navegador está servindo bundle antigo (o projeto tem service worker em `public/sw.js` / `registerSW.js`, que faz cache do app).

Ação: nenhuma mudança de lógica. No plano eu adiciono apenas uma limpeza de cache no registro do service worker (bump de versão de cache) para que atualizações de UI cheguem sem hard reload. Se preferir, testo antes com recarregamento forçado e só mexo no SW se persistir.

## 2. Customer Success — o que falta hoje

O que existe hoje: barra de cadência sem número de data, e uma "linha do tempo" feita de blocos vermelhos/verdes — não mostra **quando foi o último contato** nem deixa clara a **faixa desejada**. É por isso que aparece tudo vermelho e ilegível.

## 3. Nova tela (referência: gráficos de SLA / "days since last touch" usados em CS)

A representação correta para "estou dentro da cadência?" é um **gráfico de linha do tempo de dias-desde-o-último-contato**, com faixas de meta ao fundo:

- Eixo X: dias do período (30d / 90d / 180d).
- Eixo Y: **dias desde o último contato** naquele dia (sobe 1 por dia sem contato, cai a zero em cada contato → dente de serra).
- Faixas de fundo (`ReferenceArea` do recharts, já instalado):
  - verde `0 → cadência` = **faixa desejável**
  - amarelo `cadência → 2× cadência` = atenção
  - vermelho acima de 2× = risco
- `ReferenceLine` tracejada na meta (ex.: 30d) com rótulo "meta 30d".
- Uma linha por cliente, cores distintas, legenda clicável para isolar um cliente.
- Tooltip por data: cliente, dias sem contato, e último contato daquela data (tipo + data/hora).
- Pontos marcados (`dot`) nos dias em que houve contato.

### Cartões de resumo por cliente (acima do gráfico)
Substituem a barra atual e passam a dizer explicitamente:
- **Último contato: 12/07/2026 14:20 · Solicitação (há 18 dias)** — ou "Nunca registrado".
- **Próximo contato ideal até: 11/08/2026** (último + cadência), com chip verde/amarelo/vermelho.
- Mini barra de progresso dias/meta, mantendo a zona desejável sombreada.
- Botão "Registrar contato" e "Histórico" direto no cartão.

## 4. Detalhes técnicos

- `src/lib/clientHealth.ts`: adicionar `buildCadenceSeries(rows, timeline, days)` que gera, por dia do período, `{ date, [clientId]: diasSemContato, ... }` e o mapa de contatos por dia para o tooltip. Sem mudança de banco.
- Novo `src/components/customer-success/CadenceLineChart.tsx` com recharts (`ResponsiveContainer`, `LineChart`, `ReferenceArea`, `ReferenceLine`, `Tooltip` custom). Quando as cadências dos clientes diferirem, as faixas usam a cadência do cliente selecionado (ou a mediana, com nota) — por padrão hoje todos são 30d.
- Reescrever `src/components/customer-success/HealthCadenceBar.tsx` como cartão "Último contato / próximo ideal".
- Remover `TouchpointTimeline.tsx` (blocos) e atualizar `src/pages/CustomerSuccessSistemas.tsx`: cartões de resumo → gráfico de linha (com seletor 30/90/180) → "Ver tabela detalhada" mantido.
- Tudo com tokens semânticos do design system (nada de cores hardcoded fora dos tokens já usados para saúde).

## 5. Verificação
Abrir `/customer-success-sistemas` no preview e confirmar: data do último contato visível em cada cliente, faixa verde/amarela/vermelha e linha de meta no gráfico, dentes de serra caindo nos dias de contato, e alternância 30/90/180 funcionando.
