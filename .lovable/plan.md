# Plano — Ritmo de fala, boas práticas Seedance e correções de logo/ID visual

## 1. Ritmo da fala em clipes de 10–15s

**Problema**: em um clipe de 15s com 5 CUEs, a IA está gerando muito texto por CUE. O locutor teria que falar em ~2× a velocidade natural, resultando em fala acelerada/inaudível.

**Correção no `suggest-seedance-storyboard`**:
- Adicionar ao system prompt um **orçamento de palavras** rígido: PT-BR ≈ **2,3 palavras/segundo** de fala natural. Cada CUE tem `duration_s`; o texto entre aspas do `Portuguese spoken dialogue:` daquele CUE **não pode ultrapassar `round(duration_s × 2.3)` palavras**.
- Permitir **CUEs sem fala** (só ação/visual) — a IA hoje força fala em todos, o que empurra texto excedente. Regra: use fala apenas onde agrega; caso contrário deixe o CUE puramente visual com legenda gráfica curta.
- Validação pós-modelo (determinística) em `_shared/format-seedance-script.ts`:
  - Extrair cada `Portuguese spoken dialogue:` por CUE, contar palavras, e se exceder o orçamento marcar `dialogue_over_budget: true` no clipe e cortar após o limite com reticências mantendo a última frase completa.
  - Retornar aviso na UI (`ClientHub.tsx`) por clipe: chip amarelo "Fala longa para X s — pode acelerar".

## 2. Boas práticas Seedance no prompt

Aplicar no system prompt do `suggest-seedance-storyboard` e no builder `_shared/seedance-prompt.ts`:
- Estrutura **Sujeito → Ação → Cenário → Câmera/Shot** por CUE (padrão recomendado pela BytePlus/Dreamina).
- Especificar **tipo de plano** ([Wide], [Medium], [Close-up], [Over-the-shoulder], [POV]) e **movimento de câmera** ([static], [slow push-in], [pan left], [tilt down], [handheld]) em cada CUE.
- Um `[cut to]` por CUE, exceto o primeiro. Descrever apenas UMA ação principal por CUE.
- Proibir adjetivos abstratos ("bonito", "incrível"); exigir verbos observáveis.
- Reforçar consistência entre CUEs: mesmo personagem/cenário/iluminação salvo mudança explícita.
- Bloco de "Negative prompt" opcional: `no warped faces, no text glitches, no extra fingers, no logo distortion`.

## 3. Botão "Trocar" logo — não trocava

**Problema**: hoje "Trocar" só abre o `ReferencePickerModal` filtrado em `logo`, mas o cliente não tem logos cadastradas na Biblioteca Visual (imagem 468), então o modal fica vazio e sem ação.

**Correção em `src/pages/ClientHub.tsx` (painel da cena Seedance)**:
- Transformar o botão "Trocar" em um menu com 3 opções:
  1. **Enviar arquivo** — input `<input type="file" accept="image/*">` que sobe pro bucket `card-attachments` (já usamos `handleUploadSceneAsset`) e seta `scene.logo_ref_url`. Cena-específico, sem cadastrar na biblioteca.
  2. **Escolher da biblioteca** — abre o `ReferencePickerModal` filtrado em `logo` (comportamento atual).
  3. **Salvar na biblioteca** — atalho para abrir `/referencias-visuais` já com `kind=logo` e cliente atual pré-selecionados (via query string).
- Manter a logo padrão do `tenant_companies.logo_url` como fallback quando `logo_ref_url` é vazio (já funciona).

## 4. Cadastrar múltiplas versões de logo (na Biblioteca Visual)

A tabela `video_references` já suporta `primary_image_url` + `extra_image_urls[]`. O que falta:
- Em `VideoReferencesLibrary.tsx`, quando `kind=logo`: renomear labels para "Versão principal" e "Variações (cores/negativa/monocromática)" e destacar o suporte a múltiplas imagens.
- Ao usar no scene picker, se a entrada tiver `extra_image_urls`, mostrar thumbnails para o usuário escolher **qual versão** aplicar naquela cena.

