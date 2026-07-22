## Objetivo

Corrigir o fluxo de reprovação/reavaliação e o visual da tela **Demandas Reprovadas**, seguindo sua análise: o motivo já é coletado na hora de reprovar → então a "Reavaliação" deve acontecer imediatamente, com escolha entre **Reavaliar com IA** ou **Descartar**. A tela de Reprovadas vira apenas um **arquivo temporário de resgate**, não um passo obrigatório.

---

## 1. Novo fluxo de reprovação (dentro do "Avaliar")

No `EvaluatePlanCardModal` (usado em Visão Geral, Modo Foco e Avaliar Produção):

- Renomear a etapa `confirm-reject` para **"Reprovar card"** com dois botões finais após o motivo ser preenchido:
  1. **Reavaliar com IA** — chama `reevaluate-card` na hora, roda o aprendizado de exigências (diff modal já existente) e substitui o card no `default_plan`/`ultra_plan` (volta para avaliação com nova versão, agrupado no colaborador responsável).
  2. **Descartar** — move para `rejected_plan` com o `_rejectReason` (comportamento atual de reprovação), mas dispara o aprendizado de exigências antes (mesma chamada de learning que o `reevaluate-card` faz, sem regenerar o card).
- O motivo passa a ser **obrigatório** para ambas as opções (hoje só é obrigatório em Reavaliar).
- Toast final deixa claro o destino ("Nova versão enviada para avaliação" vs "Card descartado — motivo aprendido").

Isso elimina o passo intermediário onde o usuário reprovava, precisava lembrar de entrar em `/rejected-cards` e reavaliar de novo.

---

## 2. Tela `/rejected-cards` — redesenho como "Arquivo de Reprovados"

Alinhar com a estrutura de Visão Geral / Conteúdos Agendados:

**Header**
- Usar o header padrão da aplicação (breadcrumb `Home > Visão Geral > Reprovados` via `BreadcrumbOverrideContext`, igual `Scheduled.tsx`), removendo o `PageHeader` interno e o botão "Voltar" avulso do corpo.
- Título "Reprovados de {cliente}" + botão **Atualizar** no header (não no corpo).

**Corpo**
- Subtítulo explicativo curto: "Arquivo dos últimos 30 dias. Cards descartados na avaliação ficam aqui caso você queira resgatar."
- Lista de cards com layout limpo (mesmo padrão visual dos cards de Visão Geral, com badge da empresa acima do título — reaproveita `DemandaCard`).
- **Ações por card** (barra inferior do card, não sobreposta):
  - **Resgatar para avaliação** — devolve o card ao `default_plan`/`ultra_plan` de origem, para reaparecer no bloco "Avaliar" do responsável.
  - **Aprovar e enviar ao Kanban** — mantém o comportamento atual (`handleApproveCard`).
- **Remover** o botão "Reavaliar Conteúdo" desta tela (a reavaliação agora acontece no modal de Avaliação, no passo 1). Remover também o botão "Descartar" solto — descarte definitivo vira automático após 30 dias.

**Layout / hierarquia**
- Corrigir o problema de "Descartar por cima do texto": botões saem do `absolute top-3 right-3` e vão para uma barra própria abaixo do card, com separação visual.
- Espaçamento e tipografia alinhados com Visão Geral.

---

## 3. Auto-expiração de 30 dias

- Filtrar em `fetchData()` apenas cards com `_rejectedAt` nos últimos 30 dias.
- Cards mais antigos são ignorados na UI. (Limpeza física do array pode ser feita numa migração leve mais adiante; agora só ocultar.)

---

## 4. Fora do escopo

- Não vamos mexer no `reevaluate-card` edge function (já faz o que precisamos).
- Não vamos criar tabela nova; continuamos usando `period_plans.rejected_plan` (JSONB) como registro temporário.
- Sem mudanças em Kanban, Modo Foco ou outras telas — apenas o modal de Avaliação e a página de Reprovados.

---

## Detalhes técnicos

Arquivos afetados:
- `src/components/EvaluatePlanCardModal.tsx` — refactor do modo `confirm-reject`: motivo → dois botões (Reavaliar com IA / Descartar). Reaproveita a chamada `supabase.functions.invoke('reevaluate-card', ...)` e o `ContentRequirementsDiffModal` já usado em `RejectedCards.tsx`. No caminho "Descartar", chamamos `reevaluate-card` apenas para extrair `learningStatus`/`requirementsProposal` (sem aplicar `updatedCard`) e então executamos `rejectPlanCard` como hoje.
- `src/lib/evaluatePlanCard.ts` — adicionar helper `restoreRejectedCard(...)` (move do `rejected_plan` de volta ao `default_plan` ou `ultra_plan` conforme `_originalSource`).
- `src/pages/RejectedCards.tsx` — trocar `PageHeader` por header padrão + `BreadcrumbOverrideContext`; nova barra de ações por card (Resgatar / Aprovar); remover Reavaliar e Descartar; filtro de 30 dias.
- Reaproveitar `ContentRequirementsDiffModal` existente para o passo de aprendizado no novo fluxo de reprovação.

Sem migrações de DB.