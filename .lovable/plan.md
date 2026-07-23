## Problemas identificados

**1. Ordem invertida — o storyboard é gerado sem saber a duração.**
Hoje o Passo 1 pede apenas ideia + motor. Só no Passo 2 (editor de cenas) o usuário escolhe modelo/resolução/duração do Seedance. Como o AI planner (`suggest-seedance-storyboard`) recebe apenas `model` mas nenhuma duração-alvo, ele escolhe um `target_duration_seconds` aleatório entre 5–15s e monta CUE blocks proporcionalmente. Resultado: script imprevisível — pode gerar 3 tomadas para 5s (apertado) ou 5 tomadas para 15s.

**2. Recursos nativos do Seedance subutilizados no briefing.**
A edge function `generate-video-scene-seedance` já aceita `mascotImageUrls`, `logoUrl`, `productImageUrls`, `realCharacterImageUrl`, `voiceSampleUrl`, `brandColors`, `logoStrategy`. Mas no fluxo Seedance do Passo 1 hoje o usuário só define: ideia, formato, preset visual e mascotes selecionados. Falta:
- Personagens de referência (a "biblioteca de referências" `VideoReferencesLibrary` — kind `character`/`product`/`scene` — só está sendo puxada no fluxo Veo, não no Seedance).
- Amostra de voz (v2 aceita `audio_url`).
- Estratégia da logo (contextual / end card / nenhuma).
- Fala do apresentador/mascote (usada como `mascotSpeech` no prompt).

Além disso o planner (`suggest-seedance-storyboard`) não recebe essas informações, então o script gerado não incorpora fala, logo strategy nem referências.

**3. Tabela `seedance_pricing` desalinhada com o site oficial.**
Valores atuais estão em escala errada (0.15 créditos/s → 2.3 créditos em 15s). O site https://seedance2.ai/pt/pricing publica em créditos internos de plataforma (USD $0.016–$0.019 por crédito). Valores corretos (sem entrada de vídeo):

| Modelo             | 480p | 720p | 1080p | 4K  |
| ------------------ | ---- | ---- | ----- | --- |
| Seedance 2.0       | 6    | 12   | 30    | 70  |
| Seedance 2.0 Fast  | 5    | 10   | —     | —   |
| Seedance 2.0 Mini  | 3    | 6    | —     | —   |
| Seedance 1.5 Pro   | 2    | 5    | 10    | —   |
| Seedance 1.0 Pro   | 2    | 5    | 10    | —   |
| Seedance 1.0 Lite  | 1    | 3    | 8     | —   |

Preço BRL/crédito: $0.016 (plano Padrão) × ~5.4 BRL/USD ≈ **R$ 0,087/crédito**.

---

## Plano de correção

### A. Passo 1 do Storyboard Seedance passa a coletar os parâmetros técnicos e criativos ANTES do script
Em `src/pages/ClientHub.tsx`, quando `videoEngineChoice === 'seedance'` no Passo 1, expandir o formulário com:
- **Modelo Seedance** (Seedance 2.0 / 2.0 Fast / 2.0 Mini / 1.5 Pro / 1.0 Pro / 1.0 Lite) — hoje só existe `lite|pro|v2`.
- **Resolução** (por modelo).
- **Duração alvo** (slider dentro do range do modelo).
- **Áudio sincronizado** (só v2/2.0).
- **Referências criativas**: seletor da biblioteca `video_references` filtrado por `kind` (personagem, produto, cenário) + mascotes já existentes.
- **Fala do apresentador/mascote** (textarea PT-BR).
- **Estratégia de logo** (nenhuma / contextual / end card) quando há logo no preset.
- **Amostra de voz** (upload, apenas v2/2.0).
- `CostBadge` exibindo custo previsto reagindo em tempo real ao modelo/resolução/duração.

O Passo 2 (editor de cenas) deixa de expor "Opções Seedance" na primeira geração — vira só ajuste fino por clipe.

### B. Planner recebe a duração e todos os inputs criativos
`supabase/functions/suggest-seedance-storyboard/index.ts`:
- Aceitar `targetDurationSeconds`, `mascotSpeech`, `hasLogo`, `logoStrategy`, `brandColors`, `refs` (com kinds).
- Alterar o system prompt para: "**A duração TOTAL de cada clipe já foi definida pelo usuário — use exatamente esse valor**. Distribua as CUE blocks para caber. Se o usuário pediu 5s, planeje 2 CUEs curtas; se 15s, planeje 4–5 CUEs bem paceadas."
- Injetar a `mascotSpeech` como diálogo obrigatório em pelo menos uma CUE.
- Incluir marcadores das referências ("Reference [Image N] = product/character/mascot") no script para o modelo saber onde inserir cada elemento.
- Manter cache de 24h por `period_plan_id` como já existe.

### C. Editor de cenas (Passo 2) reforça o mesmo prompt builder
Confirmar que `generate-video-scene-seedance` continua recebendo todos os campos coletados no Passo 1 sem regressão (mascote, voz, personagem, produtos, logo strategy).

### D. Corrigir pricing seed (migration)
Nova migration `update_seedance_pricing_official`:
- Truncate `seedance_pricing`.
- Reinserir as 15 linhas oficiais da tabela acima com `price_credits_per_second` e `price_brl_per_credit = 0.087`.
- Adicionar coluna `model_label` (Seedance 2.0 Fast, Seedance 1.5 Pro, etc.) para o UI mostrar o nome oficial.
- Estender enum de modelo no frontend/backend de `lite|pro|v2` para chaves oficiais: `s2`, `s2_fast`, `s2_mini`, `s15_pro`, `s10_pro`, `s10_lite`. Mapear cada uma para o `modelId` da Ark API (`MODEL_ID` em `generate-video-scene-seedance`).

### E. Validação
Após implementar, rodar 1 sugestão real com duração fixada em 10s e verificar que:
- `target_duration_seconds` = 10 em todos os clipes retornados.
- CUE blocks somam 10.
- `mascotSpeech` aparece em pelo menos uma CUE.
- `CostBadge` recalcula ao mudar modelo/resolução (ex: Seedance 2.0 720p 10s → 120 créditos ≈ R$ 10,44).

### Arquivos afetados
- `src/pages/ClientHub.tsx` (Passo 1 Seedance expandido, novo enum de modelos)
- `supabase/functions/suggest-seedance-storyboard/index.ts` (payload + prompt)
- `supabase/functions/generate-video-scene-seedance/index.ts` (mapeamento novo dos 6 modelos)
- `supabase/functions/_shared/seedance-prompt.ts` (aceitar `targetDurationSeconds` para reforçar no prompt)
- `src/hooks/useSeedancePricing.ts` + `src/components/avulso/CostBadge.tsx` (nova key de modelo)
- `src/components/dev/SeedancePricingManager.tsx` (coluna `model_label`)
- Migration nova em `supabase/migrations/`
