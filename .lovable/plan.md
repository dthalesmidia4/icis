# Corrigir o retorno automático dos cards "Aguardando clientes"

## O que está acontecendo (verificado)

Os dois cards do print estão parados há dias e nunca voltaram ao fluxo:

- "Quando indicar uma Avaliação Neuropsicológica?" — enviado ao cliente em 30/07, `reenvios = 0`
- "SESMAP, VÍDEO REAJUSTE SALARIAL DE JANEIRO" — enviado em 31/07, `reenvios = 0`

Duas causas confirmadas, uma em cima da outra:

**1. A tela mostra "10:00", mas esse horário não existe no banco.**
Consultei a configuração real da etapa "Aguardando cliente" nas duas áreas: ela contém apenas durações (`durations`), sem nenhum bloco de retorno do cliente. O "10:00" do print é o valor padrão que a tela preenche ao abrir — ele só é gravado quando alguém edita algum campo dessa aba. Nunca foi editado, então nada foi salvo.

Prova pelo lado da rotina: ela roda de hora em hora (executou hoje às 09h, 10h, 11h, 12h e 13h) e a resposta gravada em todas as execuções, para Mídia e Sistemas, é `skipped: "no_return_times"` — ou seja, desiste antes de olhar os cards, exatamente porque não há horário salvo. Ou seja: está configurado na tela, mas não persistido — e é isso que precisa ser corrigido (inclusive para a tela nunca mais mostrar algo que não está valendo).


**2. A responsável dos dois cards não tem a função de envio ao cliente na área Mídia.**
Os cards estão com a Lúcia, mas na área Mídia a Lúcia está com "Aguardando cliente" e "Enviar ao cliente" desabilitados (na Mídia quem tem essas funções é a Letícia). É isso que gera o alerta "responsável sem a função" no print. Consequência: mesmo depois de corrigir o horário, a devolução automática desses cards seria recusada pela validação de etapa do banco — e a rotina hoje ignora esse erro em silêncio, sem avisar ninguém.

## O que será feito

### 1. Horário de retorno sempre válido
- Gravar a configuração de retorno automático (horários, horas de espera, limite de reenvios, fuso) na primeira vez que a tela de configurações de fluxo é aberta, em vez de só ao editar.
- Na rotina automática: quando não houver horário configurado, usar um padrão seguro (10:00, fuso de São Paulo) em lugar de simplesmente não fazer nada.
- Deixar visível na tela de configurações um resumo do estado atual: "Retorno automático ativo às 10:00 · após 24h de espera · máximo de X reenvios".

### 2. Devolução que não falha em silêncio
- Ao devolver um card, se o responsável atual não puder assumir a etapa de retorno na área do card, redirecionar para quem tem a função (preferindo a última pessoa que executou aquela etapa no card) em vez de tentar um responsável inválido.
- Se não houver ninguém habilitado, deixar o card na etapa de retorno sem responsável e registrar o motivo no histórico, para que apareça na fila do gestor da área.
- Registrar erros de devolução no histórico/log em vez de ignorá-los.

### 3. Visibilidade no card
- No bloco "Aguardando clientes", mostrar quando será a próxima devolução automática ("volta ao fluxo hoje às 10:00") e a contagem de reenvios já feitos.
- Quando o limite de reenvios for atingido, marcar o card como "aguardando decisão" em vez de deixá-lo parado sem sinalização.

### 4. Recuperação dos dois cards do print
Depois das correções, devolver manualmente os dois cards atrasados para a etapa de envio ao cliente, com responsável habilitado na Mídia, e registrar o reenvio no histórico.

## Detalhes técnicos

- `supabase/functions/return-awaiting-client-cards/index.ts`: fallback de `client_return` (10:00 / 24h / America/Sao_Paulo), resolução de responsável elegível via `collaborator_function_assignments` + `user_can_hold_function` e histórico do erro quando o `update` falhar.
- `src/components/FunctionPermissionsModal.tsx`: persistir `config.client_return` no `load()` quando ausente; bloco-resumo do retorno automático.
- `src/components/kanban/AwaitingClientActions.tsx` / `KanbanCard`: próxima devolução prevista + contador de reenvios.
- Correção de dados dos dois cards via atualização pontual (sem mudança de schema).
