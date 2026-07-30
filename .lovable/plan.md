## Objetivo

1. Corrigir o header das telas de Customer Success (header vazio no topo, título solto no corpo, botão Voltar isolado).
2. Deixar visível e utilizável a classificação de contato/origem (solicitação, visita, reunião, etc.).

## 1. Header padronizado

Telas afetadas: `src/pages/CustomerSuccessSistemas.tsx` e `src/pages/SystemsClients.tsx`.

Hoje elas renderizam `<BackButton />` solto e um `<header>` próprio dentro do corpo, enquanto a barra superior do `Layout` fica vazia (só breadcrumb).

Mudança:
- Substituir o bloco `BackButton` + `<header>` pelo componente existente `PageHeader`, que já junta botão Voltar + título + subtítulo + ações à direita.
- Customer Success: título "Customer Success · Sistemas", subtítulo atual, ações "Cadastro de clientes" e "Atualizar".
- Clientes de Sistemas: título "Clientes de Sistemas", subtítulo atual, ações "Customer Success" e "Novo cliente".
- Ajustar o padding do conteúdo (o `PageHeader` já tem container próprio), mantendo o corpo alinhado ao restante do sistema.
- Definir o breadcrumb dessas rotas (override de breadcrumb já existente) para que a barra superior não fique vazia.

## 2. Classificação do contato (Customer Success)

O diálogo "Contato" já tem seletor de tipo, mas está pouco descoberto e falta o tipo "Solicitação".

Mudanças:
- Adicionar `solicitacao` ("Solicitação do cliente") à lista de tipos em `src/lib/recordTouchpoint.ts` e no diálogo, junto de visita/reunião/ligação/mensagem/treinamento/entrega/feedback/outro.
- Transformar o seletor em botões-chip (tipo visível de imediato) no diálogo, com o resumo opcional.
- Nova coluna/expansão "Histórico de contatos" por cliente: ao clicar na linha, abrir painel lateral com os últimos contatos (tipo, data, resumo, origem automática × manual), lendo de `client_touchpoints`.
- Mostrar o tipo do último contato de forma legível na coluna "Último contato" (hoje aparece a chave crua).

## 3. Origem da demanda (onde marcar)

O seletor de Origem (Interno, Solicitação do cliente, Feedback do cliente, Suporte) existe no cabeçalho do card, mas fica no meio de vários chips e passa despercebido.

Mudança:
- Destacar o chip de Origem no card (ícone + rótulo "Origem: …", borda leve quando origem é de cliente), sem alterar a lógica de fluxo.
- No Customer Success, exibir a origem das demandas abertas de cada cliente (contagem por origem no tooltip da coluna "Abertas"), para o registro ficar rastreável.

## Detalhes técnicos

- Sem migração de banco: `client_touchpoints.touchpoint_type` é texto livre; `solicitacao` entra apenas como novo valor aceito na UI/tipagem TS.
- `PageHeader` já suporta `backTo`/`onBack`, ações com `variant`/`icon` e comportamento mobile (ação primária + dropdown).
- Arquivos tocados: `CustomerSuccessSistemas.tsx`, `SystemsClients.tsx`, `recordTouchpoint.ts`, `clientHealth.ts` (agregação por origem), `TaskCard.tsx` (apenas apresentação do chip de origem).
