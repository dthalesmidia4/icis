
# Reformulação da criação de demanda avulsa + Seedance

## 1. Diagnóstico da estrutura atual

**Fluxo hoje (tudo em `src/pages/ClientHub.tsx`, ~3.3k linhas):**
- Botão "Conteúdo Avulso" → `contentHubModalOpen` (Dialog A: Criar / Histórico)
- Escolher Criar → `contentModalOpen` (Dialog B: escolher formato — Estático / Carrossel / Vídeo)
- Escolher Vídeo → `videoModalOpen` (Dialog C) com dois passos internos (`videoStep` 1 = idéia+cenas+formato; 2 = editar cenas)
- Vídeo: `videoScenes` (array local) contém por cena: descrição, fala do mascote, frame0, engine (`veo`/`seedance`), model, duration, resolution, generate_audio, video_url
- Persistência: apenas via `saveGeneratedContent` (tabela `generated_contents`) ao gerar cada cena. Se o modal fechar (Esc, clique fora, refresh), **todo o estado local `videoScenes` é perdido** — só sobra o que já foi salvo por cena.
- Reabrir: pelo Histórico (`generated_contents`) — `handleOpenGenerator` (linha ~1139) reidrata `videoIdea`, `videoScenes`, `videoStep = 2`.

**Seedance atual:**
- `supabase/functions/generate-video-scene-seedance/index.ts` — task async no Ark (`ark.ap-southeast.bytepluses.com/api/v3`), poll a cada 10s, upload final para bucket `card-attachments`.
- Refs por cena (ordem fixa): first_frame, last_frame, mascote (até 4), logo, produto (até 3), personagem real. Limite 4 refs (1.x pro/lite) ou 9 (v2).
- `_shared/seedance-prompt.ts` sanitiza qualquer menção a "pessoa real" e monta legendas `[Image N]`.
- Sem cálculo/exibição de custo. Sem biblioteca reutilizável — logo/mascote vêm de `tenant_companies` + `visual_identity_presets`, personagens ad-hoc são upload direto no card.

**Limitações principais:**
1. Modal 3 níveis → perda de progresso silenciosa; sem draft persistente; sem "abandonar → recuperar".
2. Sem custo visível: usuário só descobre gasto no faturamento BytePlus.
3. Refs de vídeo são efêmeras — impossível reaproveitar o mesmo personagem/cenário entre vídeos ou entre cenas de forma controlada.
4. Cada cena tem controles Seedance duplicados (não há "configuração global do vídeo" que caia como default por cena).
5. Logo hoje é apenas overlay/prompt genérico. Não há como declarar "aplicar contextualmente na caneca" vs "só na pós".

## 2. Referência oficial confirmada

BytePlus Ark Seedance (`/api/v3/contents/generations/tasks`):
- **Preço não vem na resposta da API.** O painel BytePlus publica preços por segundo de vídeo por modelo/resolução. Nenhum endpoint público de pricing.
- Multi-referência: v2 aceita até 9 imagens; 1.x pro/lite aceita 4 (com first+last frame). Ordem das imagens define o significado quando descrita no prompt com `[Image N]`.
- Formatos aceitos por imagem de referência: JPEG/PNG/WebP até ~10MB, URL pública.
- Áudio de voz (v2): sample 2–5s, `audio_url`.
- Duração 2–12s; resolução 480p/720p/1080p; aspect 9:16, 16:9, 1:1, 4:5, 21:9, adaptive.
- Não há flag oficial para "logo contextual" — a única alavanca é o prompt + imagem de referência com legenda.

**Conclusão sobre custo:** precisa vir de **tabela de preços configurável no banco** (fonte de verdade administrada). Não inventar. API não fornece.

## 3. Proposta

### 3.1 Experiência inline (substituir modais)

Criar rota nova `/avulso/nova?clientId=…&type=video|estatico|carrossel[&draftId=…]` como página completa, mesmo padrão de `Scheduled.tsx` (header + BackButton, container `max-w-*`, sem overlay).

- Botão "Conteúdo Avulso" no ClientHub → navega para `/avulso` (hub inline com "Criar novo" e "Histórico" lado a lado — substitui `contentHubModalOpen`).
- "Criar novo" → seleção de formato inline (chips) → navega para `/avulso/nova?type=video&…`.
- Fechar/voltar = `BackButton`. Se houver alterações não salvas → `beforeunload` + `AlertDialog` "Sair sem salvar? Um rascunho será mantido".
- **Autosave**: debounce 800ms → upsert em `avulso_drafts` (ver §3.4). Reabrir retoma exatamente o ponto (inclui `videoScenes` completo, refs escolhidas, engine settings).
- Migração dos modais: manter `Dialog` internos apenas para picker de referências (biblioteca) — nada que bloqueie o fluxo principal.

### 3.2 Estimativa de custo Seedance

- Nova tabela `seedance_pricing` (admin edita em `/dev/apis` — página já existe):
  ```
  id, model_key (lite|pro|v2), resolution (480p|720p|1080p),
  price_credits_per_second numeric,
  price_brl_per_credit numeric (nullable),
  updated_at, updated_by
  ```
- Edge function `estimate-seedance-cost` (ou selector client-side) recebe `{model, duration, resolution, sceneCount}` → retorna `{credits, brl?, source: 'config', updated_at}`.
- UI: badge fixo no topo do editor de cenas — "Custo estimado: X créditos (~R$ Y) — baseado em preços configurados em DD/MM". Se linha faltando → "Preço não configurado para este modelo/resolução" com link para admin.
- Nunca hardcode. Sem linha na tabela → não mostra R$, mostra apenas "custo indisponível".
- Recalcula ao vivo por cena e total.

### 3.3 Biblioteca reutilizável de referências

Escopo: **por tenant + por cliente (opcionalmente global do tenant)**. Uma tabela unificada:

```sql
CREATE TABLE public.video_references (
  id uuid pk,
  tenant_id uuid not null,
  client_id uuid null,               -- null = disponível para todos os clientes do tenant
  kind text not null check (kind in ('character','scenery','prop','brand_asset')),
  name text not null,
  description text,
  attributes jsonb,                  -- físico/roupas/iluminação/regras conforme kind
  primary_image_url text,
  extra_image_urls text[],           -- refs adicionais
  logo_variant text,                 -- só brand_asset: 'primary'|'light'|'dark'
  restrictions text,
  created_at, updated_at, created_by
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_references TO authenticated;
GRANT ALL ON public.video_references TO service_role;
ALTER TABLE public.video_references ENABLE ROW LEVEL SECURITY;
-- policies: tenant isolation via has_tenant_access(auth.uid(), tenant_id)
```

- `kind = 'character'` usa `attributes` para: características físicas, roupas, função, observações de consistência.
- `kind = 'scenery'` usa `attributes` para: iluminação, ambientação, obrigatórios, proibidos.
- `kind = 'prop'` para objetos (notebook, caneca, uniforme, produto, prontuário).
- `kind = 'brand_asset'` para logo primária/clara/escura + cores + tipografia (também pode continuar puxando de `tenant_companies` + `visual_identity_presets` como fallback — evitar duplicação).

CRUD em nova página `/referencias-visuais` (ou aba dentro de "Identidade Visual"). Selecionável via picker no editor de cenas.

**Regras de uso na geração:**
- Mapear cada referência escolhida → `SeedanceRef` (kind já compatível).
- Ordem no prompt: refs globais do vídeo primeiro, depois refs específicas da cena — mantém consistência entre cenas.
- Aviso em UI quando total de refs > limite do modelo (v2=9, 1.x=4) — bloquear geração ou pedir para desmarcar.

### 3.4 Persistência de rascunho

```sql
CREATE TABLE public.avulso_drafts (
  id uuid pk,
  tenant_id uuid not null,
  user_id uuid not null,
  client_id uuid not null,
  content_type text not null,         -- 'video'|'estatico'|'carrossel'
  state jsonb not null,               -- videoIdea, sceneCount, aspect, scenes[], global_refs, engine_defaults
  updated_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avulso_drafts TO authenticated;
GRANT ALL ON public.avulso_drafts TO service_role;
ALTER TABLE public.avulso_drafts ENABLE ROW LEVEL SECURITY;
-- policy: user_id = auth.uid() AND has_tenant_access(auth.uid(), tenant_id)
```

Autosave a cada mudança relevante; ao gerar cena/salvar em `generated_contents`, mantém draft até o usuário clicar "Concluir" (aí deleta).

### 3.5 Nova tela de edição de cenas

Layout inline `/avulso/nova?type=video`:

```
[← Voltar]   Storyboard: [título editável]         [Custo: X cred ~R$Y]  [Salvo há 3s]
┌─ Configuração global ───────────────────────────────────────────────────┐
│ Ideia │ Formato (9:16…) │ Motor padrão [Veo|Seedance] │ Modelo │ …      │
│ Referências globais: [+ Personagem] [+ Cenário] [+ Objeto] [+ Marca]    │
│ Logo: (○ não usar  ○ contextual  ○ só pós-produção)  Variante: clara/escura│
└─────────────────────────────────────────────────────────────────────────┘
┌─ Cenas ────────────────────────────────────┐  ┌─ Editor da cena X ─────┐
│ ▤ Cena 1 · Abertura · 4s · pronto        │  │ Título interno         │
│ ▤ Cena 2 · Desenvolvimento · 5s · rascunho│  │ Duração                │
│ ▤ Cena 3 · CTA · 4s · gerando…            │  │ Descrição visual (EN)  │
│ [+ Adicionar cena]                         │  │ Ação / Fala (PT)       │
│                                            │  │ Quem aparece: chips    │
│                                            │  │ Cenário: chip          │
│                                            │  │ Objetos: chips         │
│                                            │  │ Overrides: engine/ratio│
│                                            │  │ Logo nesta cena: …     │
│                                            │  │ [Gerar cena] [Duplicar]│
└────────────────────────────────────────────┘  └────────────────────────┘
```

- Lista drag-and-drop reordenável, duplicar, excluir.
- Editor foca em 1 cena por vez (URL `?scene=2`).
- Chips mostram claramente refs globais (herdadas) vs específicas da cena (com "×" para remover só da cena).
- Estados por cena: rascunho / pronto para gerar / gerando / concluído / erro (mesmo enum visual).
- Custo total sempre no topo, recalcula em real time.
- Auto-save badge.

### 3.6 Logo estratégica

Novo campo por cena: `logo_mode ∈ {none, contextual, postproduction, required_on:<propId>}` + `logo_variant ∈ {primary, light, dark}` + `logo_notes`.

- `contextual` → adiciona logo aos refs do Seedance com legenda `[Image N] = the brand logo, placed naturally on <objeto> in the scene`.
- `required_on:propId` → força a legenda a citar o objeto específico ("on the mug", "on the notebook lid").
- `postproduction` → **não** envia ao Seedance; marca a cena para overlay via ffmpeg em etapa futura (fora deste escopo, apenas persiste a intenção).
- `none` → omite.
- Aviso permanente: "A IA pode não reproduzir a logo com fidelidade. Para logo garantida, use pós-produção."

## 4. Arquivos que serão alterados

**Novos:**
- `src/pages/AvulsoHub.tsx` (lista Criar/Histórico inline)
- `src/pages/AvulsoNova.tsx` (workspace do vídeo/estático/carrossel; começa pelo caso vídeo)
- `src/pages/VisualReferences.tsx` (CRUD biblioteca)
- `src/components/avulso/SceneList.tsx`, `SceneEditor.tsx`, `GlobalRefsBar.tsx`, `CostBadge.tsx`, `ReferencePicker.tsx`, `LogoModeSelector.tsx`
- `src/hooks/useAvulsoDraft.ts` (autosave + hydrate)
- `src/hooks/useSeedanceCost.ts`
- `supabase/functions/estimate-seedance-cost/index.ts` (opcional; pode ser puro cliente lendo a tabela via RLS)
- Migrations: `video_references`, `avulso_drafts`, `seedance_pricing` (com GRANTs + RLS).

