## Problema

1. **Logo distorcida nos posts gerados** (estático e carrossel): o modelo está recriando/redesenhando a logo em vez de reproduzi-la fielmente. As regras atuais em `renderLogoBlock` ("NÃO distorça…") são fracas e ficam soltas no meio do prompt.

2. **Logo aparece em slides do meio do carrossel**: o `carousel-image-runner.ts` envia `logoInline` (imagem da logo como referência inline) para **todos** os slides, incluindo os do miolo. Mesmo o prompt textual dizendo "logo só na capa e no final", o modelo recebe a imagem da logo em todas as chamadas e a renderiza assim mesmo. As `renderLogoBlock` também é incluída em todos os slides — apenas com flag `highlight` para capa/final, mas sempre instruindo a desenhar a logo.

## Mudanças

### 1. `supabase/functions/_shared/carousel-image-runner.ts`
- Calcular por slide: `isHighlightSlide = slideNumber === 1 || slideNumber === totalSlides`.
- Só passar `logoInline` para `generateImageWithModel` quando `isHighlightSlide` for `true`. Nos slides do meio, passar `logoInline: null`, removendo a referência visual da logo das `parts` enviadas ao Gemini/GPT-image.

### 2. `supabase/functions/_shared/image-prompts.ts` — `buildCarouselSlidePrompt`
- Para slides do meio (não capa, não final): substituir o `renderLogoBlock(...)` por um bloco explícito de proibição: "PROIBIDO ABSOLUTO renderizar logo, logotipo, marca d'água, nome ou monograma da marca neste slide. A logo aparece apenas na capa (slide 1) e no slide final."
- Manter `renderLogoBlock(vi, { highlight: true })` apenas para slide 1 e slide final.
- Acrescentar nas REGRAS finais a mesma proibição quando o slide for do meio.

### 3. `supabase/functions/_shared/visual-identity.ts` — `renderLogoBlock`
Reforçar regras de fidelidade da logo (aplica-se a estático e aos slides com logo):
- Subir o tom: "REPLIQUE A LOGO PIXEL A PIXEL como na imagem de referência. Tratar a logo como ASSET FIXO — copiar e colar, NÃO redesenhar."
- Listar proibições explícitas: não traduzir/recriar texto da logo, não trocar fontes, não redesenhar o ícone/símbolo, não trocar cores, não adicionar tagline diferente, não alterar layout horizontal/vertical, não inventar variações.
- Adicionar: "Se a logo já contém o nome da marca, NÃO renderize o nome novamente em outro lugar do design."

### 4. (Sem mudanças no client)
Esta correção é 100% backend (edge functions). Após a edição, fazer redeploy de:
- `auto-generate-carousel`
- `generate-carousel-images`
- `generate-standalone-post`
- `generate-post-image`
- `auto-generate-post`

## Resultado esperado

- Carrosseis: slides 2…N-1 não recebem mais a imagem da logo nem instruções para desenhá-la → não aparecerá logo no miolo.
- Capa e slide final continuam com logo proeminente.
- Logo nos posts estáticos e nos slides com logo será reproduzida com muito mais fidelidade graças às regras endurecidas.
