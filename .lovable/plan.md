## Diagnóstico confirmado

- A função `auto-generate-carousel` não está mais falhando no início: ela gera os textos e começa a anexar slides.
- Pelos logs, a chamada recente ficou assim:
  - 17:08:37: iniciou a geração do carrossel.
  - 17:09:14: terminou textos e começou imagens.
  - 17:11:01: chegou ao último lote, mas ainda faltava finalizar o slide 5.
  - 17:11:56/57: a função foi encerrada pelo runtime.
- O problema atual é timeout de Edge Function: a função tenta fazer tudo em uma única requisição síncrona, incluindo texto, 5 imagens em lotes e legenda. Com `gpt-image-2`, isso pode ultrapassar o limite do gateway e deixar a UI em “gerando” até retornar 504.

## Plano de correção segura

1. **Tornar a função mais resiliente ao limite de tempo**
   - Adicionar controle de tempo dentro de `auto-generate-carousel`.
   - Se o limite seguro estiver próximo, retornar sucesso parcial em vez de deixar a função morrer em 504.
   - Exemplo: “4 de 5 slides gerados. Clique novamente para continuar.”

2. **Persistir progresso por slide e permitir continuação**
   - Antes de gerar, detectar quais slides de IA já existem anexados ao card.
   - Ao clicar novamente em “Gerar carrossel com IA”, continuar a partir dos slides que faltam, em vez de reiniciar tudo do zero.
   - Manter os slides já anexados, evitando perda de trabalho e chamadas duplicadas.

3. **Reduzir trabalho dentro da mesma requisição**
   - Evitar chamar a legenda automática quando a função já estiver perto do tempo limite.
   - Se necessário, gerar a legenda só depois que todos os slides forem anexados e ainda houver tempo seguro.

4. **Melhorar feedback no card**
   - Trocar a mensagem genérica de erro por uma mensagem clara quando houver timeout/parcial:
     - “Carrossel parcialmente gerado: X/Y slides. Clique novamente para continuar.”
   - Após qualquer retorno parcial, atualizar anexos do card para exibir imediatamente os slides já gerados.

5. **Validar com logs e chamada real**
   - Deployar a edge function atualizada.
   - Testar uma geração/continuação e verificar nos logs se a função retorna antes do 504.

## Arquivos envolvidos

- `supabase/functions/auto-generate-carousel/index.ts`
- `src/components/TaskCard.tsx`

## Resultado esperado

O botão não deve mais ficar preso em “gerando” por vários minutos. Se a geração demorar demais, o sistema salva o que já foi produzido, informa o progresso e permite continuar sem perder os slides.