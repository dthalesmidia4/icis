
## Contexto

Três ajustes independentes no fluxo de vídeo do Client Hub:

1. **Fluxo Seedance por ideia (não por contagem manual)** — Seedance é caro; hoje o usuário escolhe 1–5 cenas antes mesmo de a IA analisar a ideia. Vamos pedir a IA para decidir quantos clipes o storyboard precisa (na maioria dos casos: **1 clipe com multi-shot dentro dos 15s**; só divide em 2+ quando a narrativa não cabe).
2. **Preencher a tabela `seedance_pricing`** com os preços oficiais BytePlus/ByteDance (fonte: docs.byteplus.com/docs/ModelArk/1099320) — hoje `CostBadge` renderiza "Custo não configurado".
3. **Bug: rascunho antigo não descarta** — `useAvulsoDraft` hidrata o modal e não é limpo quando o usuário fecha, então o storyboard antigo (estrutura legada) volta toda vez. Já visível no print (toast "Rascunho de vídeo restaurado").

---

## 1) Ideação Seedance dirigida por IA

### UX

Em `ClientHub.tsx`, no **passo 1 do modal de vídeo**, adicionar um seletor de motor **no topo** (Veo 3.1 / Seedance) — default **Seedance**.

- **Veo 3.1 selecionado** → mantém o fluxo atual (idea + contagem manual de cenas 1–5 + `generate-video-storyboard`).
- **Seedance selecionado** → esconde o seletor "Quantas cenas?" e a interface passa a ser:
  - Textarea da ideia + formato (9:16 / 16:9 / etc.) + mascotes/preset como hoje.
  - Botão único: **"Planejar storyboard Seedance"** (chama a nova edge function abaixo).
  - Depois de responder, mostra uma prévia inline com **"IA sugere: 1 clipe multi-shot de 15s"** (ou 2 clipes, etc.) + resumo do que cada clipe cobrirá, com botão **"Ajustar (usar N clipes)"** caso o usuário queira forçar outro número.
  - Ao confirmar, entra no passo 2 com `videoScenes[]` já populado — cada cena com `engine='seedance'`, `seedance_model`, `seedance_duration`, `scene_description` já em formato multi-shot com CUEs.

### Nova edge function `suggest-seedance-storyboard`

Usa `openai/gpt-5.6-terra` via Lovable AI Gateway (mesmo padrão do `generate-seedance-script`). Recebe:

```ts
{ tenantId, clientId, idea, ratio, model: 'lite'|'pro'|'v2', clientNiche?, mascotSpeech? }
```

System prompt (resumo — vira uma key `seedance_storyboard_planner` em `system_prompts` com fallback embutido):

> Você planeja produções em Seedance. Seedance gera **1 clipe contínuo por prompt**, mas entende multi-shot com `[cut to]` e blocos CUE, então quase toda ideia cabe em **1 clipe único** (5–10s no Pro/Lite, 4–15s no v2). Só divida em 2+ clipes quando a narrativa realmente exigir (ex.: comercial completo com abertura + meio + call-to-action distintos, ou +15s de conteúdo). Priorize sempre **menos clipes** — custo é o principal fator. Retorne JSON estrito com `suggested_clip_count` (1–3), `reasoning` (1 frase, PT-BR, explicando o porquê para o usuário), e `clips[]` com `{ title_pt, description_en (prompt multi-shot com CUEs), target_duration_seconds }`.

Retorna JSON parseado manualmente (sem `Output.object`) — segue a orientação do knowledge para schemas dinâmicos. Fallback: se o parse falhar, retorna 1 clipe único com `description_en = idea` traduzida.

### Migração da estrutura de storyboard existente

- Manter `sceneCount` state para o fluxo Veo.
- Novo state `videoEngineChoice: 'veo' | 'seedance'` no passo 1.
- Persistido no draft junto do resto.

---

## 2) Preencher `seedance_pricing` com os preços oficiais BytePlus

Fonte: `https://docs.byteplus.com/docs/ModelArk/1099320` (tabelas oficiais em USD/segundo).

Migration `INSERT ... ON CONFLICT (model_key, resolution) DO UPDATE` populando:

| model_key | resolution | USD/s (BytePlus) | credits/s | BRL/credit |
|---|---|---|---|---|
| `lite` (seedance-1-0-pro-fast) | 480p | $0.010 | 0.010 | 5.50 |
| `lite` | 720p | $0.020 | 0.020 | 5.50 |
| `lite` | 1080p | $0.048 | 0.048 | 5.50 |
| `pro` (seedance-1-0-pro-250528) | 480p | $0.024 | 0.024 | 5.50 |
| `pro` | 720p | $0.052 | 0.052 | 5.50 |
| `pro` | 1080p | $0.122 | 0.122 | 5.50 |
| `v2` (dreamina-seedance-2-0-260128) | 480p | $0.070 | 0.070 | 5.50 |
| `v2` | 720p | $0.150 | 0.150 | 5.50 |
| `v2` | 1080p | $0.370 | 0.370 | 5.50 |

- **Unidade de "crédito"** = 1 USD (mantém `credits/s == USD/s`).
- **`price_brl_per_credit = 5.50`** (câmbio conservador ~R$ 5,50 / USD; qualquer super_admin edita depois em `/dev/apis`).
- `notes` = link para a doc BytePlus.

Assim `CostBadge` passa a exibir, por ex., `≈ 0.61 créditos · R$ 3,36` para um Pro 1080p @ 5s.

---

## 3) Fix: rascunho de vídeo travado com estrutura antiga

### Diagnóstico

- `useAvulsoDraft` grava `state` em `avulso_drafts` a cada 800ms enquanto o modal está aberto.
- No `onOpenChange(false)` do `Dialog` só limpamos estado local (`setVideoScenes([])`, etc.), **nunca chamamos `clearDraft`**.
- No próximo `open`, o hook hidrata a última row → dispara o toast "Rascunho de vídeo restaurado" e cravajar as cenas antigas — inclusive cenas geradas na estrutura pré-Seedance sem `engine`, o que quebra os controles novos.

### Correções

1. Expor `clearDraft` do hook para fora (já retorna, mas não é usado).
2. **Botão explícito "Descartar rascunho"** no header do modal, visível apenas quando `videoDraftHydrated` existe. Ao clicar: `await clearDraft()` + resetar todos os `useState` do vídeo + toast "Rascunho descartado".
3. **Auto-descarte em schema legacy**: injetar `schema_version: 2` no `videoDraftSnapshot`. No `useEffect` de hidratação, se `hydrated?.schema_version !== 2` → `clearDraft()` silencioso e não aplicar nenhum estado antigo. Cobre todos os rascunhos legados existentes sem exigir intervenção do usuário.
4. **Descartar rascunho também no botão "Voltar"** (ChevronLeft já reseta local — adicionar `clearDraft`) e ao concluir com sucesso (opcional — usuário sabe que gerou o card).

---

## Arquivos alterados

- `supabase/functions/suggest-seedance-storyboard/index.ts` (novo).
- `src/pages/ClientHub.tsx`: seletor de motor no passo 1, chamada da nova função, aplicação das cenas sugeridas, botão "Descartar rascunho", `schema_version` no snapshot, guard de versão na hidratação.
- `src/hooks/useAvulsoDraft.ts`: nenhuma mudança (`clearDraft` já existe).
- Migration `seed_seedance_pricing.sql`: `INSERT ... ON CONFLICT` das 9 linhas.

## Fora do escopo

- Não mexer no fluxo Veo (storyboard cena-a-cena continua igual).
- Não alterar o handler `handleOptimizeSeedanceScript` — continua disponível por cena para refinar depois.
- Não trocar unidade de "crédito" no `seedance_pricing` (mantém 1 crédito = 1 USD; se o usuário quiser normalizar para créditos Lovable no futuro, é outra rodada).
