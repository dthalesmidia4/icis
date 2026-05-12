## Objetivo
Corrigir a geração de post estático com **GPT Image 2**, que hoje fica processando por cerca de 1 minuto e falha com **500** porque a Edge Function recebe **502 Bad Gateway** do upstream da OpenAI e encerra sem recuperação.

## O que vou implementar
1. **Adicionar retry com exponential backoff no fluxo OpenAI de geração de imagem**
   - Atualizar `supabase/functions/_shared/image-generation.ts` para tentar novamente quando a API retornar falhas transitórias como **502**, **503**, **504** ou erro de rede.
   - Limitar o número de tentativas para evitar loop longo demais.
   - Registrar logs claros por tentativa para facilitar diagnóstico futuro.

2. **Melhorar a classificação de erro retornada pela função**
   - Marcar falhas transitórias do upstream separadamente de rate limit.
   - Fazer `generate-standalone-post` devolver uma mensagem mais precisa quando o problema vier da OpenAI, em vez de um erro genérico de geração.

3. **Manter o contrato atual do frontend**
   - Sem mudar a UX nem o payload esperado por `ClientHub.tsx`.
   - Apenas garantir que o backend seja mais resiliente e que a mensagem final reflita o problema real quando todas as tentativas falharem.

4. **Validar a correção**
   - Fazer deploy da função atualizada.
   - Conferir logs da Edge Function para verificar se o retry entrou em ação corretamente.
   - Executar um teste direto na função para confirmar que o fluxo responde de forma adequada.

## Arquivos envolvidos
- `supabase/functions/_shared/image-generation.ts`
- `supabase/functions/generate-standalone-post/index.ts`
- Possivelmente `supabase/functions/generate-carousel-images/index.ts` ou runner compartilhado, se eu aplicar a mesma robustez ao caminho compartilhado de imagem para manter consistência.

## Resultado esperado
- O GPT Image 2 deixa de falhar na primeira instabilidade temporária do upstream.
- Se a OpenAI continuar indisponível após as tentativas, o erro retorna de forma explícita como indisponibilidade temporária do provedor, em vez de parecer bug interno da aplicação.

## Detalhes técnicos
- Retry apenas para falhas transitórias: `502`, `503`, `504` e erros de rede/timeout.
- Backoff curto e progressivo para não aumentar demais o tempo total.
- Sem alterar banco, schema ou contratos de storage.
- Reutilização no helper compartilhado para não duplicar lógica entre post estático e outras gerações com OpenAI.

```text
ClientHub -> generate-standalone-post -> generateImageWithModel
                                      -> OpenAI /images/generations
                                         | 502 transitório
                                         v
                                   retry controlado
                                         |
                       sucesso -> upload storage -> imageUrl
                       falha final -> erro explícito ao cliente
```