

# Controle Explicito de Visibilidade com archived_at

## Por que este plano e valido

O problema atual: a visibilidade das demandas depende do `operational_status` do periodo vinculado. Demandas sem periodo (`period_plan_id = NULL`) nunca sao arquivadas, independente de quao antigas sejam. A coluna `archived_at` resolve isso ao dar controle explicito e independente de periodo.

## Etapas

### 1. Migracao de banco de dados

Adicionar coluna `archived_at` na tabela `demands`:

```text
ALTER TABLE demands ADD COLUMN archived_at TIMESTAMPTZ NULL;
CREATE INDEX idx_demands_tenant_archived ON demands (tenant_id, archived_at);
```

### 2. Backfill do legado

Arquivar demandas antigas que nao fazem sentido no Kanban ativo. Criterios:
- Demandas sem periodo (`period_plan_id IS NULL`) criadas ha mais de 90 dias
- Demandas vinculadas a periodos ja concluidos (`operational_status = 'concluido'`)

```text
-- Arquivar demandas de periodos concluidos
UPDATE demands SET archived_at = NOW()
WHERE period_plan_id IN (
  SELECT id FROM period_plans WHERE operational_status = 'concluido'
) AND archived_at IS NULL;

-- Arquivar demandas soltas antigas (mais de 90 dias)
UPDATE demands SET archived_at = NOW()
WHERE period_plan_id IS NULL
  AND created_at < NOW() - INTERVAL '90 days'
  AND archived_at IS NULL;
```

A data de corte (90 dias) pode ser ajustada. Este script sera executado uma unica vez.

### 3. Refatorar fetchAllCards no KanbanCentralPage

**Antes**: A query busca TODAS as demandas e separa ativo/arquivado no frontend baseado em `operational_status` do periodo.

**Depois**: Duas queries separadas:
- Kanban ativo: `WHERE tenant_id = ? AND archived_at IS NULL`
- Aba arquivados: `WHERE tenant_id = ? AND archived_at IS NOT NULL`

Remover o join com `period_plans` como criterio de visibilidade. Manter apenas como informacao exibida no card.

### 4. Refatorar Scheduled.tsx

Mesma logica: filtrar por `archived_at IS NULL` em vez de depender do status do periodo.

### 5. Arquivamento automatico ao concluir periodo

No `PlanPeriod.tsx`, quando o status do periodo muda para `concluido`, executar:

```text
UPDATE demands SET archived_at = NOW()
WHERE period_plan_id = :periodId AND archived_at IS NULL;
```

### 6. Acoes manuais de arquivar/desarquivar

No TaskCard:
- Demanda ativa: botao "Arquivar" que seta `archived_at = NOW()`
- Demanda arquivada: botao "Desarquivar" que seta `archived_at = NULL`

### 7. Atualizar tipos TypeScript

Adicionar `archived_at` a interface `CentralKanbanCard` e ao mapeamento de dados.

## Arquivos afetados

| Arquivo | Alteracao |
|---------|-----------|
| Migracao SQL | Adicionar coluna + indice |
| KanbanCentralPage.tsx | Refatorar queries e logica de separacao ativo/arquivado |
| Scheduled.tsx | Filtrar por archived_at |
| TaskCard.tsx | Botoes arquivar/desarquivar |
| PlanPeriod.tsx | Arquivar demandas ao concluir periodo |

## Resultado

- Kanban mostra apenas demandas com `archived_at IS NULL`
- Demandas antigas desaparecem automaticamente apos o backfill
- Periodo vira atributo organizacional, nao regra de visibilidade
- Controle explicito via `archived_at` em vez de heuristica por data

