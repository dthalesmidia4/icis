## Objetivo
Descartar as 6 demandas ativas da Lúcia com data de publicação anterior a 31/05/2026 que sobraram do descarte anterior, para que sumam da coluna dela na Visão Geral.

## Cards afetados
| Data | Cliente | Título |
|---|---|---|
| 06/03/2026 | Leal – Núcleo Médico Veterinário | Leal – Centro integrado que protege seu pet |
| 16/03/2026 | Leal – Núcleo Médico Veterinário | Leal – Exames rápidos, decisões mais seguras |
| 07/04/2026 | Leme & Correa Advogados | Como comprovar trabalho sem registro para aposentadoria |
| 14/04/2026 | Leme & Correa Advogados | L&C – Atraso salarial: 4 sinais para agir |
| 19/04/2026 | Leal – Núcleo Médico Veterinário | Exames: 5 situações em que o exame ajuda |
| 11/05/2026 | Leal – Núcleo Médico Veterinário | Checklist pré-cirúrgico que o pai preocupado precisa conhecer |

## Ação
Executar um `UPDATE` em `public.demands` marcando os 6 IDs acima com `archived_at = now()` para retirá-los da Visão Geral, preservando o histórico (não deleta linhas). Isso reproduz o mesmo efeito de "Descartar" da UI, mas em lote, sem depender de mover para `rejected_plan` (o descarte anterior já processou o plano; o que sobrou aqui é apenas o card na tabela `demands`).

Motivo de arquivar em vez de deletar: manter rastreabilidade em `demand_flow_history` e permitir eventual resgate manual via banco caso a Lúcia queira revisar algo. Nenhum card com publicação em 20/06 ou datas posteriores é afetado.

## Detalhes técnicos
- Escopo: exatamente os 6 IDs listados (nada por range aberto, para evitar arrastar cards que não deveriam sair).
- Efeito de UI: `KanbanCentralPage.tsx` já filtra `archived_at IS NULL` na query padrão — os cards somem imediatamente após o realtime disparar.
- Sem alteração de código, sem migração de schema, apenas um data-change via ferramenta de insert/update.