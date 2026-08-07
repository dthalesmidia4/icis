# Ajustes no Hub do Cliente (Mídia)

## 1. Cabeçalho da página
- Remover o `BackButton` solto acima do conteúdo.
- Colocar a seta de voltar na mesma linha da topbar do hub (à esquerda do monograma/nome do cliente), mantendo o mesmo alinhamento do conteúdo abaixo.

## 2. Cores puxadas da identidade visual do cliente
- Hoje toda a tela usa o azul padrão do sistema (`--primary`).
- Envolver o hub num container que sobrescreve, apenas nesse escopo, as variáveis `--primary`, `--primary-foreground`, `--accent` e afins com as cores cadastradas no cliente (`brand_primary_color`, `brand_secondary_color`, `brand_highlight_color`, `brand_text_color`).
- Conversão hex → HSL em runtime, com contraste automático do texto sobre o primário. Se o cliente não tiver cor cadastrada, mantém o tema padrão.
- Todos os componentes continuam usando tokens semânticos — nada de cor fixa.

## 3. Botões de ação em um dropdown
- Trocar a linha de links (Anamnese, Estratégia, Identidade Visual, Planejar Período, Avaliar Demandas, Cronograma Atual, Evolução das Demandas, Histórico de Períodos, Conteúdo Avulso, Demanda Planejada) por um único botão discreto ("Ações") na topbar, ao lado de "Cadastro".
- O dropdown mantém ícones, badges (ex.: 13 em Avaliar Demandas), estados desabilitados e as mesmas permissões atuais.

## 4. Aba Calendário: busca + filtros de tipo
- Adicionar acima da grade: campo "Buscar" (tema/demanda) à esquerda e, à direita, chips de filtro por tipo de atividade derivados dos dados do período (ex.: Todos, Vídeo gerado, Vídeo captado, Post estático, Carrossel, Stories…).
- Os filtros afetam os itens exibidos nas células da grade e na lista mobile.

## 5. "Arquitetura do período" sai da Estratégia
- Mover o bloco com as barras de distribuição por tipo para a aba **Demandas**, como um resumo compacto acima da lista.
- A aba Estratégia passa a começar pela narrativa/estratégia geral, como na referência.

## 6. Aba Estratégia: bloco "Mídia paga"
- Adicionar o painel destacado à direita (card sólido na cor primária do cliente), no lugar da referência.
- Conteúdo quando houver dados do período: verba/orçamento de tráfego pago e objetivo do ciclo.
- Quando não houver: título "Mídia paga" + texto informando que ainda não há planejamento de mídia paga para este período.

## Detalhes técnicos
- Arquivos afetados: `src/pages/ClientHub.tsx` (topbar + dropdown de ações + escopo de tema), `src/components/client-hub/ClientHubHeader.tsx`, `ClientHubActionBar.tsx` (vira menu), `CalendarTab.tsx` (busca/filtros), `StrategyTab.tsx` (remove arquitetura, adiciona Mídia paga), `DemandsTab.tsx` (recebe arquitetura do período).
- Novo helper de tema por cliente em `src/lib/clientBrandTheme.ts` (hex → HSL + variáveis CSS inline).
- Mídia paga lê campos já existentes do período (`paid_traffic_budget`, `budget`, `objective`); sem novas tabelas ou lógica de negócio.
