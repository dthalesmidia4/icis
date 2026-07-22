## Objetivo
Limpar a Home, remover popups de demandas em atraso e redesenhar a barra superior de controles dentro do card aberto.

## 1. Remover popups "Demanda em atraso"
- Remover `<LateDemandPopup />` de `src/components/Layout.tsx` e a importação relacionada.
- Deletar os arquivos `src/components/LateDemandPopup.tsx` e `src/hooks/useLateDemandAlerts.tsx` (não são usados em outro lugar).
- Manter a tabela `user_late_notification_settings` intacta (sem migração) — apenas a UI de alerta é removida.

## 2. Home — hub principal enxuto e centralizado
Em `src/pages/Home.tsx`:
- Remover o item **"Ver Conteúdos Agendados"** dos cards de ação primários (filtrar `actionCards` para excluir `id === 'schedule'`, sem alterar `NAVIGATION_ITEMS` para não impactar a sidebar).
- Remover completamente a seção **"Ver Tarefas dos Colaboradores"** (bloco `mt-10 sm:mt-14` inteiro), pois o Modo Foco na Visão Geral cumpre esse papel. Remover imports/hooks não usados (`useCollaborators`, `Users`, `Badge`, `User` se não usado em outras partes — validar antes de tirar).
- Centralizar os cards restantes (Cliente, Visão Geral das Tarefas, Demandas Completas, Cronograma Global): trocar o grid para um layout centralizado (`flex flex-wrap justify-center gap-*` com largura fixa por card, ou manter grid com `place-items-center` e `justify-center`), garantindo que os 4 fiquem centralizados horizontalmente em telas grandes e ainda respondam bem em mobile.

## 3. Card aberto — barra superior (Responsável / Tipo / Datas / Objetivo)
Em `src/components/TaskCard.tsx` (linhas ~1437–1515):
- Substituir os 4 "botões pesados" por uma barra única, leve e integrada:
  - Container horizontal com `flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 rounded-lg bg-muted/40 border border-border/60` (fundo suave, sem "cartão duplo" dentro do card).
  - **Responsável**: ícone + label pequeno "Responsável" + select inline com estilo ghost (sem borda visível), largura mínima.
  - **Tipo**: ícone + label "Tipo" + select ghost.
  - Separador visual sutil (`h-4 w-px bg-border`) entre grupos para dar sequência lógica: identificação (Responsável, Tipo) → tempo (Datas) → intenção (Objetivo).
  - **Datas e Horários** e **Objetivo**: viram triggers de texto com chevron (não mais retângulos preenchidos), no mesmo padrão inline (`inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary`).
- Ordem final da esquerda para a direita: Responsável · Tipo | Datas e Horários | Objetivo — conduzindo o usuário do "quem/o que" para o "quando" e "para quê".
- Painéis expandidos (Objetivo, Datas) permanecem funcionalmente iguais, apenas ficam abaixo dessa barra unificada.
- Mobile: `flex-wrap` garante quebra natural; nada de grid rígido de 4 colunas.

## Fora de escopo
- Não alterar lógica de dados nem edge functions.
- Não mexer em outras telas nem na sidebar.
