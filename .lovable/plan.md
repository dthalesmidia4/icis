## Diagnóstico (com base nos logs reais)

Log do edge `reevaluate-card` da última reavaliação:
```
AI raw content: { "tipo": "...", "canal": "...", "titulo": "...", "conteudo": "...", "objetivo": "...", "data_sugerida": "...", "cta_recomendado": "...", "instrucoes_de_producao": "..." }
Done. learningStatus: ambiguous | additions length: 0
```

Ou seja: a IA (`gpt-4o-mini`) **ignorou completamente** o schema do prompt. Devolveu só os campos do card reescrito, sem `learningStatus`, sem `learningReasoning`, sem `requirementsProposal`. O fallback do código então classificou como `ambiguous` e o modal abriu com texto idêntico — exatamente o que você viu.

O motivo enviado era forte ("sempre se aprofundar em uma área, evitar repetição"), mas o modelo está optando por uma única tarefa (reescrever o card) e descartando a segunda (avaliar aprendizado). Não é falha de prompt de regras — é falha de obediência ao schema com `gpt-4o-mini` + `response_format: json_object` (que só garante "é JSON", não a forma).

## O que vou ajustar

### 1. Edge `reevaluate-card`: separar em duas chamadas independentes
Em vez de pedir as duas coisas no mesmo JSON (e o modelo escolher só uma):

- **Call A — Reescrita do card**: igual hoje, devolve `updatedCard` puro.
- **Call B — Avaliação de aprendizado**: chamada dedicada, prompt curto e direto, devolve apenas:
  ```json
  { "learningStatus": "meaningful|none|ambiguous", "learningReasoning": "...", "additions": "- ..." }
  ```
  Com `response_format: json_schema` (strict) para forçar a forma. Modelo: `gpt-4o-mini` mantém custo, mas com schema estrito ele não consegue mais omitir campos.

Ganhos: cada chamada tem uma única responsabilidade, fica auditável e o modelo deixa de "esquecer" a parte de aprendizado.

### 2. Logs explícitos para auditoria
No edge, logar separadamente:
- raw da Call A
- raw da Call B
- `learningStatus` final, `learningReasoning`, tamanho de `additions`
- `proposed` final enviado ao frontend (primeiros 200 chars)

No frontend (`RejectedCards.tsx`):
- log já existe na resposta; adicionar log no momento da persistência informando se `content_requirements` foi de fato atualizado no banco (com tamanho antes/depois) e o `id` do cliente.

Isso te permite, em qualquer reavaliação futura, abrir os logs e ver exatamente:
- o que a IA classificou
- por quê
- se o banco foi alterado ou não

### 3. UX quando `ambiguous` com additions vazias
Hoje o modal abre com os dois lados idênticos, dando a impressão de bug. Vou:
- Mostrar um aviso visível dentro do modal: "A IA não identificou regra nova clara. Edite manualmente abaixo se quiser registrar uma regra a partir deste motivo."
- Deixar o lado direito editável já com um placeholder no fim do texto: `\n\n- ` para o usuário escrever a regra sem precisar formatar.
- Manter os botões "Manter atual" e "Aplicar".

### 4. Não vou mexer
- Fluxo de `meaningful` (já funciona como esperado).
- Fluxo de `none` (silencioso, conforme você pediu).
- Modal `PeriodConfigViewerModal` e demais arquivos do escopo anterior.

## Arquivos afetados
- `supabase/functions/reevaluate-card/index.ts` — split em 2 chamadas + logs
- `src/pages/RejectedCards.tsx` — log de persistência + ajuste UX no caso `ambiguous`
- `src/components/ContentRequirementsDiffModal.tsx` — aviso e seed `\n\n- ` quando ambíguo

## Validação
Depois de aplicar, vou:
1. Pedir para você refazer o teste com o mesmo motivo "evitar repetição / aprofundar em uma área".
2. Conferir nos logs do edge a Call B isolada — deve vir `learningStatus: meaningful` + `additions` preenchido.
3. Conferir o log do frontend confirmando o UPDATE em `tenant_companies.content_requirements`.
