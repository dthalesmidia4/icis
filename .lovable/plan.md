# Correção do desvio de responsável + agrupamentos mais leves na coluna

## 1. Por que a demanda "Programação dos Stories Leal/STATERA" foi para o Henrique

O que o histórico do card mostra: em 31/07 ela saiu de **Aguardando cliente** e foi para **Revisar** com o Henrique. Isso é um movimento **para trás** no fluxo (Revisar é a etapa 9, Aguardando cliente é a 11) — ou seja, não foi o botão "prosseguir" avançando o fluxo, e sim um **salto manual de etapa** feito no card.

Dois problemas se somam nesse caminho:

1. **O salto manual para uma etapa anterior é tratado como se fosse um avanço.** Ele escolhe um responsável novo por carga de trabalho, ignorando quem já havia executado aquela etapa antes. Como o Henrique é hoje o único colaborador com a função "Revisar" habilitada na área Mídia, qualquer volta para revisão cai obrigatoriamente nele.
2. **O histórico registra esse movimento como "prosseguiu"**, o que faz uma regressão parecer avanço normal e esconde o que realmente aconteceu.

Observação de configuração (confirmada no banco): na área Mídia, o Henrique é o único com "Revisar" habilitado. Enquanto isso não mudar em "Atribuir funções aos colaboradores", toda revisão de Mídia continuará indo para ele quando não houver histórico anterior daquela etapa.

## 2. Correção do fluxo

- Ao saltar manualmente para uma etapa **anterior**, devolver o card para **quem já executou aquela etapa** naquele card (mesma regra que o botão "Voltar demanda" usa). Só quando não existe histórico dessa etapa é que o sistema escolhe por carga.
- Registrar esse movimento no histórico como **retorno**, não como "prosseguiu", para o Registro de Cards refletir a realidade.
- Nenhuma mudança nas regras de avanço normal, nem em banco de dados.

## 3. Ajuste visual dos agrupamentos na coluna

Hoje os títulos "Em Revisão" e "Aguardando Clientes" usam borda superior grossa, fundo colorido forte e botão de largura total — pesados e parecendo colados no topo.

Nova proposta, leve e integrada:

- Título discreto em caixa alta pequena, com o ícone e a contagem, sem fundo preenchido.
- Um filete sutil de separação (linha fina em tom neutro) em vez da borda grossa colorida.
- A cor da etapa aparece apenas como um pequeno ponto/indicador ao lado do título e no contorno leve dos cards do grupo.
- Espaçamento maior acima do grupo, para o título respirar e não "colar" no card anterior.
- Seta de recolher discreta à direita; toda a linha continua clicável.

```text
· · · · · · · · · · · · · · · · ·
• EM REVISÃO 3                  ⌃
[ card ]
[ card ]
```

## Detalhes técnicos

- `src/lib/proceedDemand.ts` → `jumpToFunction`: comparar índice da etapa atual e da etapa alvo na sequência; se alvo < atual, buscar `lastUserOfStage(getStageCompletions(...), target)` antes do `pickAssigneeForFunction`, e gravar `recordFlowHistory` com `action: "moved_back"`.
- `src/pages/KanbanCentralPage.tsx` (~linhas 3110-3200): substituir os headers das seções "Em Revisão" e "Aguardando Clientes" por um header compartilhado leve (mesmo padrão para as duas seções), removendo `border-t-2` e fundos `bg-*/15`.

## Verificação

- Saltar um card de Aguardando cliente para Revisar e confirmar que ele volta para o revisor original, aparecendo como retorno no Registro de Cards.
- Conferir na coluna do colaborador que os dois agrupamentos ficam visualmente leves e continuam recolhíveis.
