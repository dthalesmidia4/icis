

# Correção: Capa Impactante nos Carrosséis

## Problema

Os prompts de geração de imagens de carrossel tratam **todos os slides igualmente**. O slide 1 (capa/gancho) não recebe instruções especiais para ser visualmente impactante. O resultado é uma capa genérica que não se diferencia dos demais slides e não incentiva o público a deslizar.

## Solução

Adicionar uma seção condicional nos prompts de imagem que, **quando `slideNumber === 1`**, injeta regras específicas de design de capa. Isso será aplicado nas 2 Edge Functions que geram imagens de carrossel:

1. `supabase/functions/generate-carousel-images/index.ts` (geração manual)
2. `supabase/functions/auto-generate-carousel/index.ts` (geração automática)

## Instruções da Capa (slide 1)

Quando `slideNumber === 1`, o prompt incluirá:

```text
REGRAS ESPECIAIS PARA CAPA (SLIDE 1 - OBRIGATÓRIO):
Este é o slide de CAPA do carrossel — o mais importante de todos.
- Design VISUALMENTE IMPACTANTE e CHAMATIVO que capture atenção imediata no feed
- Use elementos gráficos bold: boxes coloridos grandes, banners vibrantes, balões de fala (speech bubbles) ou shapes dinâmicos para conter o texto
- Tipografia EXTRA BOLD, centralizada e com tamanho grande — o texto deve ser o protagonista visual
- Composição com profundidade: sombras, gradientes e camadas visuais que criem dimensão
- Use ícones ou emojis 3D estilizados para enriquecer o layout
- O design deve transmitir "profissionalismo de agência" e incentivar o usuário a DESLIZAR para ver mais
- A capa deve comunicar CLARAMENTE o tema do carrossel de forma concisa e atraente
- NÃO use layouts simples ou minimalistas — a capa deve ser visualmente rica e elaborada
```

Para slides que **não são a capa**, adicionar uma instrução mais leve:

```text
CONTINUIDADE VISUAL: Mantenha o estilo visual coerente com a capa, mas com layout adequado para conteúdo informativo.
```

## Arquivos Alterados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/generate-carousel-images/index.ts` | Adicionar bloco condicional de capa no prompt (~linha 174) |
| `supabase/functions/auto-generate-carousel/index.ts` | Adicionar bloco condicional de capa no prompt (~linha 401) |

Ambas as funções serão redeployadas após a alteração.

