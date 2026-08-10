# Feed Simulado: abrir imagem com clique longo + navegar slides no hover

Dois ganhos de agilidade na aba **Feed Simulado** do Hub do Cliente, sem mexer em dados ou fluxo de demandas.

## 1. Clique longo abre a mídia

- Segurar o clique por ~400ms sobre uma célula que tenha anexo abre a imagem/vídeo em tela cheia no visualizador de anexos já existente (`AttachmentPreviewModal`), com download, zoom, nova aba e tela cheia.
- Clique curto continua fazendo o que faz hoje: abrir a demanda.
- Se a célula não tem mídia (card em produção), o clique longo não faz nada — apenas o clique curto abre a demanda.
- Funciona com toque no mobile (long-press) e sem disparar o menu de contexto/seleção de texto.
- Feedback visual durante o "segurar": leve escurecimento/escala da célula para indicar que algo vai acontecer.
- No carrossel, o clique longo abre exatamente o slide que está sendo mostrado no momento.

## 2. Setas laterais no hover (carrossel)

- Ao passar o mouse numa célula de carrossel com 2+ imagens, aparecem setas nas laterais (esquerda/direita) e um contador discreto (ex.: `2/5`).
- Clicar na seta troca a imagem exibida na própria célula do feed, sem abrir a demanda.
- A navegação não circula infinitamente: seta desabilitada no primeiro/último slide.
- Ao sair com o mouse, as setas desaparecem; o slide selecionado permanece até o usuário sair da aba.
- Cards estático e vídeo mantêm o comportamento atual (sem setas), pois têm uma peça só.

## Detalhes técnicos

- `src/lib/instagramFeed.ts`: adicionar ao `FeedEntry` um array `media: { url, kind: "image" | "video-file" }[]` com todas as imagens do carrossel na ordem persistida (e um único item para estático/vídeo). `previewUrl`/`previewKind`/`mediaCount` continuam iguais para não quebrar consumidores nem os testes atuais — `media[0]` sempre corresponde ao preview.
- `src/components/client-hub/InstagramFeedTab.tsx`:
  - `FeedCell` passa a ter estado local `slideIndex` e handlers `onPointerDown`/`onPointerUp`/`onPointerLeave` com `setTimeout` de 400ms para distinguir clique longo de clique curto (cancelando o `onClick` quando o long-press disparar).
  - Setas renderizadas apenas quando `kind === "carousel" && media.length > 1`, visíveis via `group-hover`, com `stopPropagation` no clique.
  - Estado de preview (`{ url, name }`) elevado ao componente da aba para montar um único `AttachmentPreviewModal` (sem `onDelete`, ou seja, sem botão de excluir).
- Nome do arquivo no modal: nome do anexo quando existir, senão derivado da URL — para que o tipo (imagem/vídeo) seja detectado corretamente pelo `getFileType`.
- `src/lib/instagramFeed.test.ts`: cobrir a nova lista `media` (carrossel com N imagens, estático com anexos legados, vídeo com capa).
