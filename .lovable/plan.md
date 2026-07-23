## Contexto verificado

Pesquisa nas docs oficiais (BytePlus/ByteDance/Dreamina, Runware, Segmind, Apiframe, useapi):

- **Seedance 1.0 pro / lite**: clipes de **5 a 10s** (não 12s). Multi-shot é **nativo em UM único prompt**, usando sintaxe como `[Shot 1] ... [cut to] ... [Low-angle shot] ...`. O modelo entende transições, cortes e movimentos de câmera dentro do mesmo prompt. Não existe "cena isolada" na API — quem gera múltiplas cenas é o próprio modelo.
- **Dreamina Seedance 2.0** (`dreamina-seedance-2-0-260128`): **4 a 15s**, 720p/1080p/4k, omni-reference (imagens + vídeos + áudio), first/last frame.
- **Veo 3.1**: continua no modelo cena-a-cena de ~8s — o storyboard atual faz sentido para ele.

Confirmado no código atual (`generate-video-scene-seedance/index.ts` linha 131): estamos clampando duração a `Math.max(2, Math.min(12, ...))` — **está errado** para os dois motores (1.x = 10 máx, v2 = 15 máx, mín 4).

Conclusão: a estrutura atual (storyboard → N cenas → gerar cada cena em Seedance) força o Seedance a operar como Veo, desperdiçando sua principal força (multi-shot coeso) e ainda erra os limites de duração.

## O que muda

### 1. Bifurcar o fluxo por motor logo no início

Ao clicar **Criar → Vídeo** no Client Hub, primeira pergunta passa a ser **Motor de vídeo** (Veo 3.1 vs Seedance) — antes de qualquer coisa. A partir daí:

- **Veo 3.1** → mantém exatamente o fluxo atual (Ideia → Storyboard por cenas → Editar cenas → Gerar cada cena de ~8s). Nenhuma mudança de UX aqui.
- **Seedance** → novo fluxo de **prompt único multi-shot** (abaixo).

### 2. Novo fluxo Seedance (substitui o storyboard por cenas)

Três passos inline (não modal com sub-cenas):

**Passo A — Ideia + parâmetros globais**
- Textarea "Ideia do vídeo" (livre, PT-BR).
- Modelo: Lite (720p) / Pro 1.0 (1080p, first+last) / Dreamina 2.0 (v2, até 4k, áudio, omni-ref).
- Formato: 9:16 / 16:9 / 1:1 / 4:5 / 21:9 (v2) / adaptive.
- Resolução conforme modelo (Lite 480–720p; Pro 480–1080p; v2 720p/1080p/4k).
- **Duração** com limites reais:
  - Lite/Pro 1.x → slider **5–10s**.
  - Dreamina 2.0 → slider **4–15s**.
- Áudio sincronizado (v2 apenas).
- Referências globais (uma única lista, não por cena): personagem principal (biblioteca), mascote, cenário, produtos, logo + estratégia (nenhum / contextual / end card), first frame, last frame (Pro 1.x e v2), voice sample (v2).
- `CostBadge` já reflete duração×resolução×modelo.

**Passo B — Roteiro multi-shot gerado por IA**
- Botão **"Gerar roteiro multi-shot"** chama uma nova edge function `generate-seedance-script` que:
  - Modelo: **`openai/gpt-5.6-terra`** via AI Gateway (`reasoning_effort: "none"`, chat completions).
  - Recebe: ideia, identidade visual, mascote, duração alvo, formato, contexto do cliente (nicho, tom).
  - Devolve **um único prompt em inglês** estruturado no formato nativo Seedance:
    - Bloco de audiência/estilo/aspecto.
    - Sequência de shots numerados com timestamps (`CUE 0–3s`, `CUE 3–7s`…) somando a duração escolhida.
    - Diretrizes de câmera entre colchetes (`[Medium shot]`, `[Low-angle shot]`, `[cut to]`, `[dolly in]`).
    - Fala do mascote/personagem entre aspas em PT-BR quando aplicável.
    - Referências numeradas `[Image 1]…` alinhadas às imagens enviadas (reaproveita `buildSeedancePrompt`).
- Editor de texto rico e simples (textarea grande) para o usuário revisar/ajustar o roteiro antes de gerar.
- Persistido em `avulso_drafts` (`content_type: 'seedance_video'`) — autosave do hook existente.

**Passo C — Geração única**
- Um único botão **"Gerar vídeo"** dispara `generate-video-scene-seedance` **uma vez**, com o prompt final + todas as refs globais. Sem loop de cenas.
- Resultado: 1 arquivo MP4. Player + botão **Finalizar** (cria card), padrão dos outros conteúdos.

### 3. Ajustes na edge function `generate-video-scene-seedance`
- Clamp de duração passa a depender do modelo: `lite/pro` → 5–10, `v2` → 4–15.
- Sem outras mudanças estruturais (o prompt builder e refs continuam válidos).

### 4. Nova edge function `generate-seedance-script`
- Input: `{ tenantId, clientId, idea, durationSeconds, model, ratio, visualIdentity, mascot, refs[] }`.
- Chama Gateway `openai/gpt-5.6-terra` com system prompt salvo em `system_prompts` (nova chave `seedance_multishot_script`) para permitir edição em `/dev/prompts`.
- Retorna `{ prompt, shotsSummary[] }` (o `shotsSummary` é só metadata para exibir uma timeline visual leve no passo B — não outra chamada de vídeo).

### 5. Pricing e limites
- `SeedancePricingManager` continua igual; só reforço no seed default (Pro 1080p, Lite 720p, v2 1080p) — sem migração obrigatória.

## Arquivos afetados

- `src/pages/ClientHub.tsx` — bifurcar fluxo, novo passo Seedance (Ideia → Roteiro → Gerar), remover editor de cenas quando motor = Seedance.
- `src/hooks/useAvulsoDraft.ts` — sem mudança de assinatura, só novo `content_type`.
- `supabase/functions/generate-video-scene-seedance/index.ts` — clamp de duração por modelo.
- `supabase/functions/generate-seedance-script/index.ts` — **nova**.
- `supabase/functions/_shared/system-prompts.ts` — nova chave `seedance_multishot_script`.
- `supabase/functions/_shared/seedance-prompt.ts` — sem mudança (já lida com refs numeradas).
- `src/pages/DevPrompts.tsx` — expõe a nova chave automaticamente (CRUD já é dinâmico).

## Fora de escopo

- Nenhuma mudança no fluxo Veo 3.1.
- Sem migração de dados de storyboards antigos.
- Sem alteração no CostBadge (fórmula continua válida).

## Validação após implementação

1. Motor Veo continua com storyboard por cenas idêntico ao atual.
2. Motor Seedance mostra apenas Ideia → Roteiro (gerado por gpt-5.6-terra) → Gerar vídeo único.
3. Slider de duração respeita 5–10 (1.x) ou 4–15 (v2).
4. Uma geração real de teste devolve MP4 e cria card via **Finalizar**.
