# Correção: não é possível escolher o tipo da demanda (área Sistemas)

## O que acontece hoje

Ao escolher um tipo no card (dropdown "Definir tipo"), o sistema primeiro tenta descobrir a etapa inicial daquele tipo. Essa consulta está sendo feita **sempre como se a demanda fosse da área Mídia**, ignorando a área (Sistemas) e a origem do card.

Como os tipos de Sistemas (Desenvolvimento, Melhoria, Suporte, Bug N1/N2/N3) só têm fluxo configurado na área Sistemas, a busca volta vazia, a função aborta e o tipo nunca é gravado — o dropdown continua em branco e o salvamento segue pedindo o tipo.

Confirmado no banco: existem regras de fluxo para os 6 tipos de Sistemas, apenas na área `sistemas`.

## Correção

1. Passar a área e a origem do card na resolução da etapa inicial ao definir o tipo, exatamente como já é feito no restante do card (o card já monta esse par de dados para outras consultas de fluxo).
2. Quando o tipo é válido mas o fluxo daquela área realmente não tem etapas configuradas, mostrar mensagem citando a área ("Nenhuma etapa configurada para este tipo na área Sistemas") em vez de falhar de forma genérica.
3. Ao trocar a área do card, se o tipo atual não existir na nova área, limpar o tipo e a etapa atual de forma consistente (hoje o tipo é limpo, mas a etapa pode ficar apontando para uma etapa da área antiga).
4. Em rascunho (criação pela visão geral), garantir que a seleção do tipo grave o tipo no estado local mesmo antes de existir a demanda no banco.

## Detalhes técnicos

- `src/components/TaskCard.tsx` → `handleSetDemandType`: passar `{ workArea, origin }` (mesmo objeto `seqOpts` já usado no efeito de sequência do pipeline) para `resolveInitialFunctionKey`; extrair `seqOpts` para um `useMemo` reaproveitado pelos dois pontos.
- Mensagem de erro contextual usando `AREA_LABEL`.
- Handler de troca de área: limpar também `current_function_key` quando o tipo é invalidado.
- Sem mudanças de banco de dados nem de edge functions.

## Verificação

- Criar demanda pela visão geral com área Sistemas → escolher "Desenvolvimento" → dropdown marca o tipo e a etapa inicial aparece; salvar funciona.
- Repetir com área Mídia (ex.: Carrossel) para confirmar que nada regrediu.
- Trocar a área de um card já salvo e confirmar que tipo/etapa ficam coerentes.
