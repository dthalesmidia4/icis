# Ajustes no editor de cenas do Seedance

Quatro pontos independentes na tela **Editar Cenas do Storyboard** (`src/pages/ClientHub.tsx`) + refinamentos nos edge functions de planejamento e otimização de roteiro.

---

## 1. Textarea da "Descrição da Cena (EN)" cresce mais

Hoje a textarea tem `min-h-[70px] resize-none` — corta o roteiro multi-shot em 3 linhas.

- Trocar por um textarea auto-resize (crescimento por `scrollHeight`), com `min-h ≈ 160px` e teto de `max-h ≈ 520px` (depois disso vira scroll interno).
- Mesmo tratamento para o campo "Fala do apresentador / mascote" (`mascot_speech`), que também tende a ficar longo.

## 2. Preservar a grafia fonética que o usuário editar

Contexto: prompt original diz "SmartVety"; o usuário edita a fala para "SmartVéti" para corrigir pronúncia. Hoje:
- `handleOptimizeSeedanceScript` (botão "Roteiro multi-shot IA") reescreve tudo em inglês e pode reverter a grafia PT-BR da fala.
- `suggest-seedance-storyboard` gera `mascot_speech_pt` do zero, sem nenhuma pista de pronúncia.

Correções:
- **Campo novo (opcional) por cena**: "Dicas de pronúncia" (`pronunciation_hints`), livre, ex.: `SmartVety → SmartVéti`. Persistido no draft (`VIDEO_DRAFT_SCHEMA_VERSION` bump para 5).
- **`generate-seedance-script`** (otimizador): receber `pronunciationHints` e instruir o modelo a: (a) manter a grafia visual em inglês (`SmartVety`) na descrição da cena e nos overlays, (b) usar a grafia fonética exatamente como o usuário escreveu dentro dos trechos `Portuguese voiceover: "…"`.
- **`suggest-seedance-storyboard`** (planner): receber `pronunciationHints` opcional e aplicar a mesma regra em `mascot_speech_pt` e no trecho de voiceover embutido dentro de `description_en`.
- **`_shared/seedance-prompt.ts` (`buildSeedancePrompt`)**: quando `pronunciationHints` estiver presente, injetar uma frase no prompt final para o Seedance: "Pronunciation guide: when speaking Portuguese, pronounce brand terms as follows — …". Assim o modelo v2 (que fala) respeita a fonética sem contaminar a grafia visual.

## 3. Personagens com imagem + voz (Seedance v2 nativo)

Hoje só existe "Usar Mascote como Frame 0" e um uploader avulso de "Amostra de voz". Seedance 2.0 aceita nativamente até 9 imagens de referência + 3 áudios de referência ligados por `@Image1 / @Audio1` — o modelo já os usa como personagem e amostra de voz.

- Adicionar bloco **"Personagens"** dentro do card de cada clipe (acima de "Motor de vídeo"), com CTA "Adicionar personagem".
- Cada personagem: 1 imagem (obrigatória) + 1 amostra de voz opcional (2–5s). Origem: biblioteca visual existente (`VideoReferencesLibrary` / `ReferencePickerModal`) — reaproveitar o picker com um novo `slot: 'character'`. Suporte a até 3 personagens por cena.
- No submit para `generate-video-scene-seedance`, mapear para: `mascotImageUrls` (imagens dos personagens) + `voiceSampleUrl` (primeira voz, já suportado pelo edge). Se houver mais de uma voz, mandar todas em um novo array `voiceSampleUrls` (o edge function passa a empurrar cada uma como `audio_url` no `content`, respeitando o limite de 3 do Seedance v2).
- O `buildSeedancePrompt` passa a rotular esses refs como `[Image N] = personagem principal / secundário` e adicionar um bloco `Voice references: [Audio 1] = voice of the main character…` quando houver.
- Ao adicionar um personagem, se o campo de fala estiver vazio, o Seedance v2 continua sem falar — a voz de referência só é usada quando existe voiceover no prompt.

## 4. Checkbox "Gerar áudio sincronizado" — clareza + logo com auto-fill

**"Gerar áudio sincronizado"**: hoje é o único gatilho que liga `generate_audio: true` no request do Seedance v2. Se desmarcado, o Seedance devolve vídeo mudo — inclusive quando há fala escrita. Correções:
- Renomear para **"Ativar áudio (voz + trilha) no vídeo"** e adicionar tooltip explicando: "Sem isso, o Seedance devolve o vídeo em mudo — mesmo que exista fala escrita."
- Quando o usuário digita `mascot_speech` ou adiciona personagem com voz, marcar automaticamente o checkbox (com aviso discreto: "Áudio ativado automaticamente porque a cena tem fala.").
- Se o modelo não for v2, esconder o checkbox (áudio nativo só existe no v2 hoje) em vez de mostrar desabilitado.

**"Logo da marca"** (seletor com "Sem logo / Contextual / Cartela final"):
- Renomear o label para **"Uso da logo no vídeo"** — o campo é estratégia de uso, não seleção de arquivo.
- Ao carregar uma cena, se o preset visual ativo (`presets.find(p => p.id === selectedPresetId)?.logo_url`) tiver logo, pré-preencher `scene.logo_ref_url` automaticamente e default para `logo_strategy: 'contextual'`. Hoje o auto-fill não acontece — daí o "Sem logo" mesmo com logo cadastrada.
- Exibir a miniatura da logo em cima do seletor (mesmo quando `logo_strategy === 'none'`, como informação) para deixar claro que a logo do cliente está carregada.

## Detalhes técnicos

**Arquivos alterados:**
- `src/pages/ClientHub.tsx` — auto-resize das textareas, campo `pronunciation_hints`, bloco Personagens, renomeações, auto-fill de logo, auto-check de áudio. Bump de `VIDEO_DRAFT_SCHEMA_VERSION` para 5 com migração transparente (draft antigo continua abrindo sem os novos campos).
- `src/components/avulso/ReferencePickerModal.tsx` — novo `slot: 'character'` (imagem + voz opcional).
- `supabase/functions/generate-seedance-script/index.ts` — aceitar `pronunciationHints`.
- `supabase/functions/suggest-seedance-storyboard/index.ts` — aceitar `pronunciationHints` e injetar no system prompt.
- `supabase/functions/_shared/seedance-prompt.ts` — novos parâmetros `pronunciationHints`, `voiceRefs[]`; rotular imagens como personagens quando aplicável.
- `supabase/functions/generate-video-scene-seedance/index.ts` — aceitar `voiceSampleUrls[]` (até 3) além do `voiceSampleUrl` legado; empurrar cada uma como `audio_url` no `content`.

**Não altera:** fluxo Veo 3.1, biblioteca de mascotes existente, tabela `seedance_pricing`.

**Referência da API usada como base:** Seedance 2.0 multi-reference (até 9 imagens, 3 vídeos, 3 áudios, ligação por `@Image1/@Audio1`) — confirmado em docs Replicate/BytePlus e PixelDojo.

## Fora do escopo (perguntas do usuário respondidas aqui)

- **"Para que serve o checkbox?"** → Ele é o único gatilho que liga áudio no Seedance v2. Vamos renomear + auto-marcar quando houver fala, para deixar isso óbvio.
- **"Onde cadastra personagem com voz?"** → Não existia. Passa a existir no bloco Personagens dentro da cena (imagem + voz), com picker reaproveitando a biblioteca visual.
- **"Frame 0 pretendia pular"** → Continua opcional; o bloco Personagens fica separado do Frame 0 e não obriga upload.