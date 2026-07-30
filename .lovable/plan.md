## 1. Botões da tela inicial

Em `src/lib/constants/navigation.ts`:

- `clientes`: título passa de "Cliente" para **"Clientes Mídia"** (segue em 1º lugar).
- Reordenar a lista para: Clientes Mídia → **Clientes Sistemas** → Visão Geral das Tarefas → Ver Conteúdos Agendados. A Home e a Sidebar seguem a ordem do array, então nada mais precisa mudar.

## 2. Customer Success · Sistemas mais gráfico

Mantendo o header atual (padrão da Visão Geral), a tela ganha duas camadas visuais acima da tabela:

**a) Barras de saúde com faixa desejável**
Para cada cliente, uma barra horizontal representando "dias desde o último contato" contra a cadência configurada (`cadenceDays`):

```text
Belloti      |=========|·····|      há 4 d   (cadência 7 d)
             0        ok    limite
Clínica X    |==============|××××|  há 12 d  (cadência 7 d)
```

- Faixa verde (0 → cadência): zona desejável.
- Faixa âmbar (cadência → cadência × 1.5): atenção.
- Faixa vermelha além disso: risco.
- Marcador na posição atual do cliente, com tooltip (último contato, tipo, demandas abertas/atrasadas).

**b) Linha do tempo de contatos (últimos 90 dias)**
Uma faixa por cliente, eixo de datas comum no topo (semanas), com:
- Um ponto por touchpoint (`client_touchpoints`), colorido por tipo (solicitação, visita, reunião, etc.) e com tooltip de data + resumo.
- **Faixa/margem de cadência desejada**: sombreamento de fundo repetido a cada `cadenceDays` — cada bloco onde havia contato fica claro (dentro do esperado) e cada bloco sem contato fica marcado (gap), mostrando visualmente onde deveria haver contato e não houve.
- Trecho final destacado quando o tempo desde o último contato já passou da cadência.

Interação: clicar em um ponto ou faixa abre o Sheet de histórico já existente; os cartões de resumo (Ok / Atenção / Risco) continuam filtrando também os gráficos.

A tabela detalhada permanece abaixo, colapsável, como visão analítica.

## Detalhes técnicos

- Dados: reutilizar `loadSystemsClientHealth` (já traz `lastTouchAt`, `daysSinceTouch`, `cadenceDays`, `openDemands`, `overdueDemands`, `touchpoints30d`). Para a timeline, adicionar em `src/lib/clientHealth.ts` uma função que carrega touchpoints dos últimos 90 dias de todos os subclientes do tenant em uma única query (agrupando por `subclient_id`), evitando N requisições.
- Renderização com divs/SVG e tokens semânticos do design system (sem cores hardcoded); novos componentes em `src/components/customer-success/` (`HealthCadenceBar.tsx`, `TouchpointTimeline.tsx`) para manter `CustomerSuccessSistemas.tsx` enxuto.
- Responsivo: em telas pequenas a timeline rola horizontalmente com o eixo de datas fixo.

## Verificação

Abrir a Home (conferir ordem e nomes dos botões) e `/customer-success-sistemas` com clientes reais, validando que a posição do marcador e os gaps coincidem com os dados da tabela.
