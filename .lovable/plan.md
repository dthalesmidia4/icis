Plano de correção seguro:

1. **Preservação real do scroll por coluna**
   - Substituir a preservação atual, que captura o `scrollTop` do `<main>`, por uma preservação do scroll interno de cada coluna do Kanban.
   - Cada coluna usa um `ScrollArea`; o scroll que o usuário move está no viewport interno da coluna, não no `<main>`. Por isso a solução atual não restaura a posição correta.
   - Ao clicar em um card, capturar somente naquele momento:
     - qual coluna foi aberta;
     - o `scrollTop` do viewport vertical daquela coluna;
     - opcionalmente o scroll horizontal do board, se houver.
   - Ao fechar o card, restaurar essa posição após o render usando `requestAnimationFrame`, sem listeners contínuos e sem ficar monitorando scroll em tempo real.

2. **Evitar remontagem/recarregamento desnecessário ao fechar**
   - Revisar o fechamento do `TaskCard`, porque hoje ele chama `fetchAllCards()` ao fechar o modal.
   - Manter esse refetch apenas quando houver uma ação que realmente altere a demanda de forma estrutural, ou preservar/restaurar o scroll depois desse refetch.
   - Preferência: não recarregar toda a visão geral em um simples fechar; o estado do card já é atualizado por `onCardChange`, salvamentos pontuais e realtime.
   - Isso reduz a sensação de “remontagem completa” e melhora performance.

3. **Restaurar com fallback robusto**
   - Se a coluna ainda existir ao fechar, restaurar o scroll exato da coluna.
   - Se a coluna mudou por filtro/status/atribuição, tentar centralizar o card aberto pela referência já existente (`cardRefs`) sem forçar recarregamento pesado.
   - Manter a solução local à Visão Geral para não impactar outras telas.

4. **Nome da empresa no cabeçalho do card aberto**
   - No `TaskCard`, mover o nome da empresa de baixo do título para a mesma linha do título.
   - Exibir como um badge/label compacto antes do nome da demanda, por exemplo:

```text
[SESMAP] Mini-guia: o que NÃO assinar sem consultar o sindicato
```

   - Remover a linha redundante abaixo do título para cards existentes.
   - Em rascunhos, manter o seletor de cliente de forma funcional, mas alinhado ao novo padrão visual quando possível.

5. **Validação**
   - Testar manualmente no fluxo principal: rolar uma coluna, abrir card, fechar, confirmar que a coluna permanece no mesmo ponto.
   - Testar também fechamento pelo botão `X`, ações de prosseguir/voltar e abertura via busca/URL para garantir que a restauração não quebre esses fluxos.
   - Conferir que o cabeçalho do card não sobrepõe botões e continua responsivo em telas menores.