# Redesenho do cabeçalho do card — barra integrada e leve

## Diagnóstico dos prints

Print 1 (estado normal): a barra tem 4 caixas com borda pesada (Responsável, Tipo, Datas e Horários, Objetivo) que competem visualmente com o título e não trazem informação — só rótulos. Datas não mostram nada até o usuário clicar.

Print 2 (após clicar em Datas e Horários): expande um bloco enorme com 3 "cards" de calendário (Início de Produção, Data de Entrega, Data de Publicação), cada um com seu próprio card, título repetido, botão de fechar, campo de data + campo de hora separados, e uma sub-seção "DATAS ADICIONAIS". Isso quebra o fluxo, joga o conteúdo (editor) para baixo da dobra, e não é integração — é uma segunda tela dentro do card.

Problemas concretos identificados:
- Rótulos redundantes em caixa (Responsável / Tipo / Datas / Objetivo) desperdiçam largura sem mostrar o valor quando fechado.
- Expandir Datas empurra Conteúdo/Observações/Descrição/Anexos para fora da tela.
- Data e hora em campos separados — dois cliques para o que deveria ser um.
- Cada data ocupa um cartão inteiro só para exibir uma linha de informação.
- Nenhum atalho de teclado (Enter para salvar/fechar).
- "Datas adicionais" fica escondido dentro de outro bloco pesado.
- Objetivo também expande em faixa full-width, deslocando tudo abaixo.

## Solução proposta

Substituir a barra de 4 caixas + painéis full-width por **uma única barra fina, sem bordas em caixa, com valores sempre visíveis e edição em popover local**.

### 1. Barra de controles enxuta

Layout: uma linha só (com wrap em telas estreitas), fundo `bg-muted/30`, sem bordas por campo. Cada controle é um "chip" clicável que já mostra o valor atual.

```text
[👤 Lúcia Cotrim ▾]  [🏷 Criativo estático ▾]   •   [📅 23/02 09:00 → 23/02 09:00 ▾]  [🎯 Objetivo ▾]
```

- **Responsável / Tipo**: viram chips ghost com o valor inline (sem o rótulo "RESPONSÁVEL" em uppercase). Ícone + valor + chevron. Placeholder discreto quando vazio ("Sem responsável", "Definir tipo").
- **Datas**: um único chip que mostra um resumo compacto — `Início 23/02 09:00 · Pub 23/02 09:00` (só as datas preenchidas, formato curto). Sem data preenchida vira `+ Datas`.
- **Objetivo**: chip com preview truncado (~40 chars) do texto atual, ou `+ Objetivo` se vazio.

Nenhum controle abre painel full-width. Todos abrem em popover ancorado ao próprio chip.

### 2. Popover de Datas — integrado e denso

Um único Popover (largura ~380px) com as três datas empilhadas em linhas compactas, no estilo do editor rápido da visão geral:

```text
Início de Produção     [23/02/2026]  [09:00]   ×
Data de Entrega        [+ adicionar]
Data de Publicação     [23/02/2026]  [09:00]   ×
                       + data adicional

Datas adicionais (2)
  · 25/02 09:00  ×
  · 27/02 09:00  ×
```

- Data + hora na **mesma linha**, em campos inline pequenos (não cards com título e botão fechar próprio).
- "×" só remove aquela data; sem cartão-envelope.
- "Datas adicionais" mora dentro do mesmo popover, como sub-lista, não como bloco à parte.
- **Enter em qualquer campo salva e fecha o popover.** Esc fecha sem salvar mudanças pendentes.
- Salvamento por campo continua acontecendo no blur (mantém o comportamento atual), mas Enter força o salvamento imediato + fechamento.
- Ao fechar, o chip da barra atualiza o resumo automaticamente.

### 3. Popover de Objetivo

Objetivo também deixa de expandir full-width. Vira Popover (largura ~520px) contendo o `BlockEditor` existente. Fechar o popover dispara o mesmo `handleFieldSave('objective', …)` do blur atual. Nenhum efeito no layout do card enquanto fechado.

### 4. Ajustes visuais gerais da barra

- Remover as bordas individuais por campo; a barra inteira ganha um único `rounded-lg bg-muted/30` sem borda, com padding menor (`px-3 py-1.5`).
- Substituir separadores verticais por espaço + um único bullet `·` entre grupos lógicos (identidade | datas | objetivo).
- Ícones em `text-muted-foreground` (não primário) para reduzir peso; ficam primários só em hover/aberto.
- Chevron menor (`h-3 w-3`).
- Em mobile: os chips quebram naturalmente com `flex-wrap`, sem separadores.

### 5. Interações de teclado

- Enter em qualquer input dentro dos popovers de Datas → salva o campo em foco + fecha popover.
- Esc → fecha popover (mantém última versão salva).
- Tab navega naturalmente entre os campos do popover de Datas.

## Escopo e arquivos afetados

- `src/components/TaskCard.tsx`:
  - Linhas ~1435–1519: reescrever a barra de controles como chips com valor inline.
  - Linhas ~1581–1900 (aprox.): remover o painel expandido de Datas (Início, Entrega, Publicação + Datas adicionais) e reagrupá-lo dentro de um novo `<Popover>` disparado pelo chip de datas. Reutilizar os handlers de save existentes.
  - Linhas ~1525–1538: mover o painel expandido de Objetivo para dentro de um `<Popover>` idem.
  - Adicionar handler `onKeyDown` (Enter) nos inputs de data/hora do novo popover para forçar blur+save+close.
- Sem mudanças em edge functions, banco, ou lógica de negócio. Nenhum handler de save é alterado — só a embalagem visual e o gatilho de fechamento.

## Fora do escopo

- Não mexer nas abas Conteúdo/Observações/Descrição/Anexos.
- Não alterar `DailyCardSection` (que já é um bloco à parte quando Card Diário está ativo).
- Não mexer no cabeçalho superior (título, badge do cliente, breadcrumbs, botões Voltar/Prosseguir/×).
