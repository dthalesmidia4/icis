
## Objetivo

Simplificar o editor de cena do Seedance: eliminar dois campos que não fazem sentido no fluxo atual e fazer a IA cuidar da pronúncia sozinha ao escrever a descrição.

## O que muda na tela (Passo 2 do vídeo Seedance)

Em cada card de cena, hoje temos:

1. **Descrição da Cena (EN)** — o multi-shot completo com CUEs, incluindo as falas PT-BR entre aspas.
2. **Fala do Apresentador / Mascote (PT-BR)** — remover. As falas já vivem dentro da Descrição, dentro dos CUEs, então esse campo duplica informação e polui a interface.
3. **Dicas de pronúncia (opcional)** — remover. Ninguém preenche, e faz mais sentido a IA já escrever a fala com a grafia fonética correta na hora de gerar a Descrição.

O card fica: **Frame 0 → Descrição da Cena → Motor de vídeo → Opções Seedance**. Fim.

## O que muda na IA

A pronúncia passa a ser inferida automaticamente, sem depender de o usuário digitar nada:

- **`suggest-seedance-storyboard`** e **`generate-seedance-script`** ganham uma regra nova no system prompt: antes de escrever qualquer fala PT-BR dentro de um CUE, a IA identifica marcas, produtos, nomes próprios ou estrangeirismos presentes na ideia que provavelmente seriam mal pronunciados por um TTS/modelo de voz, e escreve **apenas a versão falada** com grafia fonética PT-BR (ex.: “SmartVety” escrito como “SmartVéti” dentro das aspas da fala). O nome original continua aparecendo normalmente no restante da descrição (visual, texto em tela, logo).
- A IA não precisa mais receber `pronunciationHints` — o campo some do payload das duas edge functions e some da chamada de `generate-video-scene-seedance`.
- O `mascot_speech_pt` que a IA já devolve continua sendo usado internamente só como fallback do extrator regex que popula a fala se algum dia precisarmos — mas nada disso aparece na UI.

## O que muda no envio para o Seedance

Hoje o prompt final concatena a Descrição com “Mascote fala: …” e “Dicas de pronúncia: …”. Com a mudança:

- O prompt enviado ao Seedance passa a ser **apenas a Descrição da Cena** (que já contém as falas com grafia fonética embutida nos CUEs).
- Removemos as concatenações de `mascotSpeech` e `pronunciationHints` em `generate-video-scene-seedance` e no builder compartilhado.

## Rascunhos existentes

Bump do `VIDEO_DRAFT_SCHEMA_VERSION` para 6 em `ClientHub.tsx`. Rascunhos antigos com os campos removidos são migrados na leitura descartando `mascot_speech` e `pronunciation_hints` — a Descrição já contém tudo o que importa.

## Detalhes técnicos

**Frontend (`src/pages/ClientHub.tsx`)**
- Tipo da cena: remover `mascot_speech` e `pronunciation_hints`.
- Remover os dois blocos de JSX (textarea da fala + input de pronúncia) do editor de cena.
- Em `applySeedanceClipsToEditor`, remover a extração por regex e o preenchimento de `mascot_speech`.
- Chamada de `generate-video-scene-seedance`: parar de enviar `mascotSpeech` e `pronunciationHints`.
- Chamada de `generate-seedance-script` (Roteiro multi-shot IA): parar de enviar `mascotSpeech`/`pronunciationHints`.
- `VIDEO_DRAFT_SCHEMA_VERSION` → 6; loader ignora chaves antigas.

**Edge Functions**
- `supabase/functions/suggest-seedance-storyboard/index.ts`: adicionar no system prompt a regra “detectar marcas/nomes provavelmente mal pronunciados e escrever a fala com grafia fonética PT-BR direto dentro do CUE, mantendo o nome original no restante do texto”. Nenhum campo novo no JSON de saída.
- `supabase/functions/generate-seedance-script/index.ts`: mesma regra; remover parâmetros `mascotSpeech` e `pronunciationHints` do `Payload` e da montagem de contexto.
- `supabase/functions/generate-video-scene-seedance/index.ts` (e helper `buildSeedancePrompt` em `_shared`, se existir): remover uso de `mascotSpeech`/`pronunciationHints` — o prompt final é a Descrição pura.

## Fora do escopo

- Nenhuma mudança em preços, motor Veo 3, storyboard de Veo, uploads de referência, logo ou identidade visual.
- Nenhuma migração de banco.
