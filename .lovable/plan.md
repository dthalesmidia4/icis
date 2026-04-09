

# Correção: Uso Harmônico de Cores da Marca nos Posts

## Problema

Os prompts de todas as Edge Functions de geração de imagem listam as cores da marca de forma crua ("Cor primária: #1c7449"), sem instruir a IA sobre **onde** aplicar cada cor. O Gemini interpreta literalmente e tinge sujeitos inteiros (como um leão) na cor primária, criando resultados visuais absurdos.

## Solução

Substituir a seção `BRANDING` genérica por uma seção `PALETA DE CORES E APLICAÇÃO` com regras claras de **onde** cada cor deve ser usada, em todas as 4 Edge Functions de geração de imagem.

A nova instrução explica:
- **Cor primária** → fundos, banners, elementos gráficos dominantes
- **Cor secundária** → acentos, bordas, elementos complementares
- **Cor de destaque** → botões, badges, CTAs, destaques visuais
- **Cor do texto** → tipografia sobre fundos claros/escuros
- **Regra crítica**: Objetos, pessoas, animais e elementos realistas devem manter suas cores naturais. As cores da marca se aplicam apenas a elementos gráficos de design (fundos, boxes, banners, shapes, tipografia).

## Arquivos Alterados

| Arquivo | Seção alterada |
|---------|---------------|
| `supabase/functions/generate-standalone-post/index.ts` | Seção BRANDING (linhas ~118-133) |
| `supabase/functions/auto-generate-post/index.ts` | Seção BRANDING (linhas ~175-200) |
| `supabase/functions/generate-post-image/index.ts` | Seção BRANDING (linhas ~304-311) |
| `supabase/functions/generate-carousel-images/index.ts` | Seção BRANDING (linhas ~159-165) |
| `supabase/functions/auto-generate-carousel/index.ts` | Seção PALETA DE CORES (linhas ~386-404) |

## Nova Seção de Prompt (aplicada em todas)

```text
PALETA DE CORES E APLICAÇÃO (REGRAS CRÍTICAS):
- Cor primária (${primary}): Use em fundos, banners, boxes, shapes e elementos gráficos dominantes do layout
- Cor secundária (${secondary}): Use em acentos, bordas, elementos complementares e variações de fundo
- Cor de destaque (${highlight}): Use em botões, badges, CTAs, ícones e pequenos destaques visuais
- Cor do texto (${text}): Use na tipografia principal sobre os fundos
- Tipografia: ${font}

REGRA CRÍTICA DE APLICAÇÃO DE CORES:
As cores da marca devem ser aplicadas APENAS em elementos de design gráfico (fundos, gradientes, boxes, banners, shapes, tipografia, ícones, bordas).
NUNCA aplique as cores da marca em objetos reais, pessoas, animais ou elementos figurativos.
Exemplo: se a cor primária é verde, o fundo e os boxes devem ser verdes, mas um leão deve ter cores NATURAIS realistas.
Os sujeitos e ilustrações figurativas devem manter aparência NATURAL e REALISTA.
A paleta de cores cria a identidade visual através do LAYOUT e DESIGN, não tingindo os elementos figurativos.
```

Após a alteração, todas as 5 funções serão redeployadas.

