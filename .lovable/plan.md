## Problema

Na tela de Evolução (e nos cards da Visão Geral) muitos títulos aparecem prefixados com o tipo da demanda:

- "Post Estático — benefíc..."
- "Carrossel — Crie um post..."
- "Post Estático — CRIE U..."

Já existe uma coluna **Tipo** ao lado do título, e no card o tipo já é exibido como chip. O prefixo é redundância pura.

Ao inspecionar os prompts:

- `generate-normal-demands/index.ts` e `generate-ultra-demands/index.ts` **proíbem apenas o nome da marca** no título (regra "REGRA de TÍTULO"). Nada impede a IA de começar o título com "Post Estático —", "Carrossel —", "Vídeo —", etc.
- Existe `stripBrandPrefix()` nos dois edge functions, mas **não há `stripTypePrefix()`**.

Ou seja: é erro de prompt + falta de saneamento pós-IA. Ainda está ativo — não foi corrigido antes.

## Plano

### 1. Corrigir os prompts (proibir prefixo de tipo)

Em `supabase/functions/generate-normal-demands/index.ts` e `supabase/functions/generate-ultra-demands/index.ts`, estender a regra "REGRA de TÍTULO":

> Também é PROIBIDO iniciar o título com o tipo do conteúdo ("Post Estático", "Carrossel", "Vídeo", "Reels", "Story", "Criativo estático", "Checklist" quando o tipo já é o mesmo, etc.) seguido de "–", "-", "—", ":" ou "|". O tipo já é exibido em coluna/chip separada no card. O `titulo` deve ser APENAS o gancho criativo (ex.: "Como ler seu Demonstrativo em 5 minutos"), sem categorização redundante no começo.

Adicionar um exemplo de bom vs. ruim no prompt para reforçar.

### 2. Adicionar `stripTypePrefix()` como saneamento defensivo

Nos mesmos dois edge functions, criar helper que remove, no início do título, um dos rótulos abaixo seguido de separador (`-`, `–`, `—`, `:`, `|`):

`Post Estático`, `Post`, `Carrossel`, `Carrossel (N slides)`, `Vídeo`, `Video`, `Vídeos Curtos`, `Reels`, `Story`, `Stories`, `Criativo estático`, `Criativo`, `Educação rápida`, `Tutorial`.

Regex case-insensitive, tolerante a acentos e espaços. Aplicado depois de `stripBrandPrefix()`, dentro do map de `planDemands` (linha ~257 no normal e ~353 no ultra). Também aplicar em `fps.title` (linha 280 / 387) para persistência consistente.

### 3. Limpeza dos títulos já existentes (backfill)

Executar migração SQL que aplica o mesmo strip a `public.demands.title` para linhas existentes. Regex em SQL usando `regexp_replace(title, '^\s*(Post Estático|Post|Carrossel( \(\d+ slides\))?|Vídeo|Video|Vídeos Curtos|Reels|Story|Stories|Criativo estático|Criativo|Educação rápida|Tutorial)\s*[-–—:|]\s*', '', 'i')`, com `WHERE title ~* '^\s*(Post Estático|...)\s*[-–—:|]'` para restringir. Não tocar em linhas onde após o strip o título ficaria vazio (guarda com `CASE WHEN length(...) > 3`).

Também atualizar `period_plans.default_plan` / `ultra_plan` / `final_plan` para os planos ainda não materializados? → **Não** neste plano: são JSONBs grandes e a exibição é feita a partir de `demands` uma vez aprovados; planos ainda em rascunho serão regenerados/aprovados pelo fluxo normal e passarão pelo novo `stripTypePrefix()`. Se você preferir cobrir os JSONBs também, avise.

### 4. Verificação

- Rodar SQL de conferência: `SELECT count(*) FROM demands WHERE title ~* '^\s*(Post Estático|Carrossel|Vídeo|...)\s*[-–—:|]'` antes e depois.
- Abrir `/client-evolution` do Hospital Veterinário Leal e conferir se os títulos citados perderam o prefixo.

## Detalhes técnicos

**Arquivos alterados:**
- `supabase/functions/generate-normal-demands/index.ts` — prompt (~L145) + novo `stripTypePrefix` aplicado após `stripBrandPrefix` (~L257, L280).
- `supabase/functions/generate-ultra-demands/index.ts` — prompt (~L257) + `stripTypePrefix` (~L353, L387).
- Nova migração SQL para saneamento de `demands.title`.

**Escopo intencional:** apenas backend de geração + limpeza de dados. UI da Evolução e do card não muda (a coluna Tipo já existe e o Badge de tipo no card continua igual).
