## 1. Checkbox "Gerar áudio sincronizado" marcado por padrão

Hoje o default só liga o áudio quando a IA já sugeriu fala. Vou mudar para **sempre ligado** em qualquer clipe Seedance v2 (o usuário pode desmarcar se quiser um vídeo mudo).

- `applySeedanceClipsToEditor` → `seedance_generate_audio: true` para todo clipe recém-criado.
- Se o modelo escolhido não for v2, o checkbox continua oculto (irrelevante).

## 2. Prompt com quebras de linha (principalmente nas falas)

Hoje o roteiro multi-shot vem como parágrafo único, difícil de ler. Vou alinhar isso em duas frentes:

**Edge functions — reforçar formatação no output**
- `suggest-seedance-storyboard/index.ts` e `generate-seedance-script/index.ts`: acrescentar regra explícita no system prompt para que cada CUE fique em bloco separado por linha em branco, e que qualquer diálogo em português apareça em linha própria com o rótulo (ex.: `Fala PT-BR: "…"`).
- Pós-processamento seguro no servidor: normalizar o `description_en` retornado pela IA colocando `\n\n` antes de cada `CUE X–Ys` e antes de `[cut to]`, e uma quebra simples antes de `Portuguese spoken dialogue:` / `On-screen text:` / `End card:` para garantir a leitura mesmo se o modelo esquecer.

**UI já preparada**
- O `<Textarea>` da descrição já auto-cresce até 520px e usa `whitespace-pre-wrap` implícito, então as quebras que vierem do backend serão respeitadas sem mais mudanças de layout.

## 3. Fala do apresentador ficou vazia mesmo com diálogo no roteiro

O planner escreveu `Portuguese spoken dialogue: "…"` dentro da `description_en` mas deixou `mascot_speech_pt = ""`. Isso quebra a hierarquia: a fala precisa estar **também** no campo próprio para o TTS do Seedance e para o campo "Dicas de pronúncia" fazer efeito.

Duas correções combinadas:

**Backend (fonte da verdade)**
- `suggest-seedance-storyboard/index.ts`: reforçar no system prompt que **sempre que houver fala em qualquer CUE, o campo `mascot_speech_pt` do MESMO clipe deve receber a concatenação exata daquelas falas (linha a linha, na ordem em que aparecem)**. A regra atual só cobre o caso "a ideia menciona um apresentador falando" — vou torná-la incondicional: se o próprio roteiro criou uma fala, o campo tem que refletir isso.
- Fallback determinístico no servidor: antes de devolver os clipes, se `mascot_speech_pt` estiver vazio, extrair via regex os trechos entre aspas que aparecem após `Portuguese spoken dialogue:` / `Portuguese voiceover:` / `PT-BR:` na `description_en` e preencher `mascot_speech_pt` com essas linhas unidas por `\n`.

**Frontend (segurança)**
- Em `applySeedanceClipsToEditor` (ClientHub), aplicar o mesmo regex-fallback ao hidratar o clipe, para cobrir drafts antigos ou casos em que o backend ainda não regenerou.

Isso garante que o campo "Fala do Apresentador / Mascote (PT-BR)" nunca fique vazio quando a descrição da cena tem diálogo, e que "Dicas de pronúncia" tenha algo para atuar.

## 4. Cálculo de créditos → BRL incorreto (300 créditos = R$ 26,10)

Investigado o problema. A tabela `seedance_pricing` está com `price_brl_per_credit ≈ 0.087` (~R$ 0,087/crédito). Esse valor é o preço "por vídeo" antigo (créditos internos do painel Seedance), não o preço BytePlus/Ark cobrado por segundo de geração.

**Preço real (BytePlus Ark, cobrança oficial):**
- Custo em USD ≈ **$0,040 por crédito** (conforme o usuário confirmou).
- 300 créditos × $0,040 = **$12 USD ≈ R$ 62–66** dependendo do câmbio.
- Portanto `price_brl_per_credit` correto ≈ **0,22** (assumindo USD/BRL ~ 5,50).

**Correção:**
- Migração para atualizar `price_brl_per_credit` de todas as linhas da `seedance_pricing` para **0,22** (mesmo valor para todas — o preço em BRL varia apenas por câmbio, não por modelo/resolução; o que muda por resolução são os `price_credits_per_second`, que já estão corretos).
- Adicionar comentário na tabela indicando que o valor é derivado de $0,040/crédito × câmbio USD/BRL usado (5,50), para facilitar recalibrar quando o câmbio mudar.

Confirme se quer travar o câmbio em **5,50** (→ R$ 0,22/crédito → 300 créditos = R$ 66) ou em outro valor.

## Arquivos afetados

- `src/pages/ClientHub.tsx` — default do áudio + regex-fallback da fala em `applySeedanceClipsToEditor`.
- `supabase/functions/suggest-seedance-storyboard/index.ts` — regra de fala obrigatória + extração fallback + quebras de linha no output.
- `supabase/functions/generate-seedance-script/index.ts` — quebras de linha explícitas no system prompt + normalização do prompt final.
- Migração SQL — `UPDATE public.seedance_pricing SET price_brl_per_credit = 0.22`.

Sem mexer em UI de logo/personagens/estrutura do Passo 2 — só nos 4 pontos que você levantou.
