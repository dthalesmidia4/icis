

## Diferenças encontradas entre as duas funções

| Aspecto | Avulso (`generate-standalone-post`) | Automático (`auto-generate-post`) |
|---------|-------------------------------------|-----------------------------------|
| **Visual Identity Presets** | Busca `visual_identity_presets` com 4 cores (primary, secondary, highlight, text) + font | Usa apenas 2 cores básicas do cadastro (primary, secondary) |
| **Cor de destaque** | Sim (`highlight_color`) | Não |
| **Cor do texto** | Sim (`text_color`) | Não |
| **Fonte do preset** | Sim (`font_name` do preset) | Só `brand_font` do cadastro |

O modelo AI, mascote, prompt do sistema e estratégia são iguais. A diferença de qualidade vem do prompt de branding mais pobre na auto-geração.

## Plano de implementação

**Arquivo:** `supabase/functions/auto-generate-post/index.ts`

Após buscar o branding do cliente (passo 3), adicionar uma busca ao primeiro `visual_identity_presets` disponível para o cliente. Usar as cores extras (highlight, text, font) no bloco BRANDING do prompt, idêntico ao standalone:

1. Buscar o primeiro preset ativo do cliente em `visual_identity_presets` (filtrado por `company_id`)
2. Usar as cores do preset (se disponível) para sobrescrever as cores básicas
3. Adicionar linhas de `highlight_color` e `text_color` no prompt, igual ao avulso

Isso equaliza o contexto visual enviado ao modelo, resultando em qualidade equivalente.

