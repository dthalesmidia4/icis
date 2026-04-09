

# Integração de Logo no Modal de Identidade Visual e nas Gerações de Imagem

## Resumo

Adicionar uma aba "Logo" no modal de Identidade Visual para upload/gerenciamento do logotipo da empresa, e integrar a logo como referência visual nos prompts de geração de imagem (posts estáticos e carrosséis), com regras especiais de posicionamento na capa e último slide dos carrosséis.

## Alterações

### 1. Modal de Identidade Visual — Nova aba "Logo"

**Arquivo:** `src/components/VisualIdentityModal.tsx`

- Adicionar novo `Tab = "menu" | "visual" | "mascot" | "logo"`
- Adicionar card "Logo" no menu inicial (3 cards: ID Visual, Mascote, Logo)
- Na aba "logo":
  - Exibir preview da logo atual (se existir via `logo_url` do `tenant_companies`)
  - Botão de upload com drag-and-drop (mesmo padrão do mascote)
  - Botão de remover logo existente
  - Opções de personalização:
    - **Posição da logo**: select com opções (canto superior esquerdo, canto superior direito, canto inferior esquerdo, canto inferior direito, centro inferior)
    - **Tamanho da logo**: select com opções (pequeno, médio, grande)
  - Salvar configurações de logo position/size no `tenant_companies` (novos campos)
- O upload usa o bucket `company-logos` já existente e atualiza `logo_url`

### 2. Novos campos na tabela `tenant_companies`

**Migração SQL:**
- `logo_position text DEFAULT 'bottom-right'` — posição da logo nos posts
- `logo_size text DEFAULT 'medium'` — tamanho da logo nos posts

### 3. Integração da Logo nos Prompts de Geração

**5 Edge Functions a alterar:**
- `generate-standalone-post/index.ts`
- `auto-generate-post/index.ts`
- `generate-post-image/index.ts`
- `generate-carousel-images/index.ts`
- `auto-generate-carousel/index.ts`

Em cada uma:
- Buscar `logo_url`, `logo_position`, `logo_size` do `tenant_companies`
- Se `logo_url` existir, fazer fetch da imagem como base64 e incluir como `inlineData` (mesmo padrão do mascote)
- Adicionar seção no prompt:

```
LOGO DA MARCA:
- A logo da marca está fornecida como imagem de referência. INCLUA a logo no design.
- Posição: ${logo_position} (ex: canto inferior direito)
- Tamanho: ${logo_size} (pequeno ~8% da área, médio ~12%, grande ~18%)
- A logo deve ser nítida, legível e integrada harmoniosamente ao layout
- NÃO distorça, altere cores ou modifique a logo de nenhuma forma
```

Para carrosséis, regras adicionais:
- **Slide 1 (capa):** Logo proeminente, tamanho aumentado (+1 nível)
- **Último slide:** Logo proeminente, tamanho aumentado (+1 nível)
- **Slides intermediários:** Logo no tamanho configurado, posição configurada

### 4. Atualizar o ClientHub para passar `logoUrl`

**Arquivo:** `src/pages/ClientHub.tsx`

- Buscar `logo_url` do cliente ao carregar dados
- Passar `logoUrl` nas chamadas às Edge Functions de geração manual

## Arquivos Alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/VisualIdentityModal.tsx` | Nova aba "Logo" com upload, preview, opções posição/tamanho |
| Nova migração SQL | Campos `logo_position` e `logo_size` em `tenant_companies` |
| `src/pages/ClientHub.tsx` | Passar `logoUrl` nas chamadas de geração |
| `supabase/functions/generate-standalone-post/index.ts` | Buscar logo, anexar como inlineData, adicionar prompt |
| `supabase/functions/auto-generate-post/index.ts` | Idem |
| `supabase/functions/generate-post-image/index.ts` | Idem |
| `supabase/functions/generate-carousel-images/index.ts` | Idem + regras capa/último slide |
| `supabase/functions/auto-generate-carousel/index.ts` | Idem + regras capa/último slide |

