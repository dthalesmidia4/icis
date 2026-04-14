

# Separação de Legendas e Conteúdo Visual nos Posts (sem alterações em carrosséis)

## Resumo

Separar o campo `conteudo` (legenda para redes sociais) do conteúdo visual nos posts estáticos, evitando que legendas longas sejam renderizadas dentro da imagem. Carrosséis permanecem inalterados.

## Alterações

### 1. Mapeamento de campos na aprovação de cards

**Arquivos:** `src/pages/ApproveCards.tsx` e `src/pages/RejectedCards.tsx`

- `conteudo` → campo `description` da demanda (legenda/caption — contexto, NÃO visual)
- `instrucoes_de_producao` → campo `instructions` (guia de produção visual)
- `cta_recomendado` → concatenado em `instructions`
- `objetivo` → campo `objective`

### 2. Ajustar prompts em 3 Edge Functions (posts estáticos)

**Funções:**
- `generate-standalone-post/index.ts`
- `auto-generate-post/index.ts`
- `generate-post-image/index.ts`

Em cada uma, separar claramente no prompt:

```text
TÍTULO DO POST (pode aparecer como texto na imagem):
"${demand.title}"

CONTEXTO TEMÁTICO (NÃO inclua este texto na imagem — é a legenda para a descrição da rede social):
${demand.description}

INSTRUÇÕES DE PRODUÇÃO VISUAL:
${demand.instructions}

REGRA CRÍTICA DE SEPARAÇÃO:
- O "CONTEXTO TEMÁTICO" é a LEGENDA da rede social. NÃO deve aparecer na imagem.
- Apenas o TÍTULO e textos curtos de gancho/CTA devem aparecer como tipografia.
```

### 3. Arquivos excluídos (sem alteração)

- `generate-carousel-images/index.ts` — mantém como está
- `auto-generate-carousel/index.ts` — mantém como está

## Arquivos Alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/ApproveCards.tsx` | Separar `conteudo` → `description`, `instrucoes` → `instructions` |
| `src/pages/RejectedCards.tsx` | Mesma separação |
| `supabase/functions/auto-generate-post/index.ts` | Marcar `description` como contexto não-visual |
| `supabase/functions/generate-standalone-post/index.ts` | Idem |
| `supabase/functions/generate-post-image/index.ts` | Idem |

As 3 Edge Functions serão redeployadas após as alterações.

