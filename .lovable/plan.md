
# Plano de Correção: Salvamento de Status ao Mover Cards

## Diagnóstico do Problema

O sistema está com uma **inconsistência entre os valores de status usados no frontend e no banco de dados**:

| Componente | Valor |
|------------|-------|
| Banco (`pipeline_statuses.name`) | "Produção", "Revisão", etc. |
| Frontend (`STATUS_GROUPS.value`) | "em_producao", "revisao", etc. |

### Consequências

1. **Ao carregar demandas**: A função `getColumnFromStatus("Produção")` não encontra o valor e retorna "Planejamento" como fallback
2. **Ao mover cards**: A query `.eq("name", "em_producao")` não encontra resultado no banco (deveria ser "Produção")

---

## Solução

Modificar as funções de mapeamento para usar os **nomes de coluna** (que são iguais aos nomes do banco) ao invés dos valores internos do frontend.

### Alterações Necessárias

#### 1. Atualizar `handleDragEnd` em `Schedule.tsx`

Modificar a query para buscar o status pelo **nome da coluna** (que corresponde ao nome no banco), não pelo valor interno:

```text
ANTES:
const newStatus = getStatusFromColumn(newColumnName);
// newStatus = "em_producao"
.eq("name", newStatus) // Não encontra!

DEPOIS:
// Usar diretamente o nome da coluna como nome do status
.eq("name", newColumnName) // newColumnName = "Produção" - Encontra!
```

#### 2. Atualizar mapeamento ao carregar demandas em `Schedule.tsx`

O `status` da demanda deve ser o nome do status do banco, e a coluna é derivada diretamente:

```text
ANTES:
const statusName = demand.pipeline_statuses?.name || "Planejamento";
const columnName = getColumnFromStatus(statusName); // Falha!

DEPOIS:
const statusName = demand.pipeline_statuses?.name || "Planejamento";
// O nome da coluna É o nome do status no novo modelo
const columnName = statusName;
```

#### 3. Mesmas correções em `KanbanCentralPage.tsx` e `CentralKanban.tsx`

Aplicar as mesmas correções de mapeamento.

---

## Detalhes Técnicos

### Arquivo: `src/pages/Schedule.tsx`

**Linha ~165-177** - Mapeamento ao carregar demandas:
- Substituir `getColumnFromStatus(statusName)` por usar diretamente `statusName` como nome da coluna

**Linha ~298-315** - handleDragEnd para demandas:
- Alterar a query de `.eq("name", newStatus)` para `.eq("name", newColumnName)`
- Adicionar filtro pelo `pipeline_id` da demanda para maior segurança

### Arquivo: `src/pages/KanbanCentralPage.tsx`

**Linha ~293-307** - handleDragEnd:
- Aplicar mesma correção da query de busca de status

**Linha ~163-240** - fetchAllCards:
- Corrigir mapeamento de demandas para usar nome do status diretamente

### Arquivo: `src/components/CentralKanban.tsx`

**Linha ~213-255** - fetchScheduledCards:
- Corrigir mapeamento de demandas

**Linha ~289-350** - handleSave:
- Corrigir busca de status_id

---

## Resumo das Mudanças

| Arquivo | Função | Alteração |
|---------|--------|-----------|
| `Schedule.tsx` | Mapeamento de demandas | Usar nome do status diretamente como coluna |
| `Schedule.tsx` | `handleDragEnd` | Buscar status por nome da coluna |
| `KanbanCentralPage.tsx` | `handleDragEnd` | Buscar status por nome da coluna |
| `KanbanCentralPage.tsx` | `fetchAllCards` | Corrigir mapeamento |
| `CentralKanban.tsx` | `handleSave` | Buscar status por nome da coluna |
| `CentralKanban.tsx` | `fetchScheduledCards` | Corrigir mapeamento |

---

## Resultado Esperado

Após as correções:
- Cards e demandas serão corretamente posicionados na coluna correspondente ao seu status no banco
- Mover cards via drag-and-drop atualizará corretamente o `status_id` no banco
- O status será persistido e mantido após recarregar a página
