## Objetivo

Transformar a tela **Evolução das Demandas** (`/client-evolution`) numa visualização tipo planilha, densa e escaneável, eliminando repetições (nome da empresa, rótulos redundantes) e priorizando informação por linha.

## Problema atual

Cada demanda é um card grande com:
- Nome da empresa repetido em toda linha (já está no header da página)
- Micro-stepper horizontal ocupa muita altura
- Metadados (etapa atual, próxima, tempo, responsável) em blocos separados
- Densidade baixa: ~4-6 demandas por tela

## Nova visualização: tabela densa

Uma tabela sticky-header, uma linha por demanda, colunas alinhadas verticalmente para leitura rápida.

### Colunas (esq → dir)

```text
Título              Tipo   Responsável   Etapa atual · há    Progresso           Prev. próxima   Prazo
-----------------------------------------------------------------------------------------------------
Como ler seu...     Vídeo  Lúcia         Criar arte · 2h     ●●●○○○○ 3/7         Revisar hoje    28/07
Atendimento 24h...  Post   Letícia       Planejar · 1d       ●●○○○○○ 2/7         Criar arte 29/07 30/07
```

- **Título**: truncado com tooltip; sem prefixo da empresa (já removido via `stripBrandPrefix`)
- **Tipo**: chip compacto (Post / Carrossel / Vídeo / Story)
- **Responsável**: só primeiro nome + avatar dot da cor da área (mídia/sistemas)
- **Etapa atual · há**: nome da etapa + tempo relativo inline ("Criar arte · 2h")
- **Progresso**: mini-stepper de bolinhas (uma por etapa do fluxo), preenchidas até a atual; hover mostra nome de cada etapa
- **Prev. próxima**: nome da próxima etapa + data prevista quando calculável
- **Prazo**: `due_date` com cor (vermelho se atrasado, âmbar se hoje/amanhã, neutro caso contrário)
- Linha inteira clicável → abre `TaskCard`

### Agrupamento e ordenação

- **Agrupar por etapa** (padrão) com header sticky por grupo mostrando contagem — clicar no bloco do pipeline no topo filtra o grupo, como já faz hoje
- Alternativa via toggle: **Agrupar por responsável** ou **Sem agrupamento** (ordena por prazo)
- Concluídas colapsadas por padrão num grupo "Concluídas (N)" no fim

### Resumo e pipeline (topo)

Manter, mas mais compactos:
- Cards de resumo em uma faixa fina única (Total · Em andamento · Concluídas · Fila · Atrasadas + barra de progresso global inline)
- Barra do pipeline por etapa continua clicável para filtrar; ativa o grupo correspondente na tabela

### Filtros/controles no header da tabela

- Busca por título (input pequeno)
- Filtro por responsável (multi)
- Filtro por tipo
- Toggle "Ocultar concluídas"
- Toggle de agrupamento (Etapa / Responsável / Nenhum)

### Densidade e responsividade

- Altura de linha ~40px, fonte `text-sm`, zebra sutil
- Em telas <lg: colapsa colunas menos críticas (Prev. próxima, Progresso vira só "3/7") mantendo Título, Etapa, Prazo

## Arquivos afetados

- `src/pages/ClientEvolution.tsx` — substituir grid de cards por `<table>` com as colunas acima; manter data fetching, realtime, resumo e pipeline
- Reutilizar utilitários existentes: `resolveStageLabel`, `stripBrandPrefix`, `flowFunctionNames`, cálculo de tempo relativo, cores de área

## Fora do escopo

- Nenhuma mudança em schema, edge functions ou lógica de negócio
- Sem alterações no `TaskCard` (continua abrindo por clique na linha)
- Sem mudanças no Client Hub ou rotas
