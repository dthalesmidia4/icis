## Diagnóstico confirmado

Os dois cards da imagem estão realmente salvos com `assigned_to = Eric Zanata` e `current_function_key = aguardando_cliente`. Eric não possui essa função; atualmente apenas **Lúcia Cotrim** está habilitada para `aguardando_cliente`.

- **Hospital Veterinário Leal** foi reatribuído manualmente de Letícia para Eric em 30/07, antes da proteção atual.
- **Correção de Bug...** também está salvo com Eric, mas não possui histórico correspondente à mudança; isso confirma que existe ao menos um caminho de atualização que altera a demanda sem registrar o fluxo.
- O Kanban apenas agrupa pelo `assigned_to`; o aviso amarelo detecta a inconsistência, mas não corrige o responsável.

## Plano de correção

1. **Reparar os dados atuais**
   - Reatribuir os dois cards inconsistentes para Lúcia, única responsável habilitada para `aguardando_cliente`.
   - Registrar a correção no `demand_flow_history` para manter auditoria.

2. **Eliminar o fallback incorreto**
   - Alterar `resolveClientWaitOwner`: se ninguém tiver a função, a transição deve ser bloqueada com mensagem clara, nunca manter um responsável sem permissão.
   - Garantir que toda entrada em `aguardando_cliente`, inclusive salto manual e avanço normal, sempre grave explicitamente o responsável habilitado.

3. **Fechar todos os caminhos de reatribuição**
   - Auditar e centralizar as alterações de `assigned_to`/`current_function_key` usadas pelo Kanban, card, aprovação do cliente e automações.
   - Exigir compatibilidade entre etapa e função antes de salvar e registrar sempre o histórico da mudança.

4. **Corrigir a apresentação do Kanban**
   - Não renderizar cards de `aguardando_cliente` em coluna de colaborador sem essa função.
   - Enquanto houver qualquer dado legado inconsistente, encaminhá-lo visualmente para a coluna do responsável habilitado e disparar atualização dos dados, em vez de apenas mostrar o alerta.

5. **Validar em tempo real**
   - Testar entrada em “Aguardando cliente”, reatribuição manual bloqueada e atualização Realtime.
   - Confirmar no Kanban que os dois cards saíram da coluna do Eric e aparecem na coluna da Lúcia.