## Diagnóstico

Após varrer todas as edge functions de geração de imagem (`auto-generate-post`, `auto-generate-carousel`, `generate-post-image`, `generate-standalone-post`, `generate-carousel-images`, `_shared/image-prompts.ts`, `_shared/carousel-image-runner.ts`), a correção anterior só cobriu `auto-generate-post` e `auto-generate-carousel`. O título do card ainda vaza para a arte em três pontos:

### 1. `_shared/image-prompts.ts` — `STATIC_POST_STYLE_BLOCK` (compartilhado por TODOS os fluxos estáticos e carrossel)
Contém a linha:
> "Apenas o TÍTULO do post deve aparecer legível e bem posicionado na imagem"

Isso instrui o modelo a renderizar um "título" — e em `generate-post-image` esse título é literalmente `demand.title`.

### 2. `generate-post-image/index.ts` (usado pelo botão **"Gerar Estático com IA"** e **"Gerar novamente"** dentro do card)
- Linha 151: injeta `TÍTULO DO POST (pode aparecer como texto na imagem):\n"${demand.title}"` no prompt. Este é o caminho exato que o usuário reproduziu.
- Linhas 105/117: quando `parseSlides(description|instructions)` não encontra slides estruturados, usa `demand.title` como `slide.title` — que depois vira `Texto principal: "${slide.title}"` (linhas 143/148) e é renderizado como tipografia principal.

### 3. `auto-generate-post` já foi corrigido, mas a mesma proibição explícita não existe em `generate-post-image` nem em `generate-standalone-post`.

### Pontos verificados e OK (não precisam mudar)
- `auto-generate-post/index.ts` (linhas 92/98): já rotula título como "interno — proibido renderizar".
- `auto-generate-carousel/index.ts` (linha 147): já rotula título como referência interna.
- `generate-carousel-images/index.ts` + `_shared/carousel-image-runner.ts`: nunca recebem `demand.title`, só o `slideText` do plano.
- `generate-standalone-post/index.ts`: usa `idea`/`exactText` do usuário, nunca `demand.title` (não tem demand).
- `generate-post-caption/index.ts`: gera legenda de texto (não imagem), pode continuar usando `demand.title` como contexto.

## Correções propostas

### A. `supabase/functions/_shared/image-prompts.ts`
No `STATIC_POST_STYLE_BLOCK`, substituir a linha "Apenas o TÍTULO do post deve aparecer legível..." por uma redação genérica que se refira ao **texto do slide/gancho fornecido no bloco de conteúdo**, sem citar "título":
> "Apenas o gancho/CTA curto definido no bloco de CONTEÚDO deve aparecer legível na imagem — nada mais."

Assim tanto estáticos quanto slides de carrossel deixam de pedir "título".

### B. `supabase/functions/generate-post-image/index.ts`
1. **Remover a injeção do título como texto renderizável** (linha ~151). Trocar por rótulo de referência interna, no mesmo padrão de `auto-generate-post`:
   ```
   TÍTULO INTERNO DO CARD (apenas nomenclatura da tarefa — PROIBIDO renderizar,
   parcial ou parafraseado, na imagem): "${demand.title}"
   ```
2. **Adicionar bloco de regras** logo abaixo do CONTEÚDO reforçando: "NUNCA renderize o título interno do card na imagem".
3. **Corrigir o fallback** quando `parseSlides` não encontra slides (linhas 105-107 e 117-120):
   - Não usar `demand.title` como `slide.title`.
   - Derivar o texto principal na ordem: primeiro do `stripHtml(demand.description)` (primeira linha curta / primeiros ~60 chars), depois `demand.objective`, depois `demand.instructions`. Se tudo falhar, deixar `slide.title = ""` e usar apenas `slide.body`, sem cair no título do card.
4. **Modo single-slide regen** (`replaceSlide`, linhas 117-120): idêntico ajuste — não usar `demand.title` como fallback de `slide.title`.

### C. Sanity check final
Após as mudanças, rodar `rg "demand\.title|demandTitle" supabase/functions` e confirmar que toda referência remanescente está claramente marcada como "interno / não renderizar" (auto-generate-post/carousel) ou é usada só para texto de legenda (`generate-post-caption`).

## Escopo intencionalmente fora
- Não alterar `auto-generate-post`, `auto-generate-carousel` (já corretos).
- Não alterar `generate-post-caption` (gera legenda textual, uso legítimo do título).
- Sem migração de dados: correção só afeta gerações futuras.
