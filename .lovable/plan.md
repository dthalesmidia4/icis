## Problema

1. Em demandas planejadas, o **título do card** (ex.: "Statera – Quando indicar uma Avaliação Neuropsicológica? (3 sinais práticos)") está aparecendo renderizado na arte gerada. O título é nomenclatura interna do card — nunca deveria virar tipografia da imagem.
2. O fluxo **Carrossel Manual** (`ClientHub` → Carrossel → Manual) chama `generate-carousel-images` com `aiModel: 'gpt2'` hardcoded, sem picker. Não segue a mesma UX do carrossel/estático via IA, que já tem seletor com default GPT Image 2.

## Escopo da mudança

### 1. Tirar o título da imagem (estático planejado + avulso)

**`supabase/functions/auto-generate-post/index.ts`** (usado por "Gerar estático com IA" no card e pelo fluxo automático pós-aprovação):
- Trocar o bloco `TÍTULO DO POST (pode aparecer como texto na imagem)` por `TÍTULO INTERNO DO CARD (apenas contexto — PROIBIDO renderizar este texto na imagem)`.
- Ajustar a "REGRA CRÍTICA DE SEPARAÇÃO DE CONTEÚDO" para explicitar:
  - O título é identificador interno, NUNCA deve virar tipografia.
  - A tipografia visual deve ser derivada do **Objetivo/Instruções/Descrição** (gancho curto), criando um título visual novo e conciso.
  - Se nenhum gancho estiver disponível, o modelo gera um título visual curto a partir do tema — sem copiar o título do card.

**`supabase/functions/generate-standalone-post/index.ts`**: manter o modo Manual (texto exato) intacto; no modo automático (`isManual=false`) já não passa título de card, então nada a alterar.

**`supabase/functions/auto-generate-carousel/index.ts`**: o `demand.title` só alimenta a geração de textos dos slides (etapa OpenAI), não vai para o prompt de imagem. Renomear rótulo para `Título interno (apenas referência)` para reforçar que o modelo de texto não deve reproduzi-lo literalmente nos slides.

### 2. Picker de modelo no Carrossel Manual

**`src/pages/ClientHub.tsx`**:
- No `Dialog manualCarouselOpen` (linha ~1955), adicionar um `Select` de modelo idêntico ao do modal de carrossel IA (Nanobanana 3 / Nanobanana 2.5 / GPT Image 2), reutilizando o state `carouselAiModel` já existente (default `'gpt2'`).
- Substituir o `aiModel: 'gpt2'` hardcoded na chamada `generate-carousel-images` (linha 2065) por `carouselAiModel`.
- Resetar `carouselAiModel` no `onOpenChange` do modal manual, mantendo consistência com o modal IA.

## Fora de escopo

- Não alterar o fluxo `Manual → Texto exato` do post estático (usuário quer o texto literal).
- Não mexer em prompts de vídeo, storyboard, ou publicação.
- Não alterar `models.ts` (`DEFAULT_IMAGE_MODEL = 'gpt2'` já é a fonte única).

## Verificação

- Reprocessar a demanda "Statera – Quando indicar..." via "Gerar estático com IA" e confirmar que o título do card não aparece na arte.
- Abrir Carrossel Manual e conferir o seletor de modelo com GPT Image 2 pré-selecionado.
