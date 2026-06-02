## Problema

O prompt atualizado (`custom_prompt_1780342556676`) retorna um JSON com chaves customizadas (`informacoes_obrigatorias`, `evitar`, `pendencias`, etc.) e valores que podem ser arrays/objetos aninhados. O parser atual só entende `{ titulo, secoes:[{titulo, conteudo}] }`, então cai no fallback e mostra o JSON cru — exatamente o que está no print.

## Objetivo

Tratar qualquer formato de JSON retornado pela OpenAI e renderizar como cards legíveis (títulos + listas/parágrafos), nunca como JSON cru.

## Mudanças em `src/pages/ClientHub.tsx`

1. **Remover instrução rígida no `userPrompt`** (linhas ~381-388): tirar o schema `{titulo, secoes:[...]}` para não conflitar com o prompt customizado do usuário. Manter só a instrução: "Retorne em JSON válido, sem markdown."

2. **Ampliar o tipo de `demandaFinal`**:
   ```ts
   { titulo?: string; secoes: { titulo: string; itens: string[]; conteudo?: string }[] }
   ```
   onde `itens` é a lista de bullets daquela seção.

3. **Substituir o parser** (linhas ~418-451) por uma função genérica `normalizeDemanda(parsed)`:
   - Se vier `{secoes:[...]}` no formato antigo → usa direto.
   - Se vier objeto plano (`{informacoes_obrigatorias:[...], evitar:[...], pendencias:[...], ...}`) → cada chave de 1º nível vira uma seção. Título da seção = chave humanizada (snake_case → "Snake Case", remove aspas).
   - Valor de cada chave:
     - **array de strings** → vira `itens` (bullets).
     - **array de objetos** → cada item vira bullet `"<chave>: <valor>"` concatenado.
     - **objeto aninhado** → vira sub-bullets `"<sub-titulo>: <valor>"`.
     - **string** → `conteudo` da seção.
   - `titulo` top-level (se houver) é usado como título da demanda.
   - Fallback final: se nada parseável, mostra texto bruto numa única seção.

4. **Atualizar render** (linhas ~2057-2071): se a seção tem `itens`, renderiza `<ul class="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">` com cada bullet; se tem `conteudo`, mantém o `<p whitespace-pre-wrap>`. Pode ter os dois (conteudo primeiro, depois lista).

5. **Humanizador de chaves** (helper local): `informacoes_obrigatorias` → `Informações Obrigatórias`, `cta` → `CTA`, etc. (replace `_` por espaço, capitaliza palavras, mantém siglas comuns em maiúsculo).

## Resultado esperado

O modal "Demanda Planejada" exibe cards organizados como:

```text
1. Informações Obrigatórias
   • CTA claro: "Agende sua avaliação psicológica"…
   • Aviso: conteúdo informativo…
   • Indicação de modalidade de atendimento…

2. Evitar
   • Imagens de sofrimento extremo…
   • Linguagem alarmista…

3. Pendências
   • Link de agendamento…
   • Confirmação de disponibilidade presencial…
```

Sem chaves, sem aspas, sem chaves `{}` aparecendo na tela — independente do formato JSON que o prompt retornar.

## Fora de escopo

Não altero o prompt do banco, não mexo no fluxo de perguntas/respostas, não toco em edge functions.