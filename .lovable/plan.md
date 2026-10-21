# Escritório virtual mais próximo da referência "Office Quest"

## Objetivo
Trocar o desenho do `/escritorio` por um mundo isométrico em cena única, no estilo da referência (sala 3D com paredes, janela, piso, tapetes, plantas e mesas temáticas por pessoa). Adicionar as mecânicas de câmera e caminhada. Continuam iguais: os dados reais, cada pessoa com sua própria mesa e as demandas em cima dela, as zonas (revisão, planejamento, café, reunião, espera), a abertura dos cards e o arraste de card entre mesas.

## O que o usuário vai ver
- Uma sala isométrica com paredes e janela no fundo, piso em losangos e zonas com placas: Revisão, Planejamento, Café, Reunião e Espera.
- Uma mesa isométrica por colaborador, com cadeira, notebook, cor própria, placa com o nome e uma pilha de papéis cuja altura segue a quantidade real de demandas.
- Avatares cartoon com balão de fala curto (ex.: "Indo até lá...", "Revisando", "Café").
- Painéis por cima do mundo (missões, pulso da agência, filtro por área e zoom), no estilo de cartões brancos com sombra, como na referência.

## Mecânicas
1. **Arrastar a visualização:** clicar e arrastar no piso move a câmera. A roda do mouse e os botões +/− mudam o zoom (75% a 190%). Há também um botão para recentralizar.
2. **Clique x arraste:** se o mouse se mover menos de cerca de 6px, conta como clique. Acima disso, conta como arraste da câmera e não move ninguém.
3. **Clicar no cenário:** só o seu personagem anda até o ponto clicado, numa caminhada animada. Ninguém controla o personagem de outra pessoa.
4. **Quanto tempo fica lá:**
   - Se você está livre (no café ou sem demanda ativa), seu personagem fica onde você clicou por até 10 minutos.
   - Se você está na sua estação com trabalho, fica só 45 segundos e depois volta sozinho.
   - Se chega uma demanda nova para você, ou se sua etapa ou presença muda, ele volta na hora para a mesa.
5. **Clicar num personagem** (o seu ou de outra pessoa) abre a fila de demandas dele, igual ao clique na mesa hoje.
6. **Clicar numa zona** destaca a placa e mostra quem está lá.
7. **Clicar nos papéis da mesa** abre os cards e **arrastar um card até outra mesa** transfere a demanda, como já funciona hoje.

A caminhada manual é só visual e fica no seu navegador. Ela não grava nada nem muda etapa ou responsável, e as outras pessoas continuam vendo você na posição real.

## Fora do escopo
- Nenhuma mudança no banco, nas regras de fluxo ou nas transições.
- Sem moedas ou gemas falsas: o painel de XP e missões continua com os dados atuais da agência.
- Sem nova engine de jogo nem bibliotecas novas.

## Detalhes técnicos
- Novo `src/lib/officeIso.ts` com funções puras: `iso(x,y)`, `inverseIso(pt)` (limitado à planta), layout de mesas e zonas em coordenadas de grade (mesas em fileiras, zonas em lugares fixos) e uma função de tempo de permanência (`manualStayMs(state)` → 10 min livre / 45 s com trabalho).
- Novo `OfficeIsoScene.tsx`: um único `<svg>` com `viewBox` controlado (pan/zoom), o chão e as paredes estáticos memorizados, e as entidades ordenadas por profundidade (x+y).
- Os componentes atuais (`OfficeDesk`, zonas, `OfficeCharacter`, `PaperStack`) ganham versões SVG isométricas. As anchors medidas no DOM são substituídas por posições calculadas na grade. `OfficePeopleLayer` passa a interpolar posições com `requestAnimationFrame`.
- O hook de arraste de card (`useOfficeCardDrag`) é mantido. O alvo de soltura vira o `data-user-id` da mesa SVG, pela mesma detecção por ponto (`elementFromPoint`).
- O arraste da câmera usa pointer events no fundo e ignora toques em mesas, cards e personagens.
- Um hook `useMyManualWalk` guarda o destino, o horário de expiração e uma "assinatura" das minhas demandas e presença. Se essa assinatura mudar, o destino é cancelado e o personagem volta à mesa.
- Celular: começa com zoom ajustado à tela e permite arrastar com um dedo. As zonas laterais continuam desligadas como hoje.
- Testes vitest para `iso`/`inverseIso`, limite de clique na planta, `manualStayMs` e o cancelamento quando chega uma demanda nova.
- Atualizar a memória "Acabamento do escritório": a planta muda para isométrica, e as interações e dados ficam iguais.
