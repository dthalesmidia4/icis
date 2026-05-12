# Corrigir colagem indevida no último slide do carrossel

## Diagnóstico

Ao inspecionar `supabase/functions/_shared/image-prompts.ts` (`buildCarouselSlidePrompt`, usado tanto pelo avulso `generate-carousel-images` quanto pelo período `auto-generate-carousel`), identifiquei dois gatilhos que levam o Gemini 3 Pro Image a renderizar uma grade com todos os slides — exatamente o que apareceu no slide 5 do teste:

1. **Linha `CONTEXTO: S1: "..." | S2: "..." | ... | S5: "..."`** é injetada em cada chamada. O modelo de imagem interpreta a lista literalmente e, principalmente no último slide (quando o "fechamento" do carrossel é mencionado), tende a compor uma colagem/recap de todos os textos numa única arte.
2. **Não há proibição explícita** contra montagens, grids, mosaicos ou recap de slides anteriores. Só existe proibição de "1/5", paginação e dots.

Como o mesmo builder é usado em avulso e período, a correção propaga para os dois fluxos automaticamente (já era o objetivo da unificação anterior).

## Plano

Editar **apenas** `supabase/functions/_shared/image-prompts.ts`:

1. **Reescrever a linha de CONTEXTO** para deixar claro que é referência narrativa textual e que **não deve ser renderizada visualmente**. Ex.:
   ```
   CONTEXTO NARRATIVO (apenas para coerência de tom — NÃO renderize estes textos na imagem):
   S1: "..." | S2: "..." | ...
   ```
2. **Adicionar regra de slide único** em `CAROUSEL_CONTINUITY` e também numa nova diretriz aplicada a TODOS os slides do carrossel:
   - "Cada chamada gera UMA ÚNICA imagem que representa SOMENTE o slide atual (${slideNumber})."
   - "PROIBIDO ABSOLUTO: colagens, grids, mosaicos, recap, montagens, divisão da arte em múltiplos quadros, miniaturas de outros slides ou qualquer composição que mostre mais de uma cena/slide."
   - "Apenas o texto do slide atual ('${slideText}') deve aparecer legível — nenhum outro texto de outro slide pode aparecer."
3. **Reforço extra no último slide** (quando `slideNumber === totalSlides`): adicionar bloco curto deixando claro que o slide final é uma cena única de fechamento/CTA, **não** um resumo visual dos slides anteriores.

Sem mudanças de banco, sem mudanças nos callers, sem alteração de modelo. Mantém a paridade avulso ↔ período.

## Validação

Após editar:
- Reler o arquivo para confirmar a sintaxe.
- Pedir ao usuário para regenerar o carrossel de teste (mesmo cliente Statera) e verificar o slide 5.
