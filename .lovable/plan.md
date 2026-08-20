# Correção da busca de demandas na Visão Geral

## O que eu apurei no código

A barra "Pesquisar demandas..." na Visão Geral (`KanbanCentralPage`) usa `SmartSearchBar` + `useSmartSearch`. Ela **não filtra o quadro**: digitar só monta uma lista suspensa e, ao clicar num resultado, o sistema apenas pinta um destaque e tenta rolar até o card. Encontrei quatro pontos concretos que explicam a sensação de "não funciona ao digitar":

1. **Digitar não filtra nada.** O quadro continua exatamente igual; a única resposta é o dropdown. Se o dropdown fecha (clique fora) nada acontece.
2. **Selecionar um resultado costuma não mostrar o card.** `handleSearchResultSelect` só limpa o filtro de cliente. Continuam ativos: filtro de status, de área, de período, o Modo Foco (que mostra apenas a coluna do próprio usuário) e as exclusões estruturais da Visão Geral (demandas com publicação agendada e demandas ainda não liberadas ficam fora do quadro). Nesses casos o card procurado não existe na tela e o "destaque + rolagem" não tem alvo.
3. **Campos errados na pontuação.** `useSmartSearch` lê `objetivo` e `instrucoes`, mas os cards trazem `objective` e `instructions`. Buscas por texto de objetivo/instruções nunca pontuam (título, cliente, descrição e anexos funcionam).
4. **Rolagem frágil.** O `scrollIntoView` acontece 100ms depois, contra um `cardRefs` que pode não ter o card registrado (grupo colapsado, coluna fora do viewport), então falha em silêncio.

## O que vou implementar

### 1. Digitar filtra o quadro (comportamento principal)
- O termo digitado passa a ser estado da página e entra em `filteredCards` como um filtro de texto (título, cliente, descrição, objetivo, instruções, observações, legenda e nomes de anexos), com normalização de acentos/caixa.
- Enquanto houver termo: colunas e agrupamentos mostram só o que casa; contadores refletem o resultado filtrado; grupos relevantes abrem automaticamente.
- Um chip "Busca: <termo>" entra na linha de filtros ativos, com X para limpar.

### 2. Busca alcança o que hoje está oculto
- Com termo ativo, a Visão Geral deixa de esconder demandas por publicação agendada / fila não liberada (sinalizadas com o rótulo que já existe), e o Modo Foco mostra também resultados de outros responsáveis, para o gestor achar o card onde ele estiver.
- Ao selecionar um resultado do dropdown, limpar automaticamente os filtros que escondem aquele card (cliente, status, área, período) antes de destacar.

### 3. Seleção que realmente leva ao card
- Rolagem por `requestAnimationFrame`/observer em vez de `setTimeout` fixo, e fallback: se o card ainda não está montado, abrir o card diretamente (mesmo caminho de `highlight`/`openCard` já usado pela URL).
- Card de período concluído continua com aviso, mas passa a oferecer abrir em modo leitura.

### 4. Correção da pontuação
- Corrigir o contrato de `useSmartSearch` para `objective`/`instructions` (mantendo os alias antigos), para que esses campos voltem a pontuar.

### 5. Testes
- Testes unitários do novo filtro de texto (acentos, múltiplos termos, campos cobertos, termo vazio) e da correção de campos em `useSmartSearch`.

## Detalhes técnicos

- Novo helper puro `src/lib/demandTextSearch.ts` com `matchesDemandSearch(card, term)`, reutilizado por `KanbanCentralPage` e pelo dropdown, para não duplicar regra.
- `KanbanCentralPage.filteredCards`: adicionar `searchTerm` às dependências e relaxar as exclusões de dispatch/fila quando `searchTerm` estiver preenchido.
- `SmartSearchBar`: expor `value`/`onQueryChange` controlados para a página acompanhar o texto digitado (sem alterar as outras telas que usam o componente, mantendo o modo não controlado).
- `useSmartSearch`: mapear `objective`/`instructions`; nenhuma mudança de banco, RPC ou fluxo.

## Observação

Não consegui reproduzir ao vivo na sessão autenticada (o preview do sandbox caiu em `/auth`), então o diagnóstico acima é baseado na leitura do código; o primeiro passo da implementação inclui validar o comportamento na tela real após a mudança.
