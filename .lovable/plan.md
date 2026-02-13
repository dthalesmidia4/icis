

## Incluir `instructions` e `observations` no prompt de geração de imagens

### O que muda

Apenas o arquivo `supabase/functions/generate-post-image/index.ts`, na construção do `imagePrompt` (por volta da linha 165).

### Situação atual

Os campos `instructions` e `observations` da demanda já são buscados do banco (o select usa `"*"`), mas **não são incluídos** no prompt enviado ao modelo gpt-image-1.

### Mudança

Adicionar dois blocos condicionais no prompt, entre o conteúdo do slide e a seção BRANDING:

```
CONTEÚDO DO SLIDE ...
Texto principal: "..."
Texto complementar: "..."

INSTRUÇÕES DA DEMANDA:
{demand.instructions}

OBSERVAÇÕES ADICIONAIS:
{demand.observations}

BRANDING:
...
```

Cada bloco só aparece se o campo tiver valor (não nulo/vazio), evitando poluir o prompt quando não houver informação.

### Detalhes técnicos

- Arquivo: `supabase/functions/generate-post-image/index.ts`
- Local: linhas 165-169 do `imagePrompt` template literal
- Inserir após a linha do `slide.body` e antes de `BRANDING:`
- Lógica condicional com template literals: `${demand.instructions ? ... : ""}`
- Nenhuma mudança no frontend
- Nenhuma mudança no banco de dados

