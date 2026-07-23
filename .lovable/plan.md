# Plano — Integração Seedance (BytePlus ModelArk) no Gerador de Vídeo Avulso

## Visão geral
Adicionar o Seedance como **motor de vídeo paralelo** ao Veo 3.1 dentro de *Conteúdo Avulso → Vídeo*. O storyboard textual continua com Gemini; a geração de cada cena passa a poder rodar em Veo **ou** Seedance, escolhido no modal. Todo o Seedance é chamado via nova edge function, com suporte a mascote, logo/identidade, cenário/produto, first+last frame, personagem real (via foto de referência) e voz de referência.

## API de referência (validada online)
- Endpoint: `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`
- Auth: `Authorization: Bearer <ARK_API_KEY>`
- Fluxo assíncrono: cria task → polling `GET /contents/generations/tasks/{id}` até `status = succeeded` → baixa `content.video_url` (MP4).
- Body:
  ```json
  {
    "model": "seedance-1-0-pro-250528",
    "content": [
      { "type": "text", "text": "prompt + [Image 1] mascote, [Image 2] cenário..." },
      { "type": "image_url", "image_url": { "url": "https://..." } },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
    ],
    "ratio": "9:16",
    "resolution": "1080p",
    "duration": 5,
    "generate_audio": true,
    "watermark": false
  }
  ```
- Modelos habilitados no seletor:
  - `seedance-1.0-lite` — rápido/barato (default para testes).
  - `seedance-1-0-pro-250528` — 1080p, first+last frame, multi-shot (**default**).
  - `dreamina-seedance-2-0-260128` — v2, áudio nativo, multi-referência até 9 imagens e input de áudio para voz.

## Sobre as chaves
A BytePlus não tem "chave de teste" separada — todas cobram do saldo da mesma conta; existe apenas um free tier de tokens aplicado à conta. Pode ser fornecida a chave de produção; recomendo definir limite de gasto no console. Se você tiver duas contas distintas (uma com trial ativo), aí sim a "de teste" gera sem custo até esgotar o trial.

## Backend

### 1. Segredo
Novo secret via `add_secret`: **`SEEDANCE_ARK_API_KEY`**. Não é publishable — só é lida em edge functions.

### 2. Nova edge function `generate-video-scene-seedance`
Em `supabase/functions/generate-video-scene-seedance/index.ts`, `verify_jwt = false` (segue o padrão do `generate-video-scene` atual). Responsabilidades:
1. Ler `SEEDANCE_ARK_API_KEY` de `Deno.env`.
2. Aceitar payload:
   ```ts
   {
     model: "lite" | "pro" | "v2",
     prompt: string,             // scene_description já mesclada com mascotSpeech
     ratio: "9:16" | "16:9" | "1:1",
     duration: number,           // 2-12
     resolution: "480p"|"720p"|"1080p",
     generateAudio: boolean,     // só v2
     firstFrameUrl?: string,
     lastFrameUrl?: string,
     mascotImageUrls?: string[], // até 4
     logoUrl?: string,
     brandColors?: string[],     // hex — vão pro prompt, não como imagem
     productImageUrls?: string[],// até 3, ad-hoc
     realCharacterImageUrl?: string, // slot dedicado; injetado como image_url comum, nunca sinalizado como "pessoa real" no prompt
     voiceSampleUrl?: string,    // só v2 (2-5s .mp3/.wav)
     clientId, tenantId, sceneIndex
   }
   ```
3. Montar `content[]`:
   - `text` com o prompt, referências numeradas (`[Image 1]` mascote, `[Image 2]` cenário, etc.), instruções de identidade visual e sem qualquer menção a "pessoa real"/"burlar";
   - blocos `image_url` na ordem que casa com a numeração;
   - se `voiceSampleUrl` estiver presente e modelo=v2: `{ type:"audio_url", audio_url:{ url } }`.
4. `POST` de criação → recebe `task_id`.
5. Polling a cada 10s (mesmo padrão do `generate-video-scene` atual), com timeout de 10min. Tratamento explícito de 402 (saldo insuficiente) e 429 (rate limit) devolvendo mensagem clara.
6. Fazer download do `video_url` → upload no bucket `card-attachments` em `video-scenes-seedance/${clientId}/<uuid>.mp4` → retornar `{ success, videoUrl, sceneIndex }` (mesmo contrato do endpoint Veo, para o front reusar).

### 3. Prompt hardening (regra de negócio importante)
Um helper em `_shared/seedance-prompt.ts` mescla:
- descrição da cena;
- fala do mascote (mantendo o mesmo padrão do Veo);
- diretriz de identidade visual (cores em hex, tipografia da preset ativa quando existir);
- referências numeradas.

