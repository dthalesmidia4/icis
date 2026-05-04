# Correção: 404 do modelo nas funções auto-generate-*

## Causa raiz confirmada

1. **Secret ausente**: `GOOGLE_API_KEY` não existe no projeto. Só `LOVABLE_API_KEY` está configurada.
2. **Modelo inválido na API pública**: `gemini-3-pro-image-preview` só existe no Lovable AI Gateway. Na API pública do Google seria `gemini-2.5-flash-image-preview`.
3. **Inconsistência**: `generate-video-scene` usa `GEMINI_API_KEY`, enquanto `auto-generate-*` tenta `GOOGLE_API_KEY` — duas variáveis diferentes para a mesma plataforma.

## Solução: usar Lovable AI Gateway

Já temos `LOVABLE_API_KEY` configurada e a memória do projeto define que o gateway é o caminho preferencial para imagens (Nano Banana Pro = `google/gemini-3-pro-image-preview`).

### Mudanças em `supabase/functions/auto-generate-post/index.ts`

- Substituir endpoint `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_API_KEY}`
- Por: `https://ai.gateway.lovable.dev/v1/chat/completions`
- Header: `Authorization: Bearer ${Deno.env.get("LOVABLE_API_KEY")}`
- Body: formato OpenAI-compatible com `model: "google/gemini-3-pro-image-preview"`, `modalities: ["image","text"]`, mensagens com `image_url` (base64) para anexos de referência
- Parsear retorno: `data.choices[0].message.images[0].image_url.url` (data URL base64)
- Tratar 429 (rate limit) e 402 (créditos esgotados) com mensagem clara ao frontend

### Mudanças em `supabase/functions/auto-generate-carousel/index.ts`

- Mesma migração na linha 410 (geração de cada slide)
- Manter loop sequencial de slides e a lógica de batch já existente

### Validação

- Após deploy, chamar manualmente `auto-generate-post` via curl_edge_functions com payload mínimo (uma demanda existente) e checar:
  - Status 200 + URL de imagem salva no storage
  - Logs sem 404
- Repetir para `auto-generate-carousel` com 1 slide

### Não faz parte deste plano

- Re-adicionar dropdowns Tipo/Canal no `CreateDemandModal` (problema #1 da imagem) — fica para próxima rodada se você confirmar.
- Mexer em `generate-video-scene` (funciona, usa Veo direto com `GEMINI_API_KEY` que já existe).

## Arquivos afetados

- `supabase/functions/auto-generate-post/index.ts`
- `supabase/functions/auto-generate-carousel/index.ts`
