

## Trocar DALL-E 3 pelo gpt-image-1 (melhor modelo de imagem da OpenAI)

### Pesquisa realizada

O modelo mais recente e poderoso da OpenAI para geracao de imagens e o **gpt-image-1** (lancado em abril 2025). Existe tambem o **gpt-image-1.5** (state of the art), porem e mais caro. O gpt-image-1 ja e significativamente superior ao DALL-E 3 em todos os aspectos: fidelidade ao prompt, qualidade visual, renderizacao de texto e realismo.

### Diferencas tecnicas entre DALL-E 3 e gpt-image-1

| Aspecto | DALL-E 3 (atual) | gpt-image-1 (novo) |
|---------|------------------|---------------------|
| Qualidade | Boa | Muito superior |
| Texto em imagens | Ruim | Excelente |
| Tamanhos | 1024x1024, 1024x1792, 1792x1024 | 1024x1024, 1024x1536, 1536x1024, auto |
| Parametro quality | "standard", "hd" | "low", "medium", "high" |
| Resposta padrao | URL temporaria | base64 (b64_json) |
| Preco | Mais barato | Um pouco mais caro, mas muito melhor |

### Mudancas no arquivo `supabase/functions/generate-post-image/index.ts`

1. **Trocar modelo**: de `dall-e-3` para `gpt-image-1`

2. **Atualizar tamanhos de imagem** (funcao `getImageSize`):
   - Stories/Reels: de `1024x1792` para `1024x1536` (portrait)
   - Banner/Cover: de `1792x1024` para `1536x1024` (landscape)
   - Padrao: `1024x1024` (sem mudanca)

3. **Atualizar parametro quality**: de `"standard"` para `"medium"`

4. **Atualizar response_format**: de `"url"` para `"b64_json"` (padrao do gpt-image-1)

5. **Ajustar extracao da imagem**: em vez de baixar de uma URL temporaria, extrair o base64 direto da resposta (`data[0].b64_json`) e converter para `Uint8Array`

6. **Remover etapa de download**: nao precisa mais fazer fetch da URL, a imagem ja vem na resposta

### Impacto

- Apenas 1 arquivo alterado
- Nenhuma mudanca no frontend
- Imagens geradas com qualidade muito superior
- Melhor renderizacao de texto nas imagens (importante para posts de redes sociais)

