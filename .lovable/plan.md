# Correção: card reaberto continua invisível na visão geral

## O que aconteceu (confirmado no banco)

Card **Agente de Vacinas** (área Sistemas):

```text
05/08 17:12  salto de etapa + entregue → arquivado, status "Feito"
06/08 14:13  transferido para Eric Zanata (dentro do card)
```

Estado atual: responsável Eric, etapa `corrigir_bug_n3`, mas `archived_at` continua preenchido e o status segue "Feito". A visão geral só carrega cards não arquivados — por isso o card não reaparece.

Causa: a troca de responsável feita pelo seletor dentro do card não passa pelo ponto único de transferência. Ela grava `assigned_to` (e a etapa) direto no banco, sem a reativação que já existe (limpar arquivamento e sair do status final). Os outros caminhos (prosseguir, voltar, salto de etapa, arrastar no Kanban) já fazem isso corretamente.

## Correção

### 1. Recuperar este card agora
Remover o arquivamento e devolver o card à coluna operacional do Eric, preservando datas, anexos e histórico.

### 2. Transferência dentro do card usa o mesmo caminho dos outros
O seletor de responsável do card passa a gravar pelo ponto único de transferência, que já aplica a reativação (desarquivar + sair de "Feito") e registra o histórico com a origem correta. Assim nenhum card fica com responsável e etapa ativos e, ao mesmo tempo, invisível.

### 3. Varredura de casos iguais
Localizar outros cards arquivados que voltaram a ter responsável e etapa ativos e devolvê-los à visão geral, informando quantos foram recuperados.

## Detalhes técnicos

- Dados: atualizar `demands.archived_at` e `status_id` do card `010af93c-…` e dos demais casos inconsistentes.
- `src/components/TaskCard.tsx` (~1908-1958): substituir a gravação manual (`onSave` + update de `current_function_key` + `recordFlowHistory`) por `applyReassign` de `src/lib/reassignDemand.ts`, mantendo a avaliação de conflito de agenda/função já existente.
- Nenhuma mudança de schema.
