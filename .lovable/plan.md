# Textos de ajuda nas abas Execução e Conteúdo (card de demanda)

## Onde ficam hoje
Tudo é exibido no card de demanda (`src/components/TaskCard.tsx`). Nenhuma outra tela mostra essas abas.

- **Lista de abas** (`TaskCard.tsx` ~4446-4453): os botões "Execução" (`id: 'execucao'`) e "Conteúdo" (`id: 'description'`). Os nomes continuam iguais.
- **Painel Execução** (`TaskCard.tsx` ~4645): mostra `<ExecutionPanel>`, que já tem a propriedade `notice`. Hoje ela só aparece em rascunhos ("Checklist da primeira passagem…").
- **Campo de novo item da Execução** (`src/components/demands/ExecutionPanel.tsx` ~395): o texto de exemplo atual é `placeholder="O que precisa ser feito nesta etapa?"`.
- **Painel Conteúdo** (`TaskCard.tsx` ~4554-4563): mostra o título "Conteúdo" e um `BlockEditor` ligado a `card.description`, com o texto de exemplo `"Texto do post, legenda, copy..."`. Quando o briefing estruturado define uma entrega principal, aparece `MainDeliveryEditor` no lugar desse campo. Esse caso fica de fora.

## Recomendação
Aplicar os novos textos **só às demandas de Sistemas** (`card.work_area === "sistemas"`). As demandas de Mídia continuam com os textos atuais. O exemplo "Texto do post, legenda, copy..." faz sentido para Mídia, e os novos textos falam de regras e comportamento de sistema.

## Patch mínimo (só textos, sem mudar o funcionamento)
1. `TaskCard.tsx`: criar `const isSystemsDemand = (card as any)?.work_area === "sistemas";`.
2. `ExecutionPanel.tsx`: adicionar duas propriedades opcionais, `helperText?: string` e `newItemPlaceholder?: string`.
   - Mostrar `helperText` como uma linha pequena (`text-xs text-muted-foreground`) no topo do painel, separada do `notice` do rascunho.
   - O campo de novo item usa `newItemPlaceholder ?? "O que precisa ser feito nesta etapa?"`.
3. `TaskCard.tsx`, no `<ExecutionPanel>`, só para Sistemas:
   - `helperText="Resumo objetivo do que deve ser feito. Preferencialmente 1 item; use mais apenas quando houver entregas independentes."`
   - `newItemPlaceholder="Ex.: Corrigir o fluxo de transferência de pets entre responsáveis."`
4. `TaskCard.tsx`, no painel Conteúdo (ramo do `BlockEditor`), só para Sistemas:
   - Adicionar abaixo do título a linha auxiliar "Detalhamento completo da demanda: contexto, regras, comportamento esperado, exceções, critérios e informações necessárias para execução."
   - Usar no `BlockEditor` o placeholder "Descreva aqui todo o contexto e os requisitos da demanda...".
   - Mostrar a linha auxiliar também no modo somente leitura.

## Fora do escopo
Banco de dados, salvamento (`handleFieldSave`, execução), regras das abas (`showExecutionTab`), `MainDeliveryEditor`, Briefing e demandas de Mídia.

## Verificação
Build e testes existentes de `ExecutionPanel`/TaskCard, se houver. Conferir na tela um card de Sistemas e um de Mídia: só os textos mudam no de Sistemas.
