## Diagnóstico

Não é regressão de código. As duas últimas tentativas (17:09 e 17:14 UTC) foram bloqueadas pelo **filtro RAI (Responsible AI)** do Veo 3.1, com o motivo:

> "Sorry, we can't create videos from input images containing celebrity or their likenesses. Please remove the reference and try again."

O Veo classificou o mascote (foto realista de advogado em terno) como semelhança de celebridade. A operação chega a `done: true` no Google, mas retorna `raiMediaFilteredCount: 1` em vez de vídeos.

O código atual joga isso no branch genérico "Nenhum vídeo gerado" com status 500 (linha 169-175 de `supabase/functions/generate-video-scene/index.ts`), então o usuário vê só `FunctionsHttpError` no console e um toast "Erro ao gerar Cena 1" — sem entender que precisa trocar a imagem.

## Correção

Editar `supabase/functions/generate-video-scene/index.ts` para detectar `raiMediaFilteredReasons` / `raiMediaFilteredCount` no `result.response.generateVideoResponse` e retornar uma resposta clara:

- Status `400` (não 500 — foi input do usuário, não falha do servidor).
- Mensagem em português explicando que o Veo bloqueou a imagem por política de segurança (semelhança com pessoa real / celebridade) e sugerindo trocar o Frame 0 por um mascote ilustrado/estilizado ou remover a foto de referência.
- Incluir a razão original do Veo (em campo separado) para debug, sem expor no toast principal.

Também melhorar o toast no front (componente que chama `generate-video-scene` em `ClientHub.tsx` da tela de storyboard Seedance/Veo) para ler `error` da resposta JSON e mostrar a mensagem retornada em vez do genérico "Erro ao gerar Cena X".

## Arquivos

1. `supabase/functions/generate-video-scene/index.ts` — bloco de extração de vídeos (linhas ~164-175): checar RAI antes do fallback genérico.
2. Handler de "Gerar Cena" na tela de storyboard (localizar via `rg "generate-video-scene"` no front) — surface do `error.message` da edge function no toast.

## Escopo fora

- Não alterar Seedance (fluxo separado).
- Não mexer em prompts do Veo — a rejeição é da imagem, não do texto.
- Não mudar a política de mascotes; apenas comunicar o bloqueio.
