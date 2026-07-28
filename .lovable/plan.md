## Ajustes na tela Evolução das Demandas

Cinco correções focadas em `src/pages/ClientEvolution.tsx`. Sem mudança de dados ou lógica de negócio.

### 1. Header em uma linha só

Hoje o `BackButton` fica isolado no topo e o título/subtítulo centralizado ocupa outra faixa vertical. Novo layout:

```text
[← Voltar]   Evolução das Demandas · SmartVety                          [ativas | período ▾]
```

- `BackButton` à esquerda, título+subtítulo (inline, separados por `·`) no centro/esq., controles à direita, tudo em uma única `flex` row.
- Ícone `Activity` fica antes do título, mesma linha.

### 2. Indicador de área (Mídia × Sistemas)

Cada linha da tabela ganha um marcador visual da `work_area` da demanda:

- Coluna estreita à esquerda do título com uma barra vertical colorida (2px), sem header, sem ocupar largura significativa:
  - `midia` → cor primary (azul)
  - `sistemas` → âmbar suave (mesmo pastel usado no Kanban)
  - sem área → cinza neutro
- Tooltip no hover mostra "Mídia" / "Sistemas".

Também adiciona toggle no header da tabela (chips pequenos) para filtrar por área: `Todas · Mídia · Sistemas`.

### 3. Integrar resumo + pipeline num único bloco de controle

Hoje há três blocos empilhados competindo (5 cards de resumo, barra de progresso, card de pipeline). Consolidar em um único painel:

```text
┌───────────────────────────────────────────────────────────────────────┐
│  Total 5   Em andamento 5   Concluídas 0   Fila 0   Atrasadas 0       │
│  ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░  0 de 5 · 0%                            │
│  ─────────────────────────────────────────────────────────────────    │
│  Planejar 5 › Criar roteiro 0 › Criar arte 0 › … › Concluídas 0       │
└───────────────────────────────────────────────────────────────────────┘
```

- Um único `Card` com três faixas: contadores compactos em linha (não mais grid de 5 cards grandes), barra de progresso inline fina, pipeline abaixo com divisor sutil.
- Contadores viram chips clicáveis pequenos (não cards de 2xl), reduzindo peso visual.
- Pipeline mantém interação (clique filtra) mas com pílulas menores e ChevronRight mais discreto.

### 4. Filtro de escopo (ativas / período)

Novo controle no header da tela (canto direito) com dois seletores:

- **Escopo**: chip toggle `Ativas` (padrão, esconde arquivadas/concluídas antigas) · `Todas` (inclui concluídas de qualquer data).
- **Período**: `Select` com opções — `Todas as datas` (padrão), `Últimos 7 dias`, `Últimos 30 dias`, `Este mês`, `Mês passado`. Filtra por `delivery_date` (fallback `created_at` quando ausente).

Uma nota discreta abaixo do título: `Mostrando: ativas · todas as datas` — deixa explícito o recorte atual, resolvendo o "não está claro se está mostrando apenas os ativos".

### 5. Largura horizontal e scroll da tabela

Hoje o container é `max-w-6xl` (~1152px) mesmo em viewports de 1879px, causando o scroll horizontal da tabela por falta de espaço para colunas como Progresso/Próxima. Correções:

- Container passa a `max-w-[1600px]` (ou `container mx-auto` com padding maior) para aproveitar telas amplas.
- Remover `overflow-x-auto` do wrapper da tabela e usar `table-fixed` com larguras percentuais bem definidas por coluna.
- Ajustar breakpoints das colunas: Tipo/Responsável passam a aparecer em `md`, Progresso em `lg`, Próxima em `xl` já hoje — manter, mas garantir que em `≥1280px` tudo cabe sem scroll.
- Truncar título com `truncate` + `title` (já existe) sem `max-w` fixo — deixa flex do `table-fixed` cuidar.

### Fora do escopo

- Sem mudanças no `TaskCard`, edge functions, schema ou lógica de proceed/regress.
- Sem alteração no comportamento realtime.

### Arquivos afetados

- `src/pages/ClientEvolution.tsx` — todas as mudanças acima, isoladas nesta tela.
