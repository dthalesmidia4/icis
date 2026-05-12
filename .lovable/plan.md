# Expansão da Identidade Visual

## Objetivo
Permitir cadastrar uma **fonte secundária** (subtítulos/elementos auxiliares) e uma **5ª cor auxiliar opcional** (ex.: tons de verde da Statera para enriquecer composições), mantendo as 4 obrigatórias (Primária, Secundária, Destaque, Texto).

## 1. Banco de Dados (migration)

Adicionar colunas em `tenant_companies`:
- `brand_secondary_font` text — nome da fonte secundária
- `brand_auxiliary_color` text — 5ª cor opcional (hex)

Adicionar colunas em `visual_identity_presets` (para que predefinições salvem tudo):
- `secondary_font` text
- `auxiliary_color` text

Sem mudanças de RLS (herdam as políticas existentes).

## 2. UI — `VisualIdentityModal.tsx`

- **Cores**: reorganizar em grid 2 colunas mantendo Primária, Secundária, Destaque, Texto e adicionar campo **"Cor Auxiliar (opcional)"** com indicação visual de que é opcional.
- **Fontes**: adicionar campo **"Fonte Secundária (opcional)"** abaixo de "Nome da Fonte" (renomear para "Fonte Principal").
- Predefinições: ao salvar/carregar incluir os novos campos `secondary_font` e `auxiliary_color`.
- Preview da predefinição na lateral: mostrar as 5 cores (5º círculo só aparece se preenchido) e listar ambas as fontes.

## 3. Prompts de IA (Edge Functions)

Atualizar `auto-generate-post/index.ts` e `auto-generate-carousel/index.ts` para injetar os novos dados nas instruções visuais:

- **Fonte Principal**: títulos e textos de impacto.
- **Fonte Secundária**: subtítulos, legendas e textos de apoio (quando cadastrada).
- **Cor Auxiliar**: usar APENAS em elementos gráficos de apoio (formas, divisores, fundos secundários, badges) — nunca como cor dominante. Mantém regra existente de que cores de marca não tingem objetos/pessoas reais.

Texto inserido no prompt apenas quando os campos existirem (graceful fallback para clientes antigos).

## 4. Configuração da Statera (pós-deploy)

Após aprovar a migration, o usuário poderá abrir a Identidade Visual da Statera e preencher:
- Fonte Secundária: (a definir pelo usuário)
- Cor Auxiliar: tom de verde (escuro ou claro — escolher o principal; o outro pode entrar como predefinição alternativa)

## Arquivos afetados
- `supabase/migrations/<nova>.sql` (nova)
- `src/components/VisualIdentityModal.tsx`
- `supabase/functions/auto-generate-post/index.ts`
- `supabase/functions/auto-generate-carousel/index.ts`
- `mem://features/visual-identity/centralized-management-and-presets` (atualizar memória)

## Observações técnicas
- `src/integrations/supabase/types.ts` é regenerado automaticamente após a migration.
- Campos opcionais: UI e prompts tratam ausência sem quebrar (clientes existentes continuam funcionando).
- Aprovação da migration é necessária antes da implementação do código.
