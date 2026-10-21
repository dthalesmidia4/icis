# Escritório: igualar o acabamento visual da referência

Esta etapa mexe só no visual. Os dados, os cliques, a caminhada, o arraste de cards e as filas continuam exatamente como estão.

## Diferenças encontradas (o nosso hoje x a referência)

| Elemento | Hoje | Referência |
|---|---|---|
| Fundo | Azul liso | Céu em degradê com nuvens e círculos de luz, sombra difusa embaixo da sala |
| Paredes | Painel fino e translúcido | Duas paredes grossas em degradê, com acabamento branco no topo e rodapé azul |
| Elementos de parede | Duas janelas simples | Placa "ICIS Office Quest", janelas com vidro e reflexo, quadro "Agência em movimento" |
| Piso | Grade de linhas fina | Ladrilhos em degradê, borda grossa com duas faces (laje 3D) e brilho de luz |
| Mesas | Caixa colorida lisa | Tampo claro com laterais na cor da pessoa, 4 pés, notebook com tela acesa, caneca, papéis e cadeira com encosto |
| Contador da mesa | Número solto ("0", "59") | Cartão branco com borda na cor da pessoa: nome, "1 produzindo", número grande "03 DEMANDAS" e ponto vermelho de alerta |
| Placas das zonas | Retângulo com texto normal | Pílula com ícone, em MAIÚSCULAS e espaçamento largo (✓ REVISÃO, ◆ REUNIÃO, ☕ CAFÉ) |
| Zonas | Caixa bege repetida | Objetos próprios: bancada de revisão com selo ✓, máquina de café com tela, sala de reunião com mesa e cadeiras, estante criativa, sofá e servidor |
| Tapetes | Losango liso | Tapetes com borda dupla e franja nas cores da zona |
| Plantas | Talo com duas folhas | Vaso de cerâmica com várias folhas em dois tons e sombra |
| Personagens | Cabeça e corpo básicos | Cabeça maior com orelhas, 4 tipos de cabelo, bochechas, sorriso, acessórios (óculos, fones), tronco com sombra e pés |
| Nomes | Texto preto sobre a mesa | Etiqueta branca com ponto de status embaixo do personagem |
| Profundidade | Objetos se sobrepõem errado (nome atrás da mesa) | Ordem de desenho por profundidade, etiquetas sempre por cima |
| Vida | Estático | Telas piscando, plantas balançando e anel pulsando no personagem selecionado |
| Painéis | Cards finos com borda azul | Cards brancos com borda clara, sombra sólida embaixo e cantos bem arredondados |

## O que será feito

1. **Base da cena:** céu, nuvens, paredes grossas, rodapé, piso em laje 3D e brilho, usando as mesmas medidas e cores da referência.
2. **Parede decorada:** placa ICIS Office Quest, janelas com reflexo e o quadro "Agência em movimento".
3. **Mesas completas:** pés, tampo, laterais na cor de cada pessoa, notebook, caneca, papéis proporcionais às demandas reais e cadeira.
4. **Cartão da mesa:** nome, quantidade em produção, número grande de demandas e ponto de alerta quando houver atraso. Abre a fila ao clicar, como hoje.
5. **Zonas com objetos próprios:** revisão, café, reunião, planejamento e espera, cada uma com seu tapete e sua placa no novo estilo.
6. **Decoração:** plantas, estante, sofá e servidor espalhados pelos cantos livres.
7. **Personagens novos:** desenho fiel ao da referência, variando cabelo, pele e acessório de forma estável por pessoa, com a etiqueta de nome e o status embaixo.
8. **Ordem e legibilidade:** tudo é desenhado por profundidade, e etiquetas e cartões ficam numa camada por cima, sem ficar escondidos.
9. **Animações leves:** telas, plantas e destaque de seleção, respeitando o "reduzir movimento" do sistema.
10. **Painéis no estilo da referência:** missões, painel da agência e controles de zoom.
11. **Conferência:** comparar a nossa tela com a referência em capturas lado a lado, no desktop e no celular.

## Fora do escopo

Dados, regras de fila, arraste, caminhada, filtros e cálculos de XP e missões ficam como estão.

## Detalhes técnicos

- Portar os desenhos da referência (`makeRoom`, `wallLogo`, `wallWindow`, `wallPoster`, `desk`, `chair`, `laptop`, `plant`, `rug`, `reviewStation`, `coffeeStation`, `meetingRoom`, `creativeShelf`, `sofa`, `serverRack`, `avatarSvg`, `deskCounter`, `zoneSign`) para componentes SVG em `src/components/office/iso/`, um arquivo por objeto. Medidas e geometria `iso(x,y,z)` iguais às da referência (planta 13 de largura).
- Criar defs compartilhados: degradês do céu, das paredes, do piso e do vidro; filtros de sombra (item e sala); brilho suave.
- Cores como variáveis `--iso-*` em `index.css`, com os mesmos valores da referência. As cores por pessoa vêm de uma paleta fixa, escolhida por hash do `userId`, sem nomes fixos.
- `officeIso.ts` ganha um layout para N mesas, com espaçamento igual ao da referência (cerca de 3,3 × 1,9 de grade), além de posições fixas para zonas e decoração. Mesas com mais de 6 pessoas aumentam a planta proporcionalmente.
- Duas camadas no `OfficeIsoScene`: objetos ordenados por profundidade e, por cima, uma camada só com cartões, placas e etiquetas. Os atributos `data-user-id` e os handlers atuais ficam intactos.
- Animações em CSS com `prefers-reduced-motion`.
- Validação: Playwright com uma página de demonstração sintética (sem login) mostrando 4 a 6 pessoas, capturada ao lado da referência. Depois os testes atuais, tipos e build.
