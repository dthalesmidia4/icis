Plano para corrigir o Kanban sem perguntar novas decisões:

1. **Definir uma fila operacional única por colaborador**
   - Usar a ordem correta: Produção → Em revisão → Avaliar.
   - Excluir da fila de execução: `aguardando_cliente`, `enviar_cliente`, `publicar` já agendado e cards sem ação operacional imediata.
   - Manter `captar` como exceção: quando chegou o horário de captação, ele continua tendo prioridade/pausa própria.

2. **Corrigir o cálculo de “em andamento”**
   - O card “em andamento” será o mais antigo cujo início já passou, considerando apenas cards executáveis.
   - Se houver card atrasado de ontem ou de horário anterior, ele vence qualquer card futuro.
   - Se não houver nenhum iniciado/atrasado, o “próximo” será o primeiro card executável futuro.

3. **Corrigir o cálculo de “próximo”**
   - Não marcar como “próximo” um card de `enviar_cliente`/aguardando cliente.
   - Quando existe um card “em andamento” atrasado, o “próximo” deve ser o próximo executável real depois dele, e não o primeiro card visível do agrupamento errado.
   - Se a próxima ação real estiver em um grupo recolhido, o rótulo deve continuar correto no card real, não em outro card visível às 16:05.

4. **Aplicar a mesma lógica no modo foco**
   - Sub-colunas do modo foco seguem a ordem: produção → revisão → aguardando clientes → avaliar.
   - Rótulos de andamento/próximo continuam calculados pelo conjunto operacional do colaborador, não apenas pela sub-coluna visível.

5. **Ajustar renderização dos agrupamentos**
   - Cards em `enviar_cliente` devem sair da fila principal quando representam espera/cliente e entrar no agrupamento de cliente, junto com `aguardando_cliente`, para não poluir “agora”.
   - Cards de revisão continuam ordenados cronologicamente.
   - Avaliar fica por último e não deve roubar o rótulo de “próximo” se ainda há produção/revisão executável.

6. **Verificação**
   - Conferir no código que nenhum card de cliente/espera recebe “próximo”.
   - Conferir que um card atrasado antes de 15h15 recebe “em andamento” antes de qualquer card 16:05.
   - Conferir que a pausa por captação foi preservada.