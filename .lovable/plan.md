## De onde vieram os "149 dias"

Não vem do banco. Os contatos reais existem e são recentes (Bellotti e Pontes Gestal em 27/07, LEAL em 30/07). O número é gerado pelo próprio gráfico:

Em `buildCadenceSeries` (`src/lib/clientHealth.ts`), quando um cliente ainda não tem nenhum contato **antes** do dia analisado, o código inventa um valor:

```text
valor = (dias desde o início da janela) + tamanho da janela
```

Com a janela padrão de 90 dias, o primeiro dia já começa em 90 e vai subindo até ~149 no fim de julho — exatamente a rampa diagonal idêntica para todos os clientes que aparece no print. Ou seja, é um placeholder artificial, não histórico real.

Além disso, a busca da linha do tempo só traz contatos dentro da janela (`loadSubclientTouchpointTimeline(days)`), então o último contato anterior à janela é frequentemente desconhecido.

## Correções

### 1. Acabar com a rampa artificial
- Em `buildCadenceSeries`: quando não houver nenhum contato conhecido até aquele dia, retornar `null` (Recharts corta a linha) em vez do valor inventado. A linha só começa a partir do primeiro contato conhecido.
- Usar como semente o último contato real anterior à janela: `loadSystemsClientHealth` já calcula `lastTouchAt` sobre **todo** o histórico (contatos + demandas com origem de cliente); passar esse timestamp como ponto inicial sempre (hoje só é usado se cair antes do início da janela — manter, mas sem o fallback fake).
- Resultado: nenhum cliente aparecerá com "149 dias" fantasma; quem nunca teve contato simplesmente não desenha linha e continua sinalizado nos cartões como "nunca registrado".

### 2. Inverter a leitura do gráfico (bom em cima)
Em `CadenceLineChart.tsx`:
- `YAxis` com `reversed` — 0 dia sem contato passa a ficar no topo e os valores altos embaixo.
- Reordenar as faixas de fundo conforme a nova orientação: verde (0 → cadência) no topo, âmbar (cadência → 2× cadência) no meio, vermelho (2× cadência → máximo) na base.
- Reposicionar o rótulo da linha de meta (`meta 30d`) para não colidir com a faixa verde.
- Ajustar a legenda para a nova leitura: "quanto mais alto, mais recente o contato".

### 3. Período de 7 dias e novo padrão
- Botões de período passam a ser `7 / 30 / 90 / 180`, com **7d selecionado por padrão** (`useState(7)` em `CustomerSuccessSistemas.tsx`).
- Em janelas curtas o eixo X mostra todos os dias (ajustar `tickInterval` para não esconder rótulos quando houver poucos pontos).
- Os cartões de cadência e a tabela continuam usando o histórico completo, sem depender da janela do gráfico.

## Detalhes técnicos

Arquivos alterados:
- `src/lib/clientHealth.ts` — `buildCadenceSeries` retorna `null` para dias sem contato conhecido; tipo do ponto passa a aceitar `number | null`.
- `src/components/customer-success/CadenceLineChart.tsx` — eixo invertido, faixas reordenadas, `connectNulls={false}`, ticks adaptativos, legenda atualizada.
- `src/pages/CustomerSuccessSistemas.tsx` — opções de janela `[7, 30, 90, 180]` e default `7`.

Sem migração de banco: é correção de cálculo e apresentação.
