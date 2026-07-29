Plano de correção

1. Corrigir o texto do card em “Aguardando clientes”
   - Passar `client_resend_count` para o componente do card.
   - Exibir o envio como ordinal:
     - `client_resend_count = 0` → “Enviado pela 1ª vez ao cliente em 29/07/2026 13:25”
     - `client_resend_count = 1` → “Enviado pela 2ª vez ao cliente em 29/07/2026 13:25”
   - Manter o tempo relativo à direita quando existir data válida.

2. Corrigir o motivo de “apenas Enviado ao cliente” continuar aparecendo
   - O componente `KanbanCard` hoje só recebe `awaitingClientSince`; ele não recebe a contagem de reenvios.
   - O handler de realtime do Kanban também não atualiza `client_wait_started_at`, `client_resend_count`, `client_last_resend_at` nem `current_function_key` quando a demanda muda, então a tela pode continuar usando dados antigos até recarregar.
   - Vou incluir esses campos no update em tempo real para a mudança aparecer imediatamente.

3. Tornar o horário robusto para cards antigos/incompletos
   - Quando `client_wait_started_at` vier nulo, usar como fallback o último registro de histórico `enviar_cliente → aguardando_cliente` em `demand_flow_history`.
   - Isso evita o estado genérico “Enviado ao cliente” quando o banco já tem histórico suficiente para saber a data/hora.

4. Ajustar a ação rápida
   - Remover/evitar duplicidade visual do badge separado “Reenviado 1x”, porque a informação principal passará a ficar no próprio pill do card.
   - Manter o botão discreto “Cliente aprovou”.

5. Verificação
   - Validar no preview do Kanban Central que os cards em “Aguardando clientes” mostram data/hora e ordinal corretamente.
   - Confirmar que uma atualização por realtime muda o texto sem precisar recarregar a página.