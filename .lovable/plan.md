# Correção: card entregue por engano ficou invisível na visão geral

## O que aconteceu (confirmado no banco)

Card: **Produção de vídeo piloto no Seedance 2.0 Fast para o Hospital LEAL** (LEAL, Mídia, tipo Vídeo gerado).

Histórico real:

```text
30/07 10:39  criado           → Planejar (Lúcia)
30/07 12:01  transferido      → Editar vídeo (Letícia)
03/08 10:33  voltou           → Criar roteiro (Eric)
03/08 10:33  transferido      → Criar arte (Letícia)
03/08 10:34  voltou           → Criar roteiro (Letícia)
03/08 17:49  salto de etapa   → Revisar publicação (Lúcia)
03/08 17:49  entregue         → arquivado + status "Feito"
05/08 10:04  transferido      → Letícia
05/08 10:05  prosseguiu       → Planejar → Gerar vídeo → Editar vídeo (Letícia)
```

Dois problemas distintos:

1. **O salto de "Criar roteiro" para "Revisar publicação"** não veio do avanço normal do fluxo (que iria para Revisar roteiro). Veio do seletor manual de etapas do card, que hoje permite pular qualquer quantidade de etapas de uma vez, sem aviso, e registra no histórico como se fosse um avanço comum. Logo depois o botão Entregar foi usado, arquivando o card.

2. **O card não volta a aparecer na visão geral.** Ao entregar, o card recebe marca de arquivado e o status final "Feito". Nas ações posteriores de hoje (transferir responsável e prosseguir etapa) o sistema atualizou responsável e etapa, mas **não removeu a marca de arquivado nem tirou o status "Feito"**. A visão geral só carrega cards não arquivados — por isso ele ficou preso em Demandas Completas mesmo estando em "Editar vídeo" com a Letícia.

## Correção

### 1. Recuperar este card agora

Remover a marca de arquivado e devolver o card à coluna operacional correspondente ao responsável atual (Letícia, etapa Editar vídeo), preservando datas, anexos e histórico.

### 2. Reentrar no fluxo desarquiva automaticamente

Qualquer ação que devolva o card ao fluxo passa a limpar a marca de arquivado e a sair do status final:

- prosseguir etapa
- voltar demanda
- salto manual de etapa
- transferência de responsável

Assim é impossível um card ter responsável e etapa ativos e continuar invisível na visão geral.

### 3. Consertar o desarquivar manual

Hoje o botão de desarquivar remove apenas a marca de arquivado e deixa o status "Feito", o que mantém o card fora das contagens e sujeito a voltar a se comportar como concluído. Passará a devolver também o status para a coluna operacional do responsável.

### 4. Proteger o salto manual de etapas

- Quando o salto pular mais de uma etapa obrigatória, pedir confirmação listando exatamente quais etapas serão ignoradas.
- Registrar esse evento no histórico como salto de etapa (com as etapas ignoradas), e não como avanço normal — para que o Registro de Cards mostre o que realmente aconteceu.

### 5. Varredura de casos iguais

Localizar outros cards que estejam arquivados mas com responsável e etapa ativos (mesma inconsistência) e devolvê-los à visão geral, informando quantos foram recuperados.

## Detalhes técnicos

- Dados: atualizar `demands.archived_at` e `status_id` deste card e dos demais casos inconsistentes.
- `src/lib/proceedDemand.ts`: nas escritas de `proceedDemand`, `regressDemand` e `jumpToFunction`, incluir `archived_at: null` e a saída do status final quando o card estiver arquivado; manter `deliverDemand` como é.
- `src/lib/reassignDemand.ts`: mesma limpeza em `applyReassign`.
- `src/pages/KanbanCentralPage.tsx`: no callback de desarquivar, resolver o status da coluna do responsável em vez de manter "Feito".
- `src/components/TaskCard.tsx`: confirmação no seletor de etapas quando houver etapas puladas.

Sem mudanças de schema.
