## Objetivo
Corrigir o mecanismo de reavaliação para que o modal de diff apareça quando houver aprendizado real, sem forçar atualização em todos os casos e sem cair em sucesso silencioso quando a resposta da IA vier insuficiente.

## O que vou ajustar

### 1. Endurecer a validação da resposta da edge function
Arquivo: `supabase/functions/reevaluate-card/index.ts`

- Validar explicitamente o shape de retorno da IA:
  - `updatedCard` precisa existir
  - `requirementsProposal` pode existir ou não, mas quando existir deve ter `proposed` e `additions` coerentes
- Adicionar logs úteis para diagnóstico:
  - motivo recebido
  - `currentRequirements`
  - resposta bruta da IA
  - resposta final enviada ao frontend
- Diferenciar três cenários na resposta:
  1. houve aprendizado e existe proposta real
  2. não houve aprendizado generalizável
  3. a IA respondeu de forma insuficiente/ambígua
- Em vez de “inventar” adições automaticamente, retornar um sinal explícito quando a IA vier ambígua, para o frontend decidir como tratar.

### 2. Ajustar a lógica de decisão no frontend
Arquivo: `src/pages/RejectedCards.tsx`

- Parar de depender apenas de `proposal.proposed !== proposal.current`
- Passar a tratar estados explícitos vindos da edge, por exemplo:
  - `hasMeaningfulProposal`
  - `noGeneralizableLearning`
  - `ambiguousProposal`
- Comportamento esperado:
  - se houver proposta real: abre o modal de diff
  - se não houver aprendizado generalizável: salva a reavaliação sem abrir modal
  - se a resposta vier ambígua/inconsistente: não cair em sucesso silencioso; mostrar aviso apropriado e registrar log
- Adicionar logs client-side da resposta recebida para facilitar auditoria futura.

### 3. Remover o risco de desalinhamento por período salvo
Arquivo: `src/pages/RejectedCards.tsx`

- Revisar a priorização de `localStorage.getItem('approve_cards_period_<clientId>')`
- Garantir que `/rejected-cards` use o período correto com cards rejeitados, sem ficar preso a um período antigo salvo localmente quando isso gerar inconsistência entre o que aparece na tela e o que está sendo persistido
- Manter o comportamento apenas se ele ainda fizer sentido após validar a lista de períodos rejeitados

## Resultado esperado
- O sistema não força diff em todos os casos
- Casos sem aprendizado real continuam fechando direto, como você quer
- Casos com aprendizado forte passam a abrir o modal de forma confiável
- Respostas ambíguas da IA deixam de virar “sucesso silencioso”
- O fluxo fica auditável pelos logs

## Detalhes técnicos
```text
Frontend hoje:
modal abre só se proposed != current

Problema:
IA pode retornar shape incompleto ou proposta insuficiente
=> frontend interpreta como “sem adição”
=> toast de sucesso direto

Nova regra:
edge classifica a qualidade da proposta
frontend decide com base nessa classificação, não só em diff textual
```

## Validação
Depois da implementação, vou validar com:
- um motivo forte que deva gerar novo aprendizado
- um motivo pontual que não deva alterar exigências
- conferência de que `tenant_companies.content_requirements` só muda quando o usuário aplicar a proposta