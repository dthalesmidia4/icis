# Foco sempre na própria coluna

## Problema

Hoje a Visão Geral guarda a última coluna focada por usuário. Efeito indesejado: um colaborador que espiou a coluna de outra pessoa volta focado nessa coluna alheia na próxima vez que abre a tela.

## Comportamento esperado

- Quem deve abrir em modo foco (colaborador, sem função de gestor) sempre abre focado na **própria coluna**, toda vez que entra na Visão Geral — independente de qual coluna viu por último.
- Durante a sessão de navegação ele continua livre para focar outra coluna ou sair do foco; isso só não é levado para a próxima abertura da tela.
- Gestores/administradores continuam abrindo na visão completa, como hoje.

## Mudanças

`src/pages/KanbanCentralPage.tsx`

- Remover a persistência da coluna focada em `localStorage` (a chave `kanban_focus_column:<userId>` e as funções de leitura/escrita).
- Na decisão inicial de foco, que já roda antes do primeiro render (mantendo a correção da piscada):
  - colaborador → foco na própria coluna;
  - gestor/admin → visão completa.
- Manter o gate de carregamento esperando a decisão de foco, para a tela não piscar na visão completa antes de focar.
- Manter a limpeza automática do foco quando a coluna focada não existe mais no quadro.
