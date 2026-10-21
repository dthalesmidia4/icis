# Escritório virtual: reproduzir fielmente o HTML corrigido

Referência: `ICIS_Escritorio_Virtual_Janela_Corrigida.html` (SHA confere: 8d7282f8…). Os dados continuam vindo do ICIS. Nada de dados demonstrativos nem de percentuais inventados.

## 1. Caminhada de verdade
- O personagem ganha a postura "andando", com braços e pernas alternados e um leve balanço do corpo, como no `movePerson`/`avatarSvg` do HTML. A animação liga durante o deslocamento e desliga quando ele chega.
- O deslocamento passa a ser suave para todos (presença real e clique manual), e não só para o seu personagem.
- Na estação, ele fica sentado na cadeira atrás da mesa, com a camada de encosto da cadeira (`chairBehindAvatar`). No café, segura a xícara.

## 2. Menos poluição
- Remover a placa grande de nome e contagem e o selo flutuante da pilha.
- A pilha de papéis segue o `deskPaperStack` do HTML: a quantidade exata fica impressa discretamente na folha do topo.
- A barra de progresso fica no tampo, em perspectiva, como no `deskProgressWidget`. Ela mostra só a etapa real, sem %, e o nome fica numa etiqueta pequena (`deskFront`).
- As placas das zonas seguem o `zoneSign` do HTML, integradas ao piso.

## 3. Acabamento
- Mesa, monitor de costas (`monitorBack`), objeto da mesa (`deskAccessory`), cadeira, personagem, janelas, paredes, piso, reunião, revisão, planejamento, espera e café: cada um é portado função a função do HTML, nos arquivos `iso/` que já existem, mantendo as mesmas posições.
- Sem decoração nova.

## 4. Funcionalidades preservadas
- Clicar na folha abre o card. Arrastar a folha transfere a demanda com a mesma proteção de hoje.
- Clicar na própria mesa abre a personalização do objeto. Na mesa de outra pessoa, abre a fila dela.
- Continuam iguais: filtros, presença, painel da agência e missões.

## Detalhes técnicos
- Arquivos: `OfficeIsoScene.tsx`, `iso/AvatarSvg.tsx` (parâmetro de pose sentado/andando/parado e xícara), `iso/Desk.tsx`, `iso/Chair.tsx`, `iso/ZoneSign.tsx`, `iso/NameTag.tsx`, `iso/WallWindow.tsx`, `iso/MeetingRoom.tsx`, e um novo hook pequeno de interpolação das posições de todos, com a flag `walking`.
- O `DeskCounter` deixa de ser usado.
- Keyframes da caminhada em `index.css`, dentro do escopo `.office-iso`, com fallback para `prefers-reduced-motion`.
- Validação com dados sintéticos via Playwright: desktop, ultrawide e zoom de 80%, filas de 0, 4, 30 e 59, além de testes vitest e tsgo.
