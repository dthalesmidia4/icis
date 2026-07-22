## Como o fluxo funciona hoje (respondendo suas dúvidas)

- **Aprovar e enviar ao Kanban** → materializa o card como uma demand real no Kanban da Visão Geral (mesma lógica do "Aprovar" da tela de avaliação). Usado quando você olha o card reprovado e conclui "na verdade tá bom, quero produzir".
- **Resgatar para avaliação** → devolve o card para o plano do período (`default_plan`/`ultra_plan`), então ele volta a aparecer na fila **Avaliar** do responsável, como se nunca tivesse sido reprovado. Nenhuma regeração acontece.
- **Reavaliar com IA** → hoje **só existe dentro do modal de Avaliação** (novo fluxo). Cards que já estão em Reprovados (legado ou descartados manualmente) não têm esse botão aqui, e é isso que está te incomodando.

Você tem razão: se o card já foi descartado, o caminho natural na tela de Reprovados é poder **regerar direto** (com o motivo já registrado, ou pedindo um motivo se não houver), sem ter que resgatar primeiro só pra depois abrir a avaliação e reavaliar.

## O que quero mudar

### 1. Adicionar "Reavaliar com IA" na tela de Reprovados
Terceiro botão em cada card, ao lado de Resgatar e Aprovar:

- Se o card **já tem `_rejectReason`** (foi descartado pelo novo fluxo): reavalia direto usando esse motivo — chama `reevaluate-card`, aplica o diff de exigências (mesmo modal `ContentRequirementsDiffModal` do fluxo de avaliação) e **devolve o card revisado para o plano ativo**, removendo-o de Reprovados. Ele reaparece como card para Avaliar.
- Se o card **não tem motivo** (legado, sem `_rejectReason`): abre um mini-prompt pedindo o motivo antes de reavaliar. Mesmo destino: volta ao plano ativo, aprendizado registrado.

### 2. Reordenar/rotular os botões pra deixar o mental model claro
Ordem sugerida da esquerda pra direita:

1. **Reavaliar com IA** (primário) — "quero uma nova versão"
2. **Resgatar para avaliação** (outline) — "quero avaliar de novo do jeito que está"
3. **Aprovar e enviar ao Kanban** (outline) — "quero produzir esse card exato"
4. **Abrir Avaliação** (ghost, à direita) — atalho já existente

### 3. Nada muda no backend / esquemas
Só uso das funções já existentes: `restoreRejectedCard`, `approvePlanCard`-equivalente inline (já implementado na página) e edge function `reevaluate-card` + `replacePlanCard`-em-cima-de-restored. Detalhe técnico do fluxo Reavaliar-da-tela-Reprovados:

```text
click Reavaliar
  → (se falta motivo) prompt("Motivo?")
  → invoke reevaluate-card { card, reason, clientId, tenantId }
  → abre ContentRequirementsDiffModal (mesmo do modal de avaliação)
  → onConfirm: salva content_requirements + move card de rejected_plan
    para default_plan/ultra_plan com o corpo reescrito (updatedCard)
    e metadata _reevaluatedAt
  → toast "Card reavaliado e devolvido para avaliação"
```

## Arquivos afetados

- `src/pages/RejectedCards.tsx` — adiciona botão + handler `handleReevaluateCard`, importa `ContentRequirementsDiffModal` e reaproveita o padrão do `EvaluatePlanCardModal`.

Só isso. Nada de nova tabela, nada de mudança em `evaluatePlanCard.ts` (as helpers já existem).
