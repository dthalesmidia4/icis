## Diagnóstico confirmado pelos logs

Logs de `generate-carousel-images`:
- Batch de 4 slides: boot às `…082842`, único `✅ Slide 1 generated` às `…193162` (~105s após o boot), `shutdown` às `…237182`. Os slides 2/3/4 nunca terminam — a função é encerrada por **wall-time** antes de logar.
- Batch de 1 slide (slide 5, batchOffset=4): boot às `…238534`, `✅ Slide 5 generated` em ~36s. Sucesso.

Causa raiz: o loop sequencial dentro de cada batch chama `gemini-3-pro-image-preview` ~30–60s por slide. Quatro slides em série excedem o limite da Edge Function. Resultado: o cliente recebe erro do batch 1 (acumulado vazio) e somente a imagem do batch 2 (slide 5) aparece — exatamente o sintoma do print.

A causa **não é o prompt** das regras anti-colagem — essas continuam válidas. A regressão é arquitetural (sequencial + modelo Pro lento, herdada da unificação que removeu a paralelização anterior).

## Princípios da correção (sem duplicar verdades)

- **Modelo:** continua único em `MODELS.IMAGE` (`gemini-3-pro-image-preview`). Não criamos `IMAGE_FAST` porque hoje o seletor da UI só expõe "Nanobanana 3" e a paridade avulso↔período exige um único modelo de imagem. Se no futuro quisermos opção rápida, ela vira **mais um valor** em `MODELS`, lido pelo helper compartilhado — não duplicado por função.
- **Prompt:** continua centralizado em `_shared/image-prompts.ts` (`buildCarouselSlidePrompt`). Nenhuma alteração.
- **Loop de geração de slide (fetch Gemini → parse → upload Storage):** vira um **único helper compartilhado** em `_shared/`, consumido por `generate-carousel-images` (avulso) e `auto-generate-carousel` (período). Hoje essa lógica está duplicada nos dois arquivos — é a verdadeira raiz da divergência.

## Mudanças

### 1. `supabase/functions/_shared/carousel-image-runner.ts` (novo)

Exporta `generateCarouselSlideImages(opts)` que recebe:
- `supabase`, `googleApiKey`, `vi`, `basePrompt`, `strategySnippet`
- `slides` (do batch), `allSlides`, `batchOffset`, `aspectLabel`
- `mascotInline[]`, `logoInline | null`
- `storagePathBuilder(slideNumber) => string` (avulso usa `carousel-posts/<clientId>/uuid`; período usa `auto-generated/<clientId>/<demandId>/carousel-slide-N-uuid`)
- `onSlideDone?(result)` opcional para período persistir incremental

Comportamento:
- `slideContextLine` montado a partir de `allSlides` (inclui contexto completo mesmo em batches).
- Executa as N chamadas do batch em **`Promise.allSettled`** (geração + upload juntos).
- Cada item resolve em `{ slideIndex, slideNumber, ok, imageUrl?, attachment?, error?, status? }`.
- `429` é capturado por slide; não aborta os demais. Retorna agregação `{ images, failures, anyRateLimited }`.

### 2. `supabase/functions/generate-carousel-images/index.ts`

- Remove o `for` sequencial; chama `generateCarouselSlideImages(...)`.
- Mantém contrato HTTP atual: `{ success, images: [{slideIndex, imageUrl}], totalGenerated, totalRequested }`.
- Se `anyRateLimited` e nenhuma imagem, retorna `429` com `partialImages: []` (compatível com o tratamento atual no `ClientHub`).
- Se houve parciais, retorna `200` com o que conseguiu (cliente já mescla `partialImages`).

### 3. `supabase/functions/auto-generate-carousel/index.ts`

- Substitui o `for (i…)` da Step 2 pela chamada ao mesmo `generateCarouselSlideImages`, passando o `storagePathBuilder` específico do período e um `onSlideDone` que faz o `update` incremental do array de attachments na demand (preservando o comportamento atual de salvar à medida que sai). Sem mudança de modelo.

### 4. `src/pages/ClientHub.tsx`

- Reduz `BATCH_SIZE` de 4 para **2** no fluxo "Gerar Carrossel com IA" (linha ~320). Com paralelização real, 2 chamadas Pro simultâneas cabem confortavelmente (~40–60s) e mantêm margem para upload + cold start. Carrosséis de 5 slides geram em 3 batches (2+2+1).
- Fluxo manual (linha ~921) passa a também enviar **em batches de 2** usando o mesmo loop do fluxo IA, em vez de uma única chamada com todos os slides. Elimina a outra rota onde 4+ slides estouram o timeout.
- Sem mudanças visuais nem nos seletores. `aiModel` continua sendo enviado e segue ignorado pelo backend (mantém compatibilidade; remoção fica para quando o seletor for repensado).

### 5. Memórias

- Atualizar `mem://features/automation/carousel-generation-resilience` para refletir: batches de 2 + execução paralela via helper compartilhado.
- Atualizar `mem://architecture/edge-functions/shared-helpers` adicionando `_shared/carousel-image-runner.ts` à lista.

## Fora de escopo

- Não alteramos prompts (`CAROUSEL_SINGLE_SLIDE_RULE`, `CAROUSEL_FINAL_SLIDE_RULE` permanecem).
- Não alteramos schema, RLS, nem tabelas.
- Não criamos `MODELS.IMAGE_FAST` agora — evitaria duplicar fonte de verdade enquanto a UI não tem caso de uso real.
- Não trocamos o seletor "Nanobanana 3 / GPT" da UI; refatorar essa escolha vira tarefa separada.

## Verificação

1. Carrossel avulso com IA, 5 slides, "Nanobanana 3 (Alta Qualidade)": logs devem mostrar 3 batches, cada um <90s, com 5 `✅ Slide N generated`. UI mostra 5 imagens distintas, sem colagem.
2. Carrossel manual de 5 slides: idem.
3. `auto-generate-carousel` (período): demand recebe 5 attachments incrementais; tempo total ≈ tempo do batch mais lento × 3, sem timeouts parciais.
4. Conferir nos logs ausência de `shutdown` antes do último `✅ Slide N`.
