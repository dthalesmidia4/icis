
Objetivo: eliminar duplicação de slides e garantir que, ao gerar novamente um carrossel, os slides antigos sejam enviados automaticamente para o histórico (`rejected_attachments`) e os novos ocupem o campo `attachments`.

Diagnóstico confirmado
- A duplicação vem do fluxo de `auto-generate-carousel`: ele faz append incremental (`attachments = [...atuais, novoSlide]`) sem limpeza prévia.
- Em nova geração/retry, os mesmos números de slide entram de novo (ex.: Slide 1 duas vezes).
- Evidência no banco: demandas com `Carrossel Slide 1..N` repetidos no mesmo card.

Plano de correção

1) Corrigir no backend (fonte da verdade)
Arquivo: `supabase/functions/auto-generate-carousel/index.ts`
- Adicionar etapa inicial de “substituição automática”:
  - Ler `attachments` + `rejected_attachments` da demanda.
  - Separar anexos de slide de carrossel gerados por IA (heurística por `uploadedBy.id in ['auto-generator','ai-generator']` + fallback por nome `Slide X`/`Carrossel Slide X`).
  - Mover esses anexos para um novo batch em `rejected_attachments` com timestamp.
  - Manter apenas anexos manuais em `attachments` antes de iniciar geração.
- Durante a geração slide a slide:
  - Antes de anexar o slide novo, remover qualquer slide IA existente com o mesmo número (replace por número de slide, não append cego).
  - Persistir com ordem estável por número do slide para evitar embaralhamento visual.
- Ajustar retorno da função com métricas:
  - `archivedSlides`, `generatedSlides`, `replacedSlides`.

2) Blindagem no frontend para evitar disparo duplicado
Arquivo: `src/components/TaskCard.tsx`
- Em `handleGenerateImages`, colocar guarda forte no início:
  - se já estiver `generatingImages`/`regeneratingAll`, retornar imediatamente.
- Para carrossel, manter chamada para `auto-generate-carousel`, mas tratar resposta com contadores de arquivados/gerados no toast.
- Garantir refetch final de `attachments` após conclusão para refletir substituição real no card.

3) Compatibilidade de fluxo
- Não alterar schema nem migração.
- Fluxos automáticos já existentes (aprovação/reprovação) passam a herdar essa regra de substituição automática, pois a proteção fica no edge function.

Validação (E2E)
1. Card com carrossel sem anexos → gerar → deve criar N slides, sem histórico novo.
2. Card com slides já existentes → gerar novamente → slides antigos vão para `rejected_attachments`; `attachments` fica apenas com a nova versão.
3. Repetir geração rapidamente (retry) → não pode surgir Slide 1/2/3 duplicado no mesmo card.
4. Regenerar slide individual continua funcionando sem duplicar os demais.

Detalhes técnicos (implementação)
- Criar helpers internos no edge function:
  - `extractSlideNumber(name: string): number | null`
  - `isAiCarouselSlide(att): boolean`
  - `archiveAndRemoveExistingCarouselSlides(demand)`
- Atualização de `rejected_attachments` sempre por append de batch estruturado:
  - `{ rejected_at, reason: "carousel_regeneration", attachments: [...] }`
- Substituição por número de slide:
  - `attachments = current.filter(!sameSlideAi) + newSlide`