**Editados:**
- `src/App.tsx` — adicionar rotas `/avulso`, `/avulso/nova`, `/referencias-visuais`.
- `src/pages/ClientHub.tsx` — botão passa a `navigate('/avulso?clientId=…')`; remover `contentHubModalOpen`, `contentModalOpen`, `videoModalOpen` e toda a lógica de vídeo (mover para os novos componentes). Manter apenas o resumo/entrada.
- `supabase/functions/generate-video-scene-seedance/index.ts` — receber `sceneReferences: SeedanceRef[]` já ordenadas (globais + cena) em vez dos slots avulsos; manter compat.
- `supabase/functions/_shared/seedance-prompt.ts` — legenda estendida para `logo_mode = required_on`.
- `src/pages/DevApis.tsx` — seção "Preços Seedance" (CRUD `seedance_pricing`).

## 5. Banco de dados — resumo

Três tabelas novas (com GRANT + RLS). Nenhuma coluna nova em `demands`. `generated_contents` continua sendo o repositório final; `avulso_drafts` é apenas rascunho.

## 6. Riscos e dependências

- **Perda de rascunhos legados**: usuários que já tenham modal aberto na hora do deploy — mitigação: dump do `videoScenes` para `avulso_drafts` no unmount durante uma janela de transição.
- **Preço configurado errado** exibiria valor enganoso — badge sempre marcado como "estimativa · atualizado em <data>" com link para admin editar.
- **Limite de refs**: v2=9. Se global+cena passar do limite, bloquear geração com mensagem clara antes do submit.
- **Fidelidade da logo**: registrar aviso permanente e oferecer caminho "só pós-produção".
- Rota `/scheduled` já usa `BackButton` + layout inline — reaproveitar padrão.

## 7. Critérios de aceite

1. Criar nova demanda avulsa de vídeo abre em página inteira, não modal.
2. Fechar aba/recarregar/voltar preserva o rascunho; reabrir retoma no mesmo ponto.
3. AlertDialog aparece ao sair com alterações não salvas há mais de X segundos sem salvamento.
4. Custo estimado aparece no topo antes de qualquer geração, com data da tabela de preços e aviso "estimativa".
5. Personagem/cenário/objeto/logo cadastrados uma vez podem ser reusados em qualquer vídeo do mesmo cliente/tenant.
6. Refs globais visíveis em todas as cenas; refs específicas de cena não vazam para outras cenas.
7. Limite de refs por modelo é respeitado com aviso preventivo.
8. Modo da logo (none/contextual/postproduction) persiste por cena e altera o prompt enviado ao Seedance.
9. Reordenar/duplicar/excluir cena não corrompe refs nem custo.
10. Nenhuma regressão no fluxo de conteúdo estático/carrossel avulso (fase 1 pode manter os modais antigos para esses tipos até fase 3).

## 8. Plano de implementação em etapas

**Fase 1 — Infra e migração leve (sem mudar UX)**
- Migrations: `avulso_drafts`, `seedance_pricing`, `video_references` (+ GRANT/RLS).
- Hook `useAvulsoDraft` plugado no modal atual (autosave transparente).
- CRUD de preços em `/dev/apis` + `CostBadge` embutido no modal atual.
- Entregável: rascunhos deixam de se perder; custo visível.

**Fase 2 — Inline workspace (vídeo)**
- Rotas `/avulso`, `/avulso/nova`.
- Extrair `videoScenes` do `ClientHub.tsx` para `AvulsoNova.tsx` + componentes.
- Botão "Conteúdo Avulso" passa a navegar; remove `contentHubModalOpen` para vídeo.
- Entregável: criação de vídeo em página inteira, rascunho persistente.

**Fase 3 — Biblioteca de referências**
- `/referencias-visuais` (CRUD).
- `ReferencePicker` + `GlobalRefsBar` no editor de cenas.
- Edge `generate-video-scene-seedance` aceita `sceneReferences` já resolvidas.
- Entregável: reutilização entre cenas/vídeos, ordem determinística de refs.

**Fase 4 — Logo estratégica + refino**
- `LogoModeSelector` (none/contextual/postproduction/required_on).
- Prompt builder estendido; marcador de "pós-produção pendente" no card gerado.
- Estados visuais (rascunho/pronto/gerando/erro), drag-and-drop de cenas, aviso de limite de refs.

**Fase 5 — Migrar estático/carrossel para o mesmo shell** (fora do escopo mínimo; opcional).

