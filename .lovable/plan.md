
## Tornar Período Obrigatório e Permitir Vinculação em Demandas Existentes

### Objetivo
1. Tornar o select de período **obrigatório** ao criar demandas manuais (não permitir criar sem período)
2. Reposicionar o select de período ao lado do cliente (lado direito, mesma linha)
3. Manter a funcionalidade no TaskCard para vincular demandas antigas sem período (já existe parcialmente)
4. Filtrar apenas períodos com status `em_andamento`

### Alterações

#### 1. CreateDemandModal.tsx - Período obrigatório e layout lado a lado

- Mover o select de Período para dentro da mesma linha do select de Cliente, usando `grid grid-cols-2`
- Remover o texto "(opcional)" do placeholder -- trocar para "Selecione o período *"
- Adicionar validação no `handleSubmit`: se não há `periodPlanId` (via props) nem `selectedPeriodPlanId`, bloquear com `toast.error("Selecione um período")`
- O select aparece assim que um cliente é selecionado (comportamento atual mantido)
- Filtro `em_andamento` já está implementado corretamente

#### 2. TaskCard.tsx - Manter seletor de período para demandas sem vínculo

- A funcionalidade já existe (linhas 369-409): quando `card.period_plan_id` é null, busca períodos ativos e mostra um seletor
- Confirmar que está visível e funcional no render do card (verificar se o seletor aparece no layout)

### Detalhes Técnicos

**CreateDemandModal.tsx:**
- Linhas 452-467 (select do cliente): transformar em `grid grid-cols-2 gap-4`, com cliente na esquerda e período na direita
- Linhas 564-581 (select do período atual separado): remover este bloco e integrar ao grid do cliente
- Linha 374-377 (validação do submit): adicionar check para `selectedPeriodPlanId` quando `periodPlanId` não é fornecido via props e há períodos disponíveis
- O select de período ficará desabilitado até um cliente ser selecionado

**Nenhuma alteração de banco de dados necessária** -- o campo `period_plan_id` na tabela `demands` já aceita null (para compatibilidade), e o filtro `em_andamento` já está no código.
