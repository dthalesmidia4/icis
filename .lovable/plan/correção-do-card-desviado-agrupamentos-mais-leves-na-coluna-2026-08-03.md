# Correção do card desviado + agrupamentos mais leves na coluna

## 1. Aferição da configuração (feita agora)

Confirmado no banco, depois da sua correção manual:

- Área **Mídia**: apenas **Lúcia Cotrim** tem "Revisar" habilitado (Henrique e Eric estão desabilitados). O mesmo vale para revisar_roteiro, revisar_captacao e revisar_publicacao — todos só com a Lúcia.
- Área **Sistemas**: apenas **Henrique** tem "Revisar" habilitado.

Ou seja: a configuração está correta agora e **nenhuma ação de configuração é necessária**. A premissa anterior refletia o estado antigo (resquício da criação das áreas, exatamente como você suspeitou).

## 2. O que ainda está errado

Só sobrou um resíduo: a demanda **"Programação dos Stories Leal/ STATERA"** (Mídia) continua na etapa **Revisar com o Henrique**, que hoje não pode exercer essa função em Mídia. Ela é a única demanda ativa do sistema com responsável incompatível com a etapa.

Ação: mover essa demanda para a **Lúcia** (revisora de Mídia), mantendo a etapa "Revisar", com registro no histórico do card como correção de responsável.

## 3. Prevenção no fluxo (salto manual para trás)

Independente da configuração, o caminho que levou o card até lá continua aberto: quando alguém usa o **salto manual de etapa** para uma etapa **anterior** (ex.: de "Aguardando cliente" de volta para "Revisar"), o sistema:

- escolhe um responsável **novo por carga de trabalho**, em vez de devolver para quem já executou aquela etapa no card;
- grava no histórico como **"prosseguiu"**, fazendo uma regressão parecer avanço.

Correção:

- Salto para etapa anterior devolve o card para **quem já executou aquela etapa** naquele card (mesma regra do botão "Voltar demanda"); só sem histórico é que escolhe por carga entre os habilitados.
- Histórico passa a registrar esse movimento como **retorno**, e não como "prosseguiu".
- Nenhuma mudança nas regras de avanço normal.

## 4. Upgrade visual dos agrupamentos na coluna

Hoje "Em Revisão" e "Aguardando Clientes" usam borda superior grossa, fundo colorido forte e botão de largura total — pesados e parecendo colados no topo.

Nova proposta, leve e integrada:

- Título discreto em caixa alta pequena, com ícone e contagem, sem fundo preenchido.
- Filete fino neutro de separação em vez da borda grossa colorida.
- A cor da etapa aparece apenas como um pequeno ponto indicador ao lado do título e no contorno leve dos cards do grupo.
- Mais respiro acima do grupo, para o título não colar no card anterior.
- Seta de recolher discreta à direita; a linha inteira segue clicável.

```text
· · · · · · · · · · · · · · · · ·
• EM REVISÃO 3                  ⌃
[ card ]
[ card ]
```

## Detalhes técnicos

- Correção de dado: atualizar `demands.assigned_to` da demanda `1ed69cb9-…` para a revisora de Mídia, com entrada em `demand_flow_history`.
- `src/lib/proceedDemand.ts` → `jumpToFunction`: comparar índices da etapa atual e da alvo na sequência; se alvo < atual, usar `lastUserOfStage(getStageCompletions(...), target)` antes do `pickAssigneeForFunction` e gravar `action: "moved_back"`.
- `src/pages/KanbanCentralPage.tsx` (~3110-3200): header compartilhado leve para as duas seções, removendo `border-t-2` e fundos `bg-*/15`.

## Verificação

- Nenhuma demanda ativa com responsável sem a função da etapa na área (consulta de auditoria deve voltar vazia).
- Saltar um card de Aguardando cliente para Revisar e confirmar que ele volta para o revisor original e aparece como retorno no Registro de Cards.
- Conferir na coluna do colaborador que os dois agrupamentos ficam leves e continuam recolhíveis.
