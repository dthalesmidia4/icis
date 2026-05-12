## Objetivo
1. Ao regerar (estático ou carrossel), **manter os anexos atuais** — os novos devem ser adicionados sem apagar / arquivar os antigos.
2. Adicionar uma animação leve de “gerando” enquanto a IA trabalha, visível na área de anexos.

## Mudanças

### 1. Frontend — `src/components/TaskCard.tsx`

**`handleRegenerateAll`** (linhas 555–626)
- Remover todo o bloco que move anexos de IA para `rejected_attachments` e os apaga da lista (linhas 559–586).
- Manter apenas a chamada à edge function correspondente (`auto-generate-carousel` ou `generate-post-image`) e o refetch.
- Resultado: as imagens novas serão **anexadas** às existentes (o backend já faz append).

**`handleRegenerateSlide`** (carrossel slide-a-slide)
- Já é o fluxo de “substituir o slide N”. Passar uma flag para preservar o anexo antigo: enviar `replaceSlide: false` (ou novo flag `keepPrevious: true`) para que o slide regenerado seja adicionado em vez de substituir.

**Animação de geração**
- Enquanto `regeneratingAll`, `generatingImages` ou `regeneratingSlide` estiverem ativos, renderizar no início da lista horizontal de anexos um **placeholder card** (mesmas dimensões 110×100px) com:
  - Fundo `bg-muted/40` + classe Tailwind existente `animate-pulse`
  - Sobreposição `shimmer` usando `bg-gradient-to-r from-transparent via-primary/15 to-transparent` com `animate-[shimmer_1.5s_infinite]`
  - Ícone `Sparkles` (lucide) discreto centralizado
- Para regeneração de slide específico, colocar a animação só sobre o card do slide correspondente (overlay absoluto com mesmo shimmer).
- Adicionar keyframe `shimmer` em `tailwind.config.ts` (`0% translateX(-100%)` → `100% translateX(100%)`) — leve, ~1.5s, GPU-friendly.

### 2. Backend — `supabase/functions/auto-generate-carousel/index.ts`

- Remover (ou pular) `archiveExistingCarouselSlides` (linhas 30–61, chamada na 124) — não arquivar mais os slides antigos automaticamente.
- No append por slide (linhas 286–302), **não filtrar** os anexos AI antigos com mesmo número; apenas concatenar `[...currentAttachments, newAttachment]`. Isso preserva o histórico visual no card.

### 3. Backend — `supabase/functions/generate-post-image/index.ts`
- Já preserva `existingAttachments` no fluxo de regeneração geral (linha 281). Sem mudanças necessárias para esse caso.
- Para `replaceSlide`, manter como está apenas se vier explícito do frontend; o frontend deixará de enviar `replaceSlide: true`.

## Notas
- Memória “Card Regeneration History — Moves replaced AI attachments to history” fica desatualizada. Após aprovação, atualizo a memória para refletir que regeneração agora **mantém** os anexos anteriores na lista.
- Sem mudanças de schema; nada para migrar.
