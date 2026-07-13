# MVP — Melhorias na Anamnese Estratégica

Três mudanças, sem migration, sem reordenar perguntas antigas, preservando `question_0..question_27`.

## 1. `supabase/functions/generate-strategy/index.ts`

Substituir o trecho que hoje usa só `answers.question_0..question_5` por:

- Buscar `question_sessions` (últimos `questions` + `answers`) do cliente/tenant.
- Iterar `questions[i]` pareado com `answers[\`question_${i}\`]` → monta bloco "RESPOSTAS DA ANAMNESE ESTRATÉGICA" com **todas** as perguntas.
- Fallback: se não houver `questions` salvo, iterar as chaves `question_N` presentes em `answers`.
- Ler os novos campos nomeados (ver parte 3) e montar bloco "DIRETRIZES ESTRATÉGICAS PARA IA".
- Concatenar os dois blocos no `userPrompt` e instruir a IA a tratar as diretrizes como restrições fortes.

Nenhum outro trecho da função muda (persistência em `strategies`, chamada OpenAI, modelo, etc. permanecem).

## 2. `supabase/functions/generate-period-plans/index.ts`

Corrigir o bug de chave (linhas 137–147):

```ts
// antes: answers[i.toString()]
const answer = (answers[`question_${i}`] || '').trim();
```

Manter o resto igual (limite de 600 chars, join com " | ").

`reevaluate-card` já usa `question_${i}` corretamente — nenhuma mudança lá.

## 3. `src/pages/GenerateQuestions.tsx` — novo bloco final

Adicionar uma 8ª seção ao final, **sem tocar nas 7 seções existentes** e **sem alterar as chaves `question_0..question_27`**. Este bloco usa **chaves nomeadas** (não índices), então nunca colide com o histórico.

Seção: **🎯 Diretrizes Estratégicas para IA** (texto livre, curtos, não obrigatórios)

| Campo (chave em `answers`) | Pergunta |
|---|---|
| `tone_of_voice` | Descreva o tom de voz ideal em 1–2 linhas (ex.: próximo, técnico, provocador). |
| `content_pillars` | Liste 3 a 5 pilares de conteúdo (temas recorrentes). |
| `preferred_ctas` | Quais CTAs você quer priorizar? (ex.: chamar no WhatsApp, agendar consulta) |
| `forbidden_words` | Palavras, temas ou abordagens que **nunca** devem aparecer. |
| `active_channels` | Quais canais estão ativos hoje? (Instagram, LinkedIn, WhatsApp, YouTube…) |
| `offer_and_ticket` | Qual é a oferta principal e faixa de ticket médio? |
| `main_competitors` | Cite 2–3 concorrentes/referências que você admira ou compete diretamente. |

Detalhes de UI:
- Renderizar o bloco após a seção "Contexto de Mercado" usando o mesmo padrão visual (`AutoResizeTextarea`, header com emoji/título).
- Manter auto-save existente — as chaves nomeadas entram em `answers` junto com as numéricas, o upsert já cobre.
- Ajustar `strategicQuestions` (o snapshot salvo em `question_sessions.questions`) para incluir as novas perguntas **ao final**, mantendo a ordem das 28 originais nos índices 0..27. As chaves nomeadas do novo bloco não usam índice, então não afetam pareamento.
- Ajustar o export PDF para também renderizar o novo bloco (nomeado por rótulo).

## Riscos e mitigação

- Respostas antigas: preservadas — nenhuma chave numérica muda.
- `generate-strategy` passa a gerar textos maiores/diferentes: comportamento esperado; o modal "Estratégia já registrada" já protege sobrescrita.
- `generate-period-plans` passa a receber contexto real da anamnese (hoje recebe vazio): efeito positivo, mas altera o output dos próximos planejamentos.
- Sem migration; `answers` é jsonb aditivo.

## Validação

- `tsgo --noEmit` no frontend.
- Testar geração de estratégia com um cliente que já tenha anamnese preenchida e conferir se o prompt inclui todas as respostas + diretrizes.
