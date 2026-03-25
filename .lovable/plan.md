

## Diagnóstico: Por que o prompt de carrossel do Dev Hub não está sendo usado

### O problema encontrado

Na edge function `auto-generate-carousel/index.ts`, linha 116, o código busca o prompt com a chave **`generate_posts_prompt`** (prompt de posts), e **NÃO** o prompt dedicado de carrossel que você criou no Dev Hub.

```
.eq("prompt_key", "generate_posts_prompt")  // <-- ERRADO
```

Ou seja: mesmo que você tenha criado um prompt rico e detalhado para carrosséis no painel do Dev, ele **nunca é lido** pela função. A função continua usando o prompt de posts (ou nenhum, se esse não existir).

Além disso, mesmo o prompt que é carregado na variável `basePrompt` (linha 119) **não é injetado** no `systemPrompt` final (linhas 155-165). Ele é buscado do banco mas simplesmente ignorado.

São **dois problemas**:
1. Busca a chave errada (`generate_posts_prompt` em vez de `generate_carousel_prompt`)
2. O conteúdo buscado (`basePrompt`) não é incluído no prompt enviado à IA

### Plano de correção

**Arquivo**: `supabase/functions/auto-generate-carousel/index.ts`

1. **Trocar a chave do prompt** de `generate_posts_prompt` para `generate_carousel_prompt` (linha 116)
2. **Injetar o `basePrompt`** no `systemPrompt` (linha 155), igual ao que o `auto-generate-post` faz
3. **Trocar o modelo** de `gpt-4o-mini` para `o4-mini` (linha 176)

O `systemPrompt` corrigido ficaria assim:
```
Você é um copywriter especialista em marketing digital. Crie textos para carrosséis.

DIRETRIZES DO SISTEMA (PROMPT DO CARROSSEL):
{basePrompt}              <-- INJETADO do banco

ESTRATÉGIA: ...
CLIENTE: ...
EXIGÊNCIAS: ...
REGRAS: ...
```

Nenhuma outra alteração necessária -- o prompt já existe no banco, só precisa ser lido e usado.

