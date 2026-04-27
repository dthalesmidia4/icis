## Problema

Mesmo após a atualização do Bloco 4 pergunta 11 (input editável de quantidade), o card **"Linha de Produção"** continua aparecendo como uma seção fixa/duplicada na tela `/plan-period` (PlanPeriod.tsx, linhas 762–784). Ele mostra a distribuição automática (Vídeos Curtos, Carrossel, Post Estático, Total) — exatamente o que o print do usuário evidencia.

Como a definição de quantidade agora foi movida para o Bloco 4 (pergunta 11) com input numérico editável, o card informativo separado virou conteúdo redundante e gera confusão visual.

## Solução

**Remover o card "Linha de Produção"** da página `/plan-period`, mantendo:

- A lógica `productionLine` / `productionLineTotal` (useMemo) — continua sendo usada como sugestão e cálculo enviado à edge function.
- A pergunta 11 do Bloco 4, que já mostra o texto "Sugerido pela estratégia: X conteúdos — ajuste conforme necessário" (já cumpre o papel informativo).
- Toda a lógica de distribuição proporcional 4:2:4 enviada via `customQuantity` para `generate-period-plans`.

## Arquivo afetado

- `src/pages/PlanPeriod.tsx` — remover o bloco `<Card>` das linhas 762–784 (seção `{/* Production Line - Informativo */}`).

Nenhuma alteração na edge function; o comportamento de geração permanece idêntico.

## Resultado esperado

A página passa a ter o fluxo limpo: cabeçalho + canais + Blocos 1–4 (com a quantidade editável dentro do Bloco 4). O card duplicado da "Linha de Produção" some.