Plano para corrigir o corte seco das colunas no Modo Foco:

1. Substituir a dependência principal do `document.startViewTransition()` por uma animação manual do tipo FLIP.
   - A API nativa não está produzindo efeito perceptível no preview atual.
   - A nova solução vai medir a posição das colunas antes e depois da troca de modo e animar `transform`/`opacity`, que é leve e performático.

2. Criar referências estáveis para as colunas do Kanban.
   - Cada coluna terá uma chave visual estável: colaborador, produção, avaliar, aguardando clientes e em revisão.
   - Ao clicar em uma coluna à direita, a coluna principal do colaborador será animada da posição antiga até a esquerda, em vez de simplesmente “aparecer” lá.

3. Animar colunas que entram e saem.
   - Ao entrar no foco:
     - a coluna clicada desliza para a esquerda;
     - as colunas dos outros colaboradores somem rapidamente com fade/leve deslocamento;
     - as colunas extras do foco entram em sequência curta: Produção, Avaliar, Aguardando clientes, Em revisão.
   - Ao sair do foco:
     - o Kanban volta para as colunas por colaborador com transição suave;
     - a coluna do colaborador focado retorna visualmente para sua posição normal.

4. Preservar desempenho.
   - Animar apenas `transform` e `opacity`.
   - Usar duração curta, cerca de 220–300ms.
   - Respeitar `prefers-reduced-motion`, mantendo troca instantânea para quem reduziu animações.
   - Não alterar regras de negócio, filtros, drag-and-drop, dados ou agrupamentos.

5. Manter a interação atual.
   - O clique no título da coluna continua entrando/saindo do modo foco.
   - Em modo foco, clicar no título de qualquer subcoluna continua saindo do foco.
   - O botão/chip superior de sair do foco permanece como alternativa, mas a animação principal será nas colunas, não nele.

Arquivos previstos:
- `src/pages/KanbanCentralPage.tsx`: adicionar captura de layout, refs das colunas e estados temporários de animação.
- `src/index.css`: adicionar classes específicas para animação FLIP das colunas do Kanban e fallback para movimento reduzido.