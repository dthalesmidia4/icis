## Problema

O "Registro de entregas" de cada coluna está usando o campo errado do `demand_flow_history`.

Em `src/pages/KanbanCentralPage.tsx` (função `fetchColumnHistory`, ~linha 784) a query filtra:

```ts
.eq("to_user_id", columnId)
```

`to_user_id` é o colaborador que **recebeu** o card. Para listar o que um colaborador **entregou**, precisamos do `from_user_id` (quem estava com o card antes da transição).

### Sintomas reproduzidos
- **Eric entregou uma atividade e não aparece** → Eric é `from_user_id` no evento, não `to_user_id`.
- **Henrique aparece com "Agente de Vacinas" como entregue** → o card foi movido *para* Henrique (ele é `to_user_id`); ele ainda não avançou, então não deveria estar no registro de entregas dele.

## Correção

Ajustar apenas `fetchColumnHistory` em `src/pages/KanbanCentralPage.tsx`:

1. Trocar o filtro:
   ```ts
   .eq("from_user_id", columnId)
   ```
2. Restringir os `action` que contam como "entrega" para evitar contar retrocessos:
   ```ts
   .in("action", ["proceeded", "delivered"])
   ```
   (exclui `moved_back` — quando o card volta uma etapa, não é uma entrega; e `created`/`manual_assignment`, que não têm `from_user_id` significativo.)

Nenhuma outra mudança: a UI, o popover, o realtime e a coleta continuam iguais — só a semântica do filtro passa a refletir "o que este colaborador entregou".

## Validação após aplicar

- Ativar registro na coluna do Eric → o card entregue por ele aparece com a data correta.
- Ativar registro na coluna do Henrique → "Agente de Vacinas" não aparece (ele ainda não avançou); só entram cards que ele já avançou para outra etapa.
- Ativar "Hoje" vs "Últimos 7 dias" continua funcionando (o range de `created_at` não mudou).