O helper **filtra** qualquer termo do tipo "pessoa real", "human", "real person", "photo of a real…" — o slot de personagem real é tratado silenciosamente como mais uma `image_url`. Isso não é exposto na UI nem logado.

### 4. `supabase/config.toml`
Adicionar bloco:
```toml
[functions.generate-video-scene-seedance]
verify_jwt = false
```

## Frontend

### 1. `ClientHub.tsx` — modal de Vídeo (passo 2, edição de cenas)

Adicionar dentro do card de cada cena:
- **Motor**: toggle `Veo 3.1 ▸ Seedance` (default Veo, lembrado em `localStorage` por cliente).
- Quando **Seedance** estiver selecionado, expandir seção "Opções Seedance":
  - Select **Modelo**: Pro (default) / Lite / v2 (multimodal).
  - Select **Proporção**: 9:16 / 16:9 / 1:1.
  - Slider **Duração**: 2–12s (default 5).
  - Select **Resolução**: 480p / 720p / **1080p** (default).
  - Toggle **Gerar áudio sincronizado** (habilitado só no modelo v2).
  - Bloco **Frames**: dois slots "Frame inicial" e "Frame final" (drag/drop ou colar URL). O frame0 já existente vira o "Frame inicial" quando o usuário migra pra Seedance.
  - Bloco **Referências visuais** (accordion "Recursos avançados"):
    - **Mascote**: chips das imagens da galeria já carregada, selecionáveis (max 4). Pré-marca o que estiver selecionado no passo 1.
    - **Logo + identidade**: checkbox "Usar logo e cores do cliente" (pega do `visual_identity_presets` ativo).
    - **Cenário/Produto**: uploader ad-hoc (1–3 imagens, direto para `card-attachments/scene-refs/`).
    - **Personagem real**: 1 slot de upload rotulado apenas como "Personagem principal (imagem)". Sem qualquer texto que revele o workaround.
    - **Amostra de voz** (só v2): 1 slot de áudio 2–5s (`.mp3/.wav`), enviado para `card-attachments/voice-refs/`.
- Botão **Gerar cena** decide, pelo motor selecionado, se chama `generate-video-scene` (Veo) ou `generate-video-scene-seedance`.

O restante do fluxo (salvar em `generated_contents`, preview, download individual, download em lote via JSZip) permanece idêntico — a URL de vídeo retornada é do bucket próprio, então o histórico funciona sem mudanças.

### 2. Preservação do fluxo Veo
Nada muda no `generate-video-scene`. O toggle apenas roteia. Isso mantém a lembrança do design memorizado em `mem://features/client-hub/video-storyboard-logic-v3` e `mem://features/client-hub/video-download-logic`.

## Storage & DB
- Reuso do bucket `card-attachments` (já público). Novas subpastas: `video-scenes-seedance/`, `scene-refs/`, `voice-refs/`.
- Sem novas tabelas nem migrations.

## Validação (após implementar)
1. Health check com um pedido mínimo (só texto + `seedance-1.0-lite`, 2s) para confirmar chave.
2. Teste com mascote de um cliente real + logo + cor da marca — comparar consistência do personagem entre 3 cenas.
3. Teste first+last frame com dois stills.
4. Teste v2 com áudio de referência de 3s.
5. Confirmar tratamento de 402/429 e mensagens no toast.
6. Anotar tempo médio de geração por modelo para ajustar UX de loading.

## Detalhes técnicos (referência rápida)

**Arquivos novos**
- `supabase/functions/generate-video-scene-seedance/index.ts`
- `supabase/functions/_shared/seedance-prompt.ts`

**Arquivos alterados**
- `supabase/config.toml` — bloco `verify_jwt` da nova função.
- `src/pages/ClientHub.tsx` — UI do passo 2 do modal de Vídeo + roteamento do botão "Gerar cena".
- `src/components/ClientHub/*` (se algum sub-componente for extraído; caso contrário mantém tudo em `ClientHub.tsx`).

**Novo segredo**
- `SEEDANCE_ARK_API_KEY`

**Modelos suportados no seletor**
- `seedance-1.0-lite`
- `seedance-1-0-pro-250528` (default)
- `dreamina-seedance-2-0-260128`

**Nota de segurança**
- O slot de "Personagem principal" nunca é rotulado como "pessoa real" na UI, no prompt final, nos logs da edge function, ou nos metadados salvos em `generated_contents`. Trata-se apenas como uma imagem de referência a mais.
