## Diagnóstico

Os logs mostram exatamente os dois problemas:

**1. GPT Image 2** → `400 Unknown parameter: 'response_format'`
O endpoint `v1/images/generations` para `gpt-image-2` **não aceita** `response_format`. Esse modelo já retorna `b64_json` por padrão (não suporta URL). O parâmetro precisa ser removido.

**2. Nanobanana 3.5** → `404 models/gemini-3.5-pro-image-preview is not found`
O ID `gemini-3.5-pro-image-preview` não existe na API pública do Google (v1beta) hoje. Os modelos de imagem do Gemini disponíveis são:
- `gemini-2.5-flash-image-preview` (Nano Banana original)
- `gemini-3-pro-image-preview` (Nano Banana Pro — já é o atual `nanobanana3` aqui)

Tentei pesquisar publicamente por um ID `3.5` de imagem do Gemini e não encontrei nenhum endpoint/snapshot público com esse nome (Google e DuckDuckGo bloquearam o scrape; a API `ListModels` exige chave). Como o erro 404 vem do próprio Google ("não suportado para generateContent"), o ID precisa ser corrigido ou o item removido.

## Mudanças propostas

### 1. `supabase/functions/_shared/image-generation.ts`
Remover `response_format: "b64_json"` do body enviado ao `v1/images/generations`. Manter o resto igual (já lê `data.data[0].b64_json` do retorno padrão).

### 2. `supabase/functions/_shared/models.ts` — Nanobanana 3.5
Preciso da sua confirmação antes de tocar nesse item. Três caminhos possíveis:

**(a)** Você tem o ID correto do modelo (ex.: snapshot interno tipo `gemini-3.5-flash-image-preview`, `gemini-3.5-pro-image`, etc.). Me passa que eu coloco no map.

**(b)** Mapear `nanobanana35` para um modelo Gemini que comprovadamente existe hoje (por ex. `gemini-2.5-flash-image-preview`) só para a opção funcionar.

**(c)** Remover a opção "Nanobanana 3.5" das selects do frontend até o ID público existir, deixando só `Nanobanana 3` + `GPT Image 2`.

### Fora de escopo
Sem mudanças em RLS, schema, secrets, ou em outros fluxos (carrossel, regenerar, etc.). O fix do `response_format` afeta automaticamente carrossel também (mesmo helper).

## Pergunta para você
Qual caminho seguimos para o "Nanobanana 3.5": **(a)** você passa o ID correto, **(b)** apontar para `gemini-2.5-flash-image-preview` por enquanto, ou **(c)** remover a opção?