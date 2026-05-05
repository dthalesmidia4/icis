## Diagnóstico definitivo

O campo `Conteúdo` no TaskCard lê `card.description`. O problema não está no TaskCard nem no BlockEditor — está no **mapeamento dos cards** carregados do banco no Kanban Central e na tela Scheduled.

Em 4 pontos do código, ao montar o objeto `card` a partir da linha de `demands`, o `description` foi escrito como:

```ts
description: demand.instructions || demand.description || null
```

Ou seja: se houver `instructions` (texto de produção tipo "Layout em lista com 3 ilustrações..."), ele **sobrescreve** o `description` real (que é o conteúdo do post: "- Troca de óleo conforme fabricante..."). Foi por isso que o Print 1 (Kanban Central) mostrou o texto de instruções no lugar do conteúdo, enquanto o Print 2 (Histórico de Cronogramas, que lê `description` puro) exibiu corretamente.

## Correção

Trocar nos 4 pontos para usar `demand.description` puro (e manter `instructions` separado em seu próprio campo, como já está):

1. **`src/pages/KanbanCentralPage.tsx`**
   - Linha 245 (handleDemandFullUpdate): `description: payload.description ?? card.description`
   - Linha 283 (handleDemandInsert): `description: data.description || null`
   - Linha 505 (fetchAllCards): `description: demand.description || null`

2. **`src/components/Scheduled.tsx`**
   - Linha 165: `description: demand.description || null`

Nenhuma migração de banco, nenhuma mudança no TaskCard, BlockEditor, edge functions ou ApproveCards. O `instructions` continua intacto e separado, alimentando a seção "Instruções de Produção" via `splitInstructionsCTA`.

## Por que essa solução é assertiva

- A linha de `demands` no banco já tem os campos corretos e separados (confirmado pelo Histórico que renderiza `description` direto).
- O bug era um fallback indevido (`instructions || description`) introduzido provavelmente para suportar dados legados, mas que prejudica todos os cards que têm os dois campos preenchidos.
- Cards antigos sem `description` simplesmente exibirão vazio na seção Conteúdo (comportamento correto), e suas instruções continuam visíveis na seção Instruções de Produção.