## Objetivo
1. Permitir escolher o modelo de IA no fluxo de **Post Estático Avulso** (igual ao carrossel).
2. Cadastrar dois novos modelos disponíveis nas duas seleções:
   - **Nanobanana 3.5** (Gemini 3.5 Pro Image — `gemini-3.5-pro-image-preview`)
   - **GPT Image 2** (OpenAI — `gpt-image-2`, endpoint `v1/images/generations`)
3. Wire de verdade o select do carrossel (hoje a opção "ChatGPT" cai no mesmo modelo Gemini — corrigir).

## Mudanças

### 1. `supabase/functions/_shared/models.ts`
Expandir `MODELS` com mapa de imagens:
```ts
IMAGE_MODELS: {
  nanobanana3:  { provider: "google", id: "gemini-3-pro-image-preview" },
  nanobanana35: { provider: "google", id: "gemini-3.5-pro-image-preview" },
  gpt2:         { provider: "openai", id: "gpt-image-2" },
}
```
Manter `IMAGE` como alias do default (`nanobanana3`) para compatibilidade. Adicionar `OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"`.

### 2. Novo helper `supabase/functions/_shared/image-generation.ts`
Função única `generateImageWithModel({ supabase, aiModel, prompt, mascotInline, logoInline, aspectLabel })` que:
- Resolve o `IMAGE_MODELS[aiModel]` (default `nanobanana3`).
- Se `provider === "google"`: chamada Gemini atual (com `responseModalities`, parts inline).
- Se `provider === "openai"`: chama `v1/images/generations` com body `{ model: "gpt-image-2", prompt, size, n: 1 }`. Como gpt-image-2 ainda não aceita imagens de referência via /generations, anexar instruções textuais resumidas sobre mascote/logo no prompt e ignorar `mascotInline/logoInline` quando provider for openai (registrar warning).
- Retorna `{ base64, mimeType, ext }` ou lança erro com `status` (para tratar 429).

### 3. `supabase/functions/generate-standalone-post/index.ts`
- Aceitar `aiModel` no body (validar contra chaves de `IMAGE_MODELS`; default `nanobanana3`).
- Carregar OPENAI key adicionalmente via `getOpenAiKey` quando `provider === "openai"`.
- Substituir o bloco do `fetch` direto pelo helper `generateImageWithModel`.

### 4. `supabase/functions/_shared/carousel-image-runner.ts`
- Aceitar `aiModel` em `RunCarouselSlidesOptions` e `openaiKey` opcional.
- Internamente chamar `generateImageWithModel` em vez do `fetch` direto pro Gemini, passando `aiModel`.

### 5. `supabase/functions/generate-carousel-images/index.ts`
- Já recebe `aiModel` no body — repassar ao runner. Carregar OpenAI key quando provider for openai.

### 6. `supabase/functions/auto-generate-carousel/index.ts`
- Buscar `aiModel` da request (se existir) ou default `nanobanana3`. Repassar ao runner.

### 7. Frontend `src/pages/ClientHub.tsx`
- Adicionar tipo `type ImageAiModel = 'nanobanana3' | 'nanobanana35' | 'gpt2'`.
- Novo state `staticAiModel: ImageAiModel = 'nanobanana3'`.
- No modal "Gerar Post com IA" (após o bloco de Mascote, ~linha 708), inserir mesmo `<Select>` usado no carrossel com as 3 opções.
- `handleGeneratePost` envia `aiModel: staticAiModel` no body do `generate-standalone-post`.
- Resetar `staticAiModel` ao fechar o modal.
- Atualizar `Select` do carrossel (linha 1081-1087) para 3 opções com os mesmos valores. Atualizar tipo de `carouselAiModel` e o reset no `onOpenChange` (linha 970).
- Manter o `aiModel: 'nanobanana3'` enviado de outro lugar (linha 935) ou trocar para o default — sem novo controle visual.

### Notas
- `gpt-image-2` aceita tamanhos `1024x1024`, `1024x1536`, `1536x1024` e `auto`. Mapear `aspectLabel` → size aceito no helper.
- Endpoint `v1/images/generations` retorna `b64_json` quando `response_format: "b64_json"` — usar isso para manter o pipeline atual de upload.
- Não há mudanças de schema. A chave `OPENAI_API_KEY` já existe em `api_keys`.

## Itens fora de escopo
- Botões "Regenerar" do TaskCard continuam usando o modelo default (não pediu seletor lá).
- Sem nova migração ou secrets.
