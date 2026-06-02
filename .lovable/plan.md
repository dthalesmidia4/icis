## Diagnóstico

Ao clicar em **Continuar** no modal "Demanda Planejada", o cliente chama `supabase.functions.invoke('generate-demanda-questions', ...)` (`src/pages/ClientHub.tsx:104`) e recebe o toast **"Failed to send a request to the Edge Function"**.

Essa mensagem específica é emitida pelo `supabase-js` quando o `fetch` para a edge function falha **antes** de qualquer resposta HTTP — ou seja, a função não respondeu. As causas possíveis, em ordem:

1. **A função `generate-demanda-questions` não está deployada** (ou o último deploy falhou silenciosamente). Outras funções do projeto respondem normalmente, então não é problema global do gateway Supabase.
2. **Falha de boot da função** por imports legados: o arquivo usa `https://deno.land/x/xhr@0.1.0/mod.ts` e `https://esm.sh/@supabase/supabase-js@2.39.3`. Conforme o guia de troubleshooting de deploy (esm.sh drift / lockfile), esses imports podem quebrar o boot do edge-runtime, resultando em fetch sem resposta no cliente.
3. Não é problema de CORS (headers já estão corretos) nem de payload (validação só ocorre após o fetch chegar).

Não consigo confirmar pelos logs porque o acesso a `edge_function_logs` retorna `SUPABASE_FORBIDDEN` no ambiente atual, mas o padrão do erro + imports legados é consistente com falha de boot/deploy.

## Plano

1. **Modernizar imports da função** `supabase/functions/generate-demanda-questions/index.ts`:
   - Remover `deno.land/x/xhr` (não é mais necessário no Deno atual do Supabase).
   - Trocar `serve` de `deno.land/std` por `Deno.serve` (padrão atual).
   - Trocar `esm.sh/@supabase/supabase-js@2.39.3` por `npm:@supabase/supabase-js@2` (mais estável, evita esm.sh drift).
   - Manter toda a lógica de negócio (validações, prompts, OpenAI) intacta.

2. **Redeployar a função** via `supabase--deploy_edge_functions` com `["generate-demanda-questions"]` para garantir que está ativa.

3. **Melhorar a mensagem de erro no cliente** (`handleContinuarDemandaPlanejada` em `ClientHub.tsx`) para, quando o erro for de rede/boot, sugerir reconectar Supabase ou abrir o painel de detalhes do erro já existente — sem alterar a lógica.

4. **Verificar** após o deploy: pedir que você clique em Continuar novamente. Se ainda falhar, consultar os logs da função (já com permissão restaurada) para identificar o stack de boot.

## Arquivos afetados

- `supabase/functions/generate-demanda-questions/index.ts` — modernizar imports
- `src/pages/ClientHub.tsx` — mensagem de erro mais clara (mudança mínima, opcional)
