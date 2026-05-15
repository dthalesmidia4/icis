## Causa raiz (revisada)

A doc oficial do `gpt-image-2` (image-generation guide) deixa claro que o `size` **aceita qualquer resolução** que satisfaça:

- maior aresta ≤ 3840 px
- ambas as arestas múltiplas de 16
- relação maior/menor ≤ 3:1
- total de pixels entre 655.360 e 8.294.400

Tamanhos "populares" listados (1024x1024, 1024x1536, 1536x1024) são apenas presets — não um whitelist. A página antiga do API Reference que enumera só esses três valores está defasada para `gpt-image-2`.

Portanto, há **um único bug** em todos os providers, com sintomas iguais:

### A. gpt-image-2 (provider principal)
`resolveAspect()` em `_shared/image-generation.ts` mapeia 9:16 → `"1024x1536"`, que é 2:3 (0.667), não 9:16 (0.5625). Por isso o usuário pediu 9:16 e recebeu 2:3 literal. A correção é enviar uma resolução **realmente 9:16** dentro das regras do `gpt-image-2`.

Resoluções escolhidas (exatas, múltiplas de 16, dentro dos limites):

| Ratio | Tamanho | Aspect real | Pixels |
|---|---|---|---|
| 1:1 | 1024x1024 | 1.000 | 1.048.576 |
| 9:16 | **1152x2048** | 16/9 = 1.7778 (exato) | 2.359.296 |
| 16:9 | **2048x1152** | 1.7778 (exato) | 2.359.296 |
| 4:5 | 1024x1280 | 1.250 (exato) | 1.310.720 |
| 3:4 | 1024x1360* | ~1.328 (1360 múltiplo de 16) | 1.392.640 |
| 4:3 | 1360x1024 | idem | idem |

(*9:16 e 16:9 ficam matematicamente exatos com 1152x2048; 1080x1920 não serve porque 1080 não é múltiplo de 16.)

### B. Gemini (Nanobanana 3 / 2.5)
Continua faltando enviar `generationConfig.imageConfig.aspectRatio`. O `aspectLabel` só vai no texto do prompt, e o Gemini ignora isso para definir formato.

### C. Defeitos colaterais que amplificam tudo
1. `generate-carousel-images`: monta `aspectLabel = "${aspectRatio} (1024x1024)"` — concatena "1024x1024" mesmo quando o ratio é 9:16, deixando o prompt contraditório.
2. `generate-standalone-post`: hardcoded `"1:1 (1024x1024)"`. Não recebe formato do cliente.
3. `auto-generate-post`: não passa `aspectLabel`. Sempre default 1:1, e Gemini sem `imageConfig`.
4. `generate-post-image`: deduz formato pelo `demand_type`, mas no branch Google chama Gemini direto via `fetch` sem `imageConfig`.

## Mudanças

### 1. `supabase/functions/_shared/image-generation.ts`
- Reescrever `resolveAspect()` (OpenAI) para devolver as resoluções corretas acima. Tabela explícita por ratio (não por substring confusa). Ratio desconhecido → `"auto"`.
- Adicionar `resolveGeminiAspectRatio(label) → "1:1" | "9:16" | "16:9" | "4:3" | "3:4"`.
- No branch Google, incluir no body:
  ```ts
  generationConfig: {
    responseModalities: ["IMAGE","TEXT"],
    imageConfig: { aspectRatio: resolveGeminiAspectRatio(input.aspectLabel) }
  }
  ```
- Log único e padronizado em ambos os branches: `[image-gen] provider=… model=… requestedAspect=9:16 effectiveSize=1152x2048` (ou `effectiveAspect=9:16` no Gemini). Útil para auditoria via edge_function_logs.

### 2. `supabase/functions/generate-carousel-images/index.ts`
- Remover concatenação `(1024x1024)` do `aspectLabel`. Passar apenas `aspectRatio || "1:1"`.

### 3. `supabase/functions/generate-post-image/index.ts` e `auto-generate-post/index.ts`
- Migrar o branch Google de `fetch` direto para `generateImageWithModel` (mesma fonte usada pelo carrossel) — elimina o caminho que ignora `imageConfig` e centraliza a correção.
- `auto-generate-post`: derivar `aspectLabel` a partir de `demand.demand_type` usando o helper já existente em `generate-post-image` (extraído para `_shared/aspect.ts`).

### 4. `supabase/functions/generate-standalone-post/index.ts`
- Aceitar `aspectRatio` no body (default `"1:1"`).
- Passar `aspectLabel: aspectRatio` para `generateImageWithModel`.

### 5. Frontend (`ContentHistory.tsx` e formulários de criação avulsa de post estático)
- Confirmar/adicionar selector de formato (1:1, 9:16, 16:9) e propagar `aspectRatio` para a edge.
- Carrossel avulso já envia `aspectRatio` — apenas garantir que envia o valor cru ("9:16"), não " 9:16 (1024x1024)".

### 6. `supabase/functions/_shared/image-prompts.ts`
- Saneamento: parar de afirmar dimensões em pixels ("1024x1024") dentro do texto. Mantém apenas o ratio em prosa para composição. Quem dita o tamanho real é `size` (OpenAI) e `imageConfig.aspectRatio` (Gemini).

## Verificação

1. Deploy → criar Reel/Stories estático com `gpt-image-2` → log deve mostrar `effectiveSize=1152x2048`; o PNG no storage tem dimensões reais 1152×2048 (9:16 exato).
2. Mesma criação com `nanobanana3` → log `effectiveAspect=9:16` e PNG com proporção 9:16.
3. Carrossel 9:16 com cada modelo → idem para todos os slides.
4. Aprovar período com mix Reel + Estático 1:1 → conferir cada arquivo.
5. Criação avulsa: 1:1, 9:16, 16:9 → abrir cada arquivo gerado.

Sem roteamento entre modelos, sem fallback, sem gambiarra: cada provider passa a receber o parâmetro de aspecto que ele próprio suporta nativamente.
