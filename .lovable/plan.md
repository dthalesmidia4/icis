## Objetivo

1. Permitir aferir, após a geração de um período, **todas as respostas que o usuário deu nas perguntas do "Planejar Período"**.
2. Transformar o fluxo de **Reavaliar com IA** (Cards Reprovados) em uma alavanca de aprendizagem: usar o motivo da reprovação para **propor uma nova versão de "Exigências de Conteúdo"** do cliente, mostrando lado a lado o atual e o sugerido (preservando 100% do existente, apenas somando aprendizados), e validar que `content_requirements` está sendo lido em todas as telas de geração.

---

## Parte 1 — Aferir as respostas do período após a geração

### Onde os dados já vivem
Hoje, ao criar um período em `PlanPeriod.tsx`, todas as respostas dos blocos (Objetivo, Produto/Serviço, Contexto, Capacidade, Observações) são concatenadas e salvas em `period_plans.observations` como texto formatado com cabeçalhos `=== BLOCO X — ... ===`. Dado isso, **nenhuma migração é necessária** — só falta exibir.

### Mudanças
1. **`src/pages/ApproveCards.tsx`** (tela mostrada logo após gerar):
   - Buscar também `observations` no `select` do `period_plans`.
   - Adicionar um botão `Eye` no header do período: **"Ver configurações do período"**.
   - Abrir um `Dialog` que renderiza o `observations` formatado, parseando os blocos `=== BLOCO X — TÍTULO ===` em seções com título e lista chave→valor (parser simples por regex no frontend, sem mudar o formato salvo).
   - Mostrar também os campos estruturados: `period_title`, `period_start`, `period_end`, `priority_channel`, `budget`, `production_line` (mix de formatos).

2. **`src/pages/PeriodClientList.tsx`** (lista de períodos do cliente):
   - Em cada card de período (incluindo já gerados), adicionar a mesma ação "Ver configurações" abrindo o mesmo Dialog reaproveitável.

3. **Componente novo** `src/components/PeriodConfigViewerModal.tsx`:
   - Recebe o `period_plans` (id ou objeto) e renderiza:
     - Cabeçalho: título, datas, canal prioritário, orçamento, linha de produção.
     - Seções parseadas a partir de `observations`.
   - Read-only (ediçao continua sendo via "Editar período" existente). Se quisermos editar respostas individuais no futuro, fica isolado.

### Resultado
O usuário pode, em qualquer momento depois da geração, conferir exatamente o que foi respondido nas perguntas que originaram aquele período.

---

## Parte 2 — Reavaliar com IA passa a alimentar "Exigências de Conteúdo"

### Fluxo atual
Em `RejectedCards.tsx → handleReevaluate`: usuário escreve motivo → chama `reevaluate-card` → IA devolve um card melhorado → grava em `rejected_plan` e segue. **O aprendizado morre ali**.

### Novo fluxo proposto
1. Usuário clica **"Reavaliar com IA"**, escreve o motivo, confirma.
2. Frontend chama `reevaluate-card` (como hoje), **mas a edge function passa a retornar dois blocos**:
   - `updatedCard` (igual hoje).
   - `requirementsProposal`: `{ current: string, proposed: string, additions: string }` — o `proposed` **sempre contém o `current` na íntegra** mais um trecho novo derivado do motivo (regra rígida no system prompt: "preserve 100% do texto atual, apenas acrescente ao final, em uma nova linha começando com `- `, a regra ou restrição aprendida; nunca remova nem reescreva regras existentes").
3. Antes de salvar o card reavaliado, o frontend abre um **modal de revisão de exigências** (`ContentRequirementsDiffModal`) com:
   - Coluna esquerda: **Exigências atuais** (read-only).
   - Coluna direita: **Nova proposta** (textarea editável, já preenchida com `proposed`).
   - Destaque visual da parte adicionada (linhas novas em verde).
   - Botões: **Aplicar e salvar reavaliação** (grava `tenant_companies.content_requirements = proposed` e prossegue com o salvamento já existente do card) / **Manter atual e salvar reavaliação** (não altera content_requirements, segue o fluxo) / **Cancelar**.
