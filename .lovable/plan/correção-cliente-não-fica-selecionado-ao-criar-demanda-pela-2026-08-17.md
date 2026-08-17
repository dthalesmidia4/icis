# Correção: cliente não fica selecionado ao criar demanda pela visão geral

## Causa confirmada

Ao escolher o cliente no rascunho, o card dispara duas atualizações em sequência:

1. uma que grava o cliente escolhido no rascunho;
2. outra, genérica de "card alterado", que **sobrescreve o cliente** com o valor anterior do card em edição.

Essa segunda atualização (em `KanbanCentralPage.tsx`, `handleCardChange`) força sempre `clientId` e `clientName` a partir do card anterior — que no rascunho está vazio. Resultado: o cliente escolhido é apagado no mesmo instante, o campo volta a "Selecione o cliente" e o salvamento continua exigindo empresa.

Confirmado no código: `handleCardChange` (linhas 1503-1514) reescreve `clientId: selectedCard?.clientId || ""` e `clientName: selectedCard?.clientName || "Cliente"`, ignorando o valor recém-escolhido; e `handleDraftClientSelect` no TaskCard chama os dois caminhos em sequência.

## Correção

1. `handleCardChange` passa a **preservar o cliente vindo da alteração** quando ele existir, usando o card anterior apenas como fallback (mesmo tratamento já dado a tipo e etapa).
2. No rascunho, a seleção de cliente deixa de disparar a atualização genérica em duplicidade: um único caminho grava cliente + limpeza de período/subclientes, evitando corrida entre os dois `setState`.
3. Mesma preservação aplicada a `periodPlanId`, para o período não voltar sozinho ao valor antigo depois da troca de cliente.

## Detalhes técnicos

- `src/pages/KanbanCentralPage.tsx` → `handleCardChange`: `clientId: (updatedCard as any).clientId ?? selectedCard?.clientId ?? ""` e equivalente para `clientName`/`periodPlanId`.
- `src/components/TaskCard.tsx` → `handleDraftClientSelect`: em modo rascunho, delegar só a `onDraftClientChange` (que já aplica `draftClientChangePatch()`), sem chamar também `onCardChange`.
- Sem mudanças de banco, RLS ou edge functions.

## Verificação

- Visão geral → Criar demanda → selecionar cliente: o campo mantém o cliente e libera Tipo/Responsável.
- Preencher tipo, responsável, título e datas → salvar cria a demanda sem erro de "Selecione uma empresa".
- Trocar de cliente no rascunho limpa período e subclientes.
- Abrir um card já existente e editar campos: cliente e período continuam intactos.
- Typecheck e Vitest.
