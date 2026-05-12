## Plano revisado — Eliminar duplicatas e propagar identidade visual

### Diagnóstico (inconsistências reais detectadas)

#### A) Mesma tarefa, modelos diferentes
| Tarefa | Função avulsa | Modelo avulso | Função período | Modelo período |
|---|---|---|---|---|
| Roteiro de carrossel | `generate-carousel-content` | **gpt-4o-mini** | `auto-generate-carousel` | **gpt-5-mini** |
| Imagem de carrossel | `generate-carousel-images` | gemini-3-pro-image-preview | `auto-generate-carousel` | gemini-3-pro-image-preview ✅ |
| Imagem estática | `generate-standalone-post` / `generate-post-image` | gemini-3-pro-image-preview | `auto-generate-post` | gemini-3-pro-image-preview ✅ |

#### B) Mesma tarefa, prompts diferentes (system_prompts)
| Função | prompt_key usado |
|---|---|
| `generate-standalone-post` (estático avulso) | `generate_posts_prompt` |
| `generate-post-image` (estático regen) | `generate_posts_prompt` |
| `auto-generate-post` (estático período) | `generate_posts_prompt` ✅ |
| `generate-carousel-content` (carrossel avulso, texto) | **`generate_posts_prompt`** ⚠️ usa o prompt de POST estático |
| `auto-generate-carousel` (carrossel período) | **`generate_carousel_prompt`** + custom |
| `generate-carousel-images` (carrossel avulso, imagens) | `generate_posts_prompt` ⚠️ idem |

→ Roteiros de carrossel avulso são gerados com o prompt de post estático e modelo errado, enquanto o período usa o prompt e modelo corretos.

#### C) Três funções para o mesmo "post estático"
- `generate-standalone-post` — chamado pelo Client Hub (avulso)
- `generate-post-image` — chamado por `TaskCard` para regenerar imagem de uma demanda
- `auto-generate-post` — chamado em massa após aprovação de período

Todas leem identidade visual + prompt + chamam Gemini 3 Pro Image. Lógica e prompt block duplicados em ~3 lugares.

#### D) Identidade visual: campos novos só no período
| Função | auxiliary | secondary_font |
|---|---|---|
| `auto-generate-post` / `auto-generate-carousel` | ✅ | ✅ |
| `generate-post-image` / `generate-standalone-post` / `generate-carousel-images` / `generate-carousel-content` / `generate-video-storyboard` | ❌ | ❌ |

E `generate-carousel-content` / `generate-video-storyboard` ainda não selecionam `highlight_color` nem `text_color` do preset.

#### E) Boilerplate duplicado em todas as funções
- Buscar `OPENAI_API_KEY` / `GOOGLE_API_KEY` na tabela `api_keys`.
- Buscar empresa + preset ativo + montar `presetColors`.
- Carregar prompt de `system_prompts` com fallback.
- Renderizar bloco visual no prompt.

---

### Plano de correção

#### 1. Criar módulo compartilhado `supabase/functions/_shared/`

**`_shared/api-keys.ts`**
- `getOpenAIKey(supabase)` → string (lança erro padronizado).
- `getGoogleKey(supabase)` → string.

**`_shared/system-prompts.ts`**
- `getSystemPrompt(supabase, key, fallback?)` → string.
- `getCarouselPrompt(supabase)` → resolve canonical + custom override (regra atual de `auto-generate-carousel`).

**`_shared/visual-identity.ts`**
- `loadVisualIdentity(supabase, clientId)` → objeto único:
  ```ts
  { name, fantasy_name, sector, products_services, content_requirements,
    logo: { url, position, size },
    mascot: { has, url, description, gallery_urls[] },
    colors: { primary, secondary, highlight, text, auxiliary },
    fonts: { primary, secondary } }
  ```
  Resolve tenant_companies + visual_identity_presets ativo (preset > tenant > null) **uma vez**, com todos os 5 campos de cor e 2 de fonte.
- `renderVisualIdentityPromptBlock(vi)` → trecho de texto único usado por TODAS as funções de imagem/roteiro. Inclui regras de:
  - Fonte Principal vs Secundária.
  - Cor Auxiliar (apoio, nunca dominante; nunca tinge objetos/pessoas).
  - Highlight em CTAs/badges; Texto para textos longos.
  - Logo (posição, tamanho).
  - Mascote (quando existir).

**`_shared/models.ts`** — fonte única de verdade dos modelos:
```ts
export const MODELS = {
  IMAGE: "gemini-3-pro-image-preview",          // Gemini via Google AI Studio
  TEXT_PLANNING: "gpt-5-mini",                  // planejamento, roteiros, carrossel
  TEXT_LIGHT: "gpt-4o-mini",                    // tarefas leves: reavaliação, supervisão, anamnese, desafios
  VIDEO: "veo-3.1-generate-preview",
};
```
Critério: tarefas que produzem **conteúdo final visível ao cliente** (post, carrossel, storyboard) usam `TEXT_PLANNING` (gpt-5-mini). Tarefas internas (reavaliação, supervisão de equipe) ficam em `TEXT_LIGHT`. Decisão registrada na memória.

#### 2. Padronizar modelos das funções de conteúdo

| Função | Modelo antes | Modelo depois |
|---|---|---|
| `generate-carousel-content` | gpt-4o-mini | **gpt-5-mini** (igualar período) |
| `generate-video-storyboard` | gpt-4o-mini | **gpt-5-mini** (mesma classe de roteiro) |
| `auto-generate-carousel` | gpt-5-mini | gpt-5-mini ✅ |
| `reevaluate-card`, `generate-supervision`, `generate-employee-strategy`, `generate-challenge` | gpt-4o-mini | mantém gpt-4o-mini (tarefas internas) |
| `generate-strategy`, `generate-period-plans` | gpt-5-mini | mantém |

#### 3. Padronizar prompts das funções de conteúdo

| Função | prompt_key antes | prompt_key depois |
|---|---|---|
| `generate-carousel-content` | generate_posts_prompt | **generate_carousel_prompt** (+ custom override, mesma regra de `auto-generate-carousel`) |
| `generate-carousel-images` | generate_posts_prompt | mantém (é prompt visual, ok) — porém usar o helper `loadVisualIdentity` para gerar bloco visual igual ao do período |
| `generate-standalone-post`, `generate-post-image`, `auto-generate-post` | generate_posts_prompt ✅ | mantém |

#### 4. Refatorar as 8 funções para usar os helpers

Cada função passa a:
1. Carregar chaves via `_shared/api-keys`.
2. Carregar identidade visual via `loadVisualIdentity` (todos os 5 campos + 2 fontes, propagados automaticamente).
3. Carregar prompt via `getSystemPrompt` / `getCarouselPrompt`.
4. Concatenar `renderVisualIdentityPromptBlock(vi)` no prompt.
5. Chamar modelo via `MODELS.X`.

Funções afetadas:
- `auto-generate-post`
- `auto-generate-carousel`
- `generate-post-image`
- `generate-standalone-post`
- `generate-carousel-images`
- `generate-carousel-content`
- `generate-video-storyboard`
- `generate-video-scene` (apenas o helper de chave)

Resultado esperado: não há mais bloco de cores/fontes copiado em cada função; alterar o helper propaga para avulso e período de uma vez.

#### 5. Decisão sobre as 3 funções de "post estático"

Manter as três por ora (mudam o caller e o pós-processamento), **mas** com toda a lógica de prompt/visual/modelo vindo dos helpers. Em uma rodada futura podemos avaliar fundir `generate-post-image` em `auto-generate-post` (mesmo contrato). Esta consolidação fica fora do escopo atual para não acoplar a refatoração ao roteamento de regeneração.

#### 6. Verificações pós-deploy

- Logs das 8 funções: garantir que `loadVisualIdentity` retorna `auxiliary` e `secondaryFont` para a Statera.
- Geração avulsa de carrossel da Statera: roteiro deve sair com gpt-5-mini e mencionar paleta completa (incluindo verde auxiliar) nas instruções dos slides.
- Geração de período da Statera: comportamento inalterado.

#### 7. Memória

Atualizar:
- `mem://architecture/ai-model/direct-api-policy-v2` → registrar mapa único de modelos (`MODELS`) e regra "mesma tarefa = mesmo modelo + mesmo prompt".
- `mem://features/visual-identity/centralized-management-and-presets` → registrar que toda função consome `loadVisualIdentity` + `renderVisualIdentityPromptBlock`.
- `mem://features/automation/carousel-generation-config-v1` → atualizar para gpt-5-mini também no avulso.

---

### Resumo das respostas
- **Duplicatas eliminadas?** Sim: modelos centralizados em `MODELS`, identidade visual em um único loader/render, prompts de carrossel unificados.
- **Inconsistências de banco?** Não há mais. Schema do banco já comporta os 5 campos de cor e 2 fontes em `tenant_companies` e `visual_identity_presets` (verificado).
- **Inconsistências de código corrigidas:** modelo divergente em carrossel avulso vs período, prompt errado em `generate-carousel-content`, ausência de `auxiliary`/`secondary_font` em todas as funções avulsas, ausência de `highlight`/`text` nas funções de roteiro.
- **Avulso ↔ período sincronizados** após esta etapa, tanto nos dados quanto no prompt e modelo.

### Arquivos
- Novos: `supabase/functions/_shared/api-keys.ts`, `_shared/system-prompts.ts`, `_shared/visual-identity.ts`, `_shared/models.ts`.
- Editados: as 8 funções listadas em §4.
- Memória: 3 entradas atualizadas.