## 5. Checkbox "Usar cores da identidade visual" travado

**Diagnóstico**: o checkbox está `disabled={!selectedPresetId}`. Como o preset não estava carregado (item 6), o checkbox ficou preso mesmo com identidade cadastrada em `tenant_companies.brand_*`.

**Correção**:
- Desacoplar o checkbox do preset: se `presets.length === 0` mas o cliente tem `brand_primary_color/secondary/highlight` em `tenant_companies`, permitir marcar o checkbox usando essas cores diretamente. O `handleGenerateScene` já resolve o preset; adicionar fallback para pegar as cores da company quando não há preset selecionado.
- Auto-selecionar o primeiro preset assim que `presets` carrega e nenhum está escolhido (já existe em `refetchPresets`, mas não dispara ao voltar de outra tela — garantir que o `useEffect` roda no montagem do painel de vídeo).

## 6. Presets duplicados / sumindo na primeira abertura

**Diagnóstico** (verificado por query em `visual_identity_presets`): o SmartVety tinha **duas linhas "Principal"** — a antiga (`e133e6ae…`, 15:17) e a que o usuário salvou de novo (`bd283704…`, 19:14). Ambas com o mesmo `company_id` e `tenant_id`. O primeiro fetch retornou vazio para o usuário → ele salvou de novo → o realtime disparou o refetch e aí ambas apareceram. Não é bug de RLS; é **race**: o `refetchPresets` do `ClientHub.tsx` roda em `useEffect` com `[selectedClient?.id, tenantId]`, mas em alguns fluxos o `tenantId` chega depois do `selectedClient`, e o primeiro fetch é abortado por `if (!tenantId) return`. O `VisualIdentityModal.fetchPresets` só roda ao abrir o modal — se o modal foi aberto antes do `tenantId` propagar via contexto, o SELECT filtra corretamente mas o auth JWT sem `tenant_id` retorna 0 linhas pela RLS.

**Correção**:
- Em `ClientHub.tsx`, transformar `refetchPresets` numa função que **aguarda `tenantId` via poll curto** (200ms × 5 tentativas) antes de desistir; e re-executar no `focus`/`visibilitychange` da aba.
- Em `VisualIdentityModal.tsx`, chamar `fetchPresets` também quando `tenantId` muda de nulo → definido enquanto o modal está aberto.
- Adicionar **deduplicação por (company_id, name)** no `handleSaveVisual`: se já existir preset com mesmo nome, fazer `UPDATE` em vez de `INSERT` para evitar duplicatas.
- Migração de limpeza (opcional, sob confirmação do usuário): consolidar duplicatas do SmartVety mantendo a mais recente. Fica fora deste plano até você aprovar.

## Detalhes técnicos

- **Arquivos alterados**:
  - `supabase/functions/suggest-seedance-storyboard/index.ts` — novo system prompt (boas práticas + orçamento de palavras).
  - `supabase/functions/_shared/format-seedance-script.ts` — validador de orçamento por CUE + truncamento seguro.
  - `supabase/functions/_shared/seedance-prompt.ts` — bloco de boas práticas anexado ao prompt final enviado ao ARK.
  - `src/pages/ClientHub.tsx` — menu "Trocar" com 3 ações; desacoplar checkbox de identidade; chip de aviso de fala longa; poll de `tenantId` em `refetchPresets`.
  - `src/pages/VideoReferencesLibrary.tsx` — labels específicos para `kind=logo` + preview de `extra_image_urls`.
  - `src/components/avulso/ReferencePickerModal.tsx` — mostrar variações quando existirem.
  - `src/components/VisualIdentityModal.tsx` — refetch em mudança de `tenantId`; upsert por nome no save.

- **Sem migração de schema**. Toda a estrutura de `video_references` e `visual_identity_presets` já suporta o que precisamos.

- **Fora de escopo**: consolidar as duplicatas existentes de presets no banco (peço sua confirmação depois).
