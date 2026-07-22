## Problema

Nas edge functions de planejamento, o prompt força o modelo a começar todo título por `"{Nome da Empresa} – "`. Como agora o nome do cliente já aparece como badge acima do título nos cards, o resultado fica duplicado (ex.: badge "Yön Contadores" + título "Yön Contadores – Como ler seu Demonstrativo…").

Arquivos com a regra:
- `supabase/functions/generate-normal-demands/index.ts` (linha 133): formato JSON define `"titulo":"${brand} – <título>"`.
- `supabase/functions/generate-ultra-demands/index.ts` (linhas 137 e 152): mesmo formato + regra explícita "SEMPRE começar com `${brand} – `".

## Correção

1. **Remover o prefixo do prompt (fonte da verdade)**
   - Em `generate-normal-demands/index.ts`: trocar `"titulo":"${brand} – <título>"` por `"titulo":"<título criativo curto>"` e adicionar uma regra explícita: "NUNCA incluir o nome da empresa/marca no título — o nome do cliente já é exibido separadamente no card. O título deve ser apenas o gancho/tema do conteúdo."
   - Em `generate-ultra-demands/index.ts`: mesma troca no exemplo JSON e substituir a "REGRA de TÍTULO" por uma proibição equivalente.

2. **Sanitização defensiva no salvamento (mesma edge)**
   Antes do `INSERT`, se o `titulo` retornado começar com `"{brand} – "` (ou variações com `-`, `—`, `–`, `:`), remover esse prefixo. Isso protege contra o modelo desobedecer a instrução.

3. **Migração leve para o legado (opcional, recomendado)**
   Rodar um `UPDATE` único em `demands` removendo o prefixo `"{fantasy_name || name} – "` (case-insensitive, aceitando `-`/`–`/`—`/`:`) do início do `title`, escopado por `client_id`. Sem isso, cards já criados continuam duplicados até serem regerados.

Não altero componentes de UI: o badge da empresa acima do título já existe e é o comportamento desejado.

## Fora do escopo
- Alterar prompts de conteúdo avulso / carrossel manual (não usam esse prefixo).
- Mudar o layout do card ou a exibição do badge.