4. Mensagem explicando: "Estas exigências passarão a guiar todas as próximas gerações de períodos e de conteúdo."

### Mudanças

**Edge function `supabase/functions/reevaluate-card/index.ts`:**
- Buscar também `content_requirements` em `tenant_companies`.
- Pedir ao modelo um JSON com dois campos: `updatedCard` (já existe) e `requirementsProposal: { proposed, additions }`.
- Reforçar no `system` prompt a regra de **preservação total** das exigências atuais.
- Manter compatibilidade: se o modelo não retornar `requirementsProposal`, frontend faz fallback para o fluxo antigo.

**Frontend `src/pages/RejectedCards.tsx`:**
- Após receber resposta, em vez de salvar imediatamente, guardar `pendingReeval = { card, requirementsProposal, index }` e abrir `ContentRequirementsDiffModal`.
- Ao confirmar com aplicação: `update tenant_companies.content_requirements` e em seguida o `update period_plans.rejected_plan` que já existe.
- Ao confirmar sem aplicação: só o update de `rejected_plan`.

**Componente novo** `src/components/ContentRequirementsDiffModal.tsx`:
- Dialog 2 colunas (atual vs. proposto), textarea editável no lado direito, badge "novo" nas linhas adicionadas (diff por linha), botões descritos acima.

### Garantir que `content_requirements` impacta todas as telas de geração
Auditoria mostrou que hoje o campo é lido em:
- `supabase/functions/generate-period-plans/index.ts` ✅ (planejamento de período).
- `supabase/functions/_shared/visual-identity.ts` (helper `loadVisualIdentity`) ✅ — usado por geração de imagens estáticas, carrosseis e prompts visuais via `image-prompts.ts`.

Pontos a verificar e corrigir caso ausente (ação no plano):
- `supabase/functions/generate-standalone-post/index.ts` (texto/legenda do post avulso).
- `supabase/functions/generate-carousel-content/index.ts` (roteiro do carrossel).
- `supabase/functions/auto-generate-post/index.ts` e `auto-generate-carousel/index.ts` (geração automática após aprovação).
- `supabase/functions/generate-video-storyboard/index.ts` e `generate-video-scene/index.ts`.

Para cada um: ler `tenant_companies.content_requirements` e injetar no `system`/`user` prompt como um bloco fixo:

```
EXIGÊNCIAS DE CONTEÚDO DO CLIENTE (PRIORIDADE MÁXIMA — SEMPRE OBEDECER):
{content_requirements}
```

Se a função já recebe os dados via `loadVisualIdentity`, basta concatenar o campo no prompt textual; se busca o cliente direto, adicionar `content_requirements` ao `select` e ao prompt.

### Resultado
Cada reavaliação alimenta a "memória" do cliente em `content_requirements`, que é lida tanto pelo planejamento de períodos quanto por toda geração individual de conteúdo. O sistema fica progressivamente mais alinhado às restrições reais do cliente.

---

## Resumo dos arquivos tocados

**Frontend**
- `src/pages/ApproveCards.tsx` (botão + integração com novo modal).
- `src/pages/PeriodClientList.tsx` (botão "Ver configurações").
- `src/pages/RejectedCards.tsx` (intercepta retorno, abre diff modal).
- `src/components/PeriodConfigViewerModal.tsx` (novo).
- `src/components/ContentRequirementsDiffModal.tsx` (novo).

**Backend (edge functions)**
- `supabase/functions/reevaluate-card/index.ts` (retorno enriquecido + preservação total).
- Auditoria + injeção de `content_requirements` em: `generate-standalone-post`, `generate-carousel-content`, `auto-generate-post`, `auto-generate-carousel`, `generate-video-storyboard`, `generate-video-scene` (apenas onde ainda não existe).

**Banco**
- Nenhuma migração; reaproveita `period_plans.observations` e `tenant_companies.content_requirements`.
