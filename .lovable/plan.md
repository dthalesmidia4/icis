Plano para corrigir o problema sem novas perguntas:

1. **Separar “cards de ação agora” de “cards informativos/externos”**
   - Tratar `publicar` com agendamento ativo como fora da fila operacional real.
   - Manter `aguardando_cliente` fora da fila operacional.
   - Manter `enviar_cliente` como tarefa operacional normal, porque ela precisa aparecer na coluna.
   - Preservar `captar` como horário fixo e prioridade própria.

2. **Corrigir a causa do “nada mudou” ao reorganizar**
   - O reorganizador hoje recebe cards `publicar` agendados e alguns cards com dispatch ativo, mas eles não devem ocupar a sequência de execução.
   - Ajustar o filtro enviado ao modal para passar somente cards que realmente podem ser reagendados ou bloqueiam a agenda.
   - Garantir que cards com agendamento ativo não sejam aplicados como próximos horários de trabalho.

3. **Recalcular a sequência sempre a partir do agora real**
   - Ao reorganizar às 15h30, o primeiro card operacional reagendável deve começar em 15h30/15h35, não depois de uma sequência de cards que já estão agendados/publicados.
   - Remover a lógica que conserva um “primeiro ativo” antigo quando ele não representa a tarefa real atual.
   - O primeiro card executável atrasado ou iniciado deve ser puxado para o primeiro slot útil disponível.

4. **Corrigir o rótulo “em andamento/próximo” para bater com a fila visual**
   - A fila de rótulos deve usar a mesma lista operacional do reorganizador.
   - `publicar` agendado e `aguardando_cliente` não recebem “em andamento” nem “próximo”.
   - O primeiro card executável cujo início já passou vira “em andamento”.
   - Se não houver card iniciado, o primeiro executável futuro vira “próximo”.

5. **Corrigir ordenação visual dentro dos agrupamentos**
   - Ordenar todos os grupos por data e hora de início, sem depender da ordem antiga carregada do banco.
   - Garantir que “Em revisão” fique cronológico e que não roube prioridade antes da produção quando há cards executáveis anteriores.

6. **Verificação com o caso da Lúcia**
   - Conferir que os cards `publicar` com dispatch ativo de 15:20, 15:30, 15:50 etc. não empurram a próxima atividade.
   - Conferir que, às 15h30, a próxima demanda executável não fica em 16:15 quando existe tarefa operacional para iniciar agora.
   - Conferir que `enviar_cliente` continua aparecendo normalmente na coluna.