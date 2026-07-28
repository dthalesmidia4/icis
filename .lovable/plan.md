
# Simplificar tela "Evolução das Demandas"

Foco: corrigir bugs de filtro, remover o painel confuso acima da tabela, transformar "área" em coluna, e voltar com a barra de progresso ocupando a linha inteira.

## 1. Corrigir bug de período ("Este mês" > "Últimos 30 dias")

Causa: hoje o filtro de período usa `delivery_date` com fallback para `created_at`. "Este mês" inclui prazos futuros até o fim do mês, enquanto "Últimos 30 dias" corta hoje — o que faz parecer inconsistente.

Ajustes em `periodRange`:
- Sempre usar a mesma referência: `delivery_date` quando existir, senão `created_at` (mantém), **mas** limitar todos os períodos ao intervalo passado + hoje (não incluir datas futuras em "últimos 7/30 dias").
- "Este mês" e "Mês passado" continuam mês-calendário completo (comportamento correto).
- Deixar mais claro no label: "Últimos 30 dias" → mantém; adicionar tooltip curto no seletor explicando que "Este mês" cobre o mês inteiro (inclui prazos futuros).

## 2. Corrigir "Ativas" vs "Todas"

Hoje `fetchDemands` já ignora `archived_at`, então "Todas" não muda quando não há concluídas visíveis. Ajustes:
- Quando `scope === "all"`, remover o `.is("archived_at", null)` do fetch para incluir demandas arquivadas.
- Reexecutar `fetchDemands` quando `scope` mudar.
- Labels: "Ativas" (não concluídas e não arquivadas) · "Todas" (inclui concluídas + arquivadas).

## 3. Área como coluna (remover filtro)

- Remover o bloco "ÁREA · Todas / Mídia / Sistemas" acima da tabela.
- Remover `areaFilter` e sua lógica em `scopedCards`.
- Adicionar coluna **"Área"** na tabela (após "Responsável"), exibindo badge discreto:
  - Mídia → badge azul suave (bg-primary/10, text-primary).
  - Sistemas → badge slate (bg-slate-500/10, text-slate-700).
  - Sem área → "—".
- Manter a barrinha colorida vertical de 3px no início da linha (já existe) como reforço visual.

## 4. Remover o painel confuso e voltar com progresso full-width

Estado atual: bloco `rounded-lg border bg-card` mistura contadores (Total / Em andamento / Concluídas / Fila / Atrasadas), barra de progresso pequena e pipeline por etapa clicável.

Novo layout, mais leve:
- **Linha 1 (acima da tabela)**: barra de progresso ocupando 100% da largura, com rótulo à direita "5/10 · 50%".
- **Linha 2**: chips de filtro compactos em uma linha só — Total, Em andamento, Concluídas, Fila, Atrasadas. Sem card externo, sem borda. Apenas chips clicáveis (mantém o filtro atual por status).
- **Remover** o pipeline horizontal de etapas (barra grande com Planejar → Criar roteiro → ...). As mesmas informações já estão na coluna "Progresso" (bolinhas) e "Etapa" de cada linha. Se quiser filtrar por etapa, deixamos apenas via clicar em uma linha na coluna Etapa (opcional — por padrão, cortar).
- Remover a linha "Mostrando: todas · este mês" (redundante — já visível nos toggles do header).

## 5. Ajustes finos na tabela

- Ordem final de colunas: Título · Tipo · Responsável · **Área** · Etapa · Progresso · Próxima · Prazo.
- Larguras via `colgroup` recalculadas para a nova coluna Área (~7%).
- Manter zebra, hover, cor destacada para atrasadas.

## Detalhes técnicos

- Arquivo único: `src/pages/ClientEvolution.tsx`.
- Remover estado `areaFilter` e `selectedStage` (não usado mais sem o pipeline clicável).
- `fetchDemands` passa a depender de `scope` no `useCallback` deps.
- `TableRow` recebe nova prop `workArea` já disponível e ganha `<td>` extra para o badge de área. A barra vertical de 3px permanece.
- Sem mudanças em edge functions, migrações ou hooks.

## Fora de escopo

- Filtros de status (Total/Em andamento/etc.) continuam funcionando como hoje.
- Realtime e edição via TaskCard permanecem inalterados.
