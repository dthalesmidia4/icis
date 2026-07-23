## Problema

No modal "Criar Storyboard de Vídeo" o seletor **Motor de Vídeo (Veo 3 / Seedance)** sumiu da tela — o print mostra direto `Cenas / Formato / Predefinição / Mascote`, sem o bloco de escolha do motor. Além disso, o storyboard hoje está usando a MESMA estrutura para os dois motores, quando na verdade cada motor precisa da sua:

- **Veo 3**: 1 geração = 1 cena curta (~8s). O storyboard precisa quebrar a ideia em N cenas separadas (o botão `Cenas 1..5` que já existe).
- **Seedance**: 1 geração = 1 clipe contínuo que entende multi-shot via CUE / `[cut to]` / shot types. Uma única geração já pode conter várias tomadas — então o "storyboard" dele não é cena-por-cena, é um roteiro multi-shot dentro do mesmo clipe.

## O que já existe no código

- `src/pages/ClientHub.tsx` — bloco `Motor de Vídeo` (linhas ~2663-2686) está no JSX mas não aparece no preview do usuário (provável regressão de render / draft com step avançado).
- `suggest-seedance-storyboard` edge function — já retorna 1 a 3 clipes com CUE blocks; hoje o UI trata como storyboard genérico.
- `generate-seedance-script` — já gera prompt multi-shot com CUEs.

## Plano

### 1. Restaurar e reforçar o seletor de Motor de Vídeo no Passo 1
- Garantir que o bloco `Motor de Vídeo` renderize sempre no `videoStep === 1`, no topo do modal (logo abaixo do campo "Ideia do Vídeo"), independentemente do draft carregado.
- Confirmar via inspeção que nenhuma condição / `hidden` / draft antigo está suprimindo esse bloco. Se o draft trouxer um `videoStep` já avançado sem engine escolhido, forçar volta ao passo 1 com engine padrão `veo`.
- Manter Veo 3 como padrão (mais barato).

### 2. Bifurcar visualmente o Passo 1 conforme o motor escolhido

**Se Veo 3 selecionado** (mantém o comportamento atual):
- Mostrar `Cenas: 1 2 3 4 5` + `Formato` + `Predefinição` + `Mascote`.
- Botão principal: `Gerar Storyboard` → chama `generate-video-storyboard` (fluxo atual do Veo).

**Se Seedance selecionado** (nova estrutura própria):
- Ocultar o seletor `Cenas 1..5` (não faz sentido para Seedance — a IA decide).
- Mostrar somente: `Formato` + `Predefinição` + `Mascote` + botão `Planejar Storyboard (IA)`.
- O botão chama `suggest-seedance-storyboard`, que retorna de 1 a N clipes, cada clipe já com um roteiro multi-shot em CUE blocks.
- Aumentar o teto do planner de **3 → 5 clipes** e deixar explícito no system prompt que cada clipe pode conter **até 5 CUE blocks** (várias tomadas dentro da mesma geração). Assim uma única geração Seedance entrega várias "cenas" visuais, ao contrário do Veo.
- Renderizar o preview do plano sugerido (título PT + duração por clipe + resumo dos shots) antes de aplicar às cenas do passo 2.

### 3. Passo 2 (edição de cenas) — deixar claro o que cada card representa

- Card de cena Veo: 1 vídeo curto de ~8s, prompt único.
- Card de cena Seedance: 1 clipe (4–15s) contendo múltiplos shots CUE. Mostrar no cabeçalho do card algo como `Clipe 1 · 10s · 3 shots` para o usuário entender que dentro daquele bloco já existem várias tomadas.
- Nenhuma mudança nos edge functions de geração final (`generate-video-scene` para Veo, `generate-video-scene-seedance` para Seedance) — só ajustes no `suggest-seedance-storyboard` (teto de clipes + instruções de CUEs).

### 4. Validação

- Abrir o modal com draft limpo → confirmar que o bloco `Motor de Vídeo` aparece.
- Alternar Veo ↔ Seedance → confirmar que o layout do passo 1 muda (Cenas some no Seedance, aparece no Veo).
- Rodar `suggest-seedance-storyboard` com uma ideia curta → confirmar que retorna 1 clipe com múltiplos CUEs; com ideia longa → até 5 clipes.
- Rodar geração final Seedance em uma cena → confirmar que o prompt final inclui os CUEs.

## Arquivos afetados

- `src/pages/ClientHub.tsx` — garantir render do seletor, bifurcar layout do passo 1, ajustar cabeçalho do card de cena Seedance no passo 2.
- `supabase/functions/suggest-seedance-storyboard/index.ts` — aumentar teto para 5 clipes, reforçar instrução de "até 5 CUEs por clipe".

Sem mudanças em schema de banco, em pricing ou nos edge functions de geração final.