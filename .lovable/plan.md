# Quebras de linha no roteiro Seedance + clareza do badge de tomadas

## Contexto (respostas rápidas)

- **Limite de 15s**: é limite real da API BytePlus. Seedance 1.x lite/pro aceita 5–10s por clipe, Dreamina 2.0 (v2) aceita 4–15s. O clamp já está correto em `generate-video-scene-seedance/index.ts:128`.
- **"10s · 4 tomadas"**: não é ruído nem input — é derivado. `10s` = duração escolhida no slider; `4 tomadas` = número de blocos `CUE` encontrados na descrição via regex (`ClientHub.tsx:2831`). Serve para o usuário saber quantos cortes internos o clipe terá. Vou apenas melhorar o rótulo para não parecer configurável.
- **Quebras de linha faltando**: o prompt do `suggest-seedance-storyboard` já pede `\n\n` entre CUEs (linha 60) e o de `generate-seedance-script` também. Mas modelos frequentemente ignoram e emitem tudo inline. A solução robusta é **normalizar no servidor** antes de devolver o texto, garantindo o formato independentemente do que o modelo produzir.

## Mudanças

### 1. Normalização determinística do roteiro (servidor)

Criar helper compartilhado `supabase/functions/_shared/format-seedance-script.ts` com uma função `formatSeedanceScript(raw: string): string` que:

- Insere `\n\n` antes de cada ocorrência de `CUE <número>` (case-insensitive), exceto se já estiver precedido por quebra dupla.
- Insere `\n` antes de `[cut to]` quando estiver no meio de um parágrafo.
- Coloca falas em linha própria: qualquer `Portuguese spoken dialogue: "…"` ou linha que comece por aspas curvas/retas dentro de um CUE ganha `\n` antes e depois.
- Colapsa 3+ quebras seguidas em exatamente 2.
- Faz `trim()` no resultado.

Aplicar essa função em **dois pontos** para que o texto salvo já venha formatado:

- `supabase/functions/suggest-seedance-storyboard/index.ts`: rodar em cada `clips[i].description_en` antes de responder.
- `supabase/functions/generate-seedance-script/index.ts`: rodar no `prompt` retornado antes de responder.

Não mexer no prompt do sistema — a instrução `\n\n` continua lá como reforço, mas a normalização garante o resultado mesmo quando o modelo falha.

### 2. Retro-formatação ao aplicar clipes existentes

Em `src/pages/ClientHub.tsx`, na função `applySeedanceClipsToEditor` (por volta da linha 1500), aplicar uma versão client-side leve da mesma normalização em `scene_description` antes de gravar no estado, para consertar rascunhos antigos que já estejam salvos sem quebras.

Fazer o mesmo dentro do handler de "Roteiro multi-shot IA" (`optimizeSceneWithSeedanceScript`, ~linha 1600) ao receber o `prompt` do endpoint.

### 3. Rótulo do badge de tomadas

Em `ClientHub.tsx:2840`, trocar o texto do badge de `{duration}s · {shotCount} tomada(s)` para algo mais explícito, deixando claro que é derivado:

- Exemplo: `10s · 4 cortes internos (CUEs)` com `title` (tooltip nativo) explicando "Cortes gerados automaticamente pela IA dentro do mesmo clipe. Ajuste editando os blocos CUE na descrição."

## Detalhes técnicos

- A normalização é puramente textual, roda em <1ms, não altera semântica.
- Regex principal: `/(?<!\n\n)\bCUE\s+\d+/gi` → prefixa `\n\n`. Para `[cut to]`: `/(?<!\n)\s*\[cut to\]/gi` → prefixa `\n`.
- Textareas já usam `whitespace-pre-wrap` implícito (comportamento nativo), então basta o texto ter os `\n` reais.
- Nenhum schema de DB muda. Nenhum bump de `VIDEO_DRAFT_SCHEMA_VERSION` necessário — é só formatação de string.

## Fora de escopo

- Não tornar número de tomadas configurável manualmente — usuário pode editar os CUEs direto no textarea se quiser mais/menos cortes.
- Não mexer no limite de 15s (já correto).
