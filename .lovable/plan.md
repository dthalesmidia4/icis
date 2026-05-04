## Diagnóstico

Verifiquei o último período no banco e os logs da edge function:

- O `production_line` salvo era **4 Post Estático / 2 Vídeos Curtos / 4 Carrossel** (total 10), exatamente como você escolheu.
- Mas no `default_plan` ficaram salvas apenas **2 demandas (Vídeos Curtos)**.
- Nos logs da `generate-period-plans` só aparece **uma chamada bem-sucedida** (lote "Vídeos Curtos", 2 demandas). Os lotes "Post Estático" e "Carrossel" não chegaram a completar — provavelmente um deles deu timeout ou retornou vazio do `gpt-5-mini`, o `for` em `handleCreatePeriod` lançou erro e parou o restante.
- Como o EARLY SAVE acontece por lote, os 2 vídeos ficaram persistidos. Ao voltar à tela, o "Resume Incomplete" detectou o período inacabado e te jogou direto na tela **"Demandas Geradas! / Gerar Planos Ultra"** (`currentStep = 'choose-ultra'`) — por isso ela apareceu agora pela primeira vez. Antes, quando todos os lotes terminavam, o fluxo já gerava o Ultra automaticamente e ia direto para "Aprovar Produção".

Ou seja, são **dois problemas combinados**: lote fragilizado quebrando antes do fim + UI de retomada que para no meio do caminho.

## O que vou ajustar

### 1) Edge `generate-period-plans` — robustez por lote
- Adicionar **retry interno** (até 2 tentativas) quando o `gpt-5-mini` devolver `content` vazio (`finish_reason=length` ou similar) ou quando a chamada abortar por timeout. Na 2ª tentativa, reduzir ainda mais o contexto e subir `max_completion_tokens` para o lote.
- Ao falhar definitivamente um lote, **retornar 200 com `success:false` + `partial:true`** (sem 5xx) para o frontend continuar com os próximos lotes em vez de abortar tudo.
- Garantir que o `tipo` retornado seja normalizado para o `batchType` solicitado (alguns retornos vêm com variações de acento/caixa, que somem da contagem).

### 2) Frontend `PlanPeriod.tsx` — não abortar a sequência
- No `for` de batches, trocar `throw` por **acumular falhas**: se um lote falha, segue para o próximo e guarda o tipo+quantidade que faltou.
- Ao final, se faltar algum lote, fazer **uma rodada de retry automática** só dos lotes que faltaram (mesma chamada com `batchType`/`batchQuantity`).
- Se ainda assim sobrar gap (ex.: 2 carrosséis faltando), exibir um `toast.warning` claro ("Geramos 8 de 10 demandas, faltou X — clique em Refazer faltantes") e um botão **"Gerar faltantes"** dentro de "Aprovar Produção" (chama a mesma edge só para o que falta).

### 3) Voltar ao fluxo 100% automático (remover a tela "Gerar Planos Ultra")
- A tela `choose-ultra` deixa de ser uma decisão do usuário no caminho feliz. Após todos os lotes default terminarem, o frontend já dispara o Ultra automaticamente e navega para `/approve-cards` (esse caminho já existe — vou só garantir que ele rode mesmo com falhas parciais).
- No **"Resume Incomplete"** (caso o usuário recarregue no meio), em vez de cair em `choose-ultra`, vou:
  - Detectar o que falta (lotes default não atingiram a meta? ultra não existe?).
  - Disparar automaticamente as chamadas restantes (default faltando → ultra) e seguir para `/approve-cards`.
  - O passo `choose-ultra` será removido do fluxo (e do tipo `Step`).

### 4) Limpeza do período atual ("campanha teste maio 1")
- Apenas como ação de uma vez: oferecer um botão "Gerar demandas faltantes" nesse período já existente para completar os 4 Post Estático e 4 Carrossel que ficaram faltando, sem precisar refazer o planejamento do zero.

## Arquivos a editar

- `supabase/functions/generate-period-plans/index.ts` — retry interno, normalização de `tipo`, resposta `partial`.
- `src/pages/PlanPeriod.tsx` — loop tolerante a falha + retry de lotes faltantes, remoção do passo `choose-ultra`, `handleResumeIncomplete` automático.
- `src/pages/ApproveCards.tsx` — botão "Gerar faltantes" quando `default_plan.length < soma(production_line)`.

## Resultado esperado

- Você escolhe 10 (ou qualquer número) no "Planejar Período" → o sistema gera os 10 (com retry transparente nos lotes que falharem).
- A tela "Demandas Geradas! / Gerar Planos Ultra" some — volta a ir direto para "Aprovar Produção" com normais + ultra prontos.
- Se acontecer uma falha catastrófica, você tem um botão claro para completar o que faltou em vez de perder o trabalho.
