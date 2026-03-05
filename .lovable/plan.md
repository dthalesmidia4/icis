

# Plano: Migrar todas as funções de geração de imagem para Google AI Studio direto com Gemini 3 Pro Image

## Situacao Atual

Auditoria de todas as edge functions de geracao de imagem:

| Funcao | API Atual | Modelo | Problema |
|--------|-----------|--------|----------|
| `generate-standalone-post` | Google AI Studio direto | `imagen-3.0-generate-002` | Modelo errado (nao e o melhor) |
| `generate-post-image` | Google AI Studio direto | `gemini-2.0-flash-exp-image-generation` | Modelo desatualizado |
| `auto-generate-post` | Lovable Gateway | `gemini-3-pro-image-preview` | Gateway errado (402 credits) |
| `auto-generate-carousel` | Lovable Gateway | `gemini-3-pro-image-preview` | Gateway errado (402 credits) |
| `generate-carousel-images` | Lovable Gateway | `gemini-3-pro-image-preview` | Gateway errado (402 credits) |

Funcoes que usam Lovable Gateway apenas para TEXTO (nao precisam mudar):
- `generate-carousel-content` (gera textos dos slides com `openai/gpt-5-mini`)
- `auto-generate-carousel` Step 1 (gera textos com `openai/gpt-5-mini`)

## O que sera feito

Migrar as 4 funcoes de geracao de **imagem** para usar a API direta do Google AI Studio com o modelo **Gemini 3 Pro Image** (`gemini-3-pro-image-preview`), que e o melhor gerador de imagem do Google conforme a pesquisa do usuario.

### Padrao tecnico (para todas as funcoes)

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={GOOGLE_API_KEY}`
- **API Key**: Lida da tabela `api_keys` onde `key_name = 'Google AI Studio'` (ja existe)
- **Payload**: `{ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }`
- **Mascote**: Imagens de referencia enviadas como `inline_data` (base64) nos `parts`
- **Resposta**: Extrair `candidates[0].content.parts[].inline_data.data` (base64)
- **Remover**: Toda dependencia do `LOVABLE_API_KEY` para geracao de imagem

### Funcoes a editar

1. **`generate-standalone-post/index.ts`** - Trocar de Imagen 3 para Gemini 3 Pro Image via `generateContent`
2. **`generate-post-image/index.ts`** - Atualizar modelo de `gemini-2.0-flash-exp` para `gemini-3-pro-image-preview`
3. **`auto-generate-post/index.ts`** - Remover Lovable Gateway, usar Google AI Studio direto com `api_keys`
4. **`auto-generate-carousel/index.ts`** - Step 2 (imagens): Remover Lovable Gateway, usar Google AI Studio direto. Step 1 (texto) permanece no Gateway.
5. **`generate-carousel-images/index.ts`** - Remover Lovable Gateway, usar Google AI Studio direto

### Nota sobre `auto-generate-carousel`

Esta funcao tem 2 etapas:
- **Step 1 (texto)**: Continuara usando o Lovable Gateway com `openai/gpt-5-mini` para gerar textos dos slides (nao e geracao de imagem)
- **Step 2 (imagens)**: Sera migrado para Google AI Studio direto com Gemini 3 Pro Image

