## Diagnóstico

Hoje "Avaliar Demandas" existe fora do Kanban porque os cards planejados ficam dentro de `period_plans.default_plan` / `ultra_plan` como JSONB — não são linhas de `demands`. Por isso não aparecem na coluna de ninguém e o usuário precisa "lembrar" de entrar na tela `/approve-cards`.

Para trazer isso para a rotina do responsável, o caminho consistente com a arquitetura ("demands é fonte da verdade" + `flow_functions` define o pipeline) é: **transformar avaliação numa etapa do fluxo**.

## Solução

### 1. Nova função de fluxo `avaliar`

- Inserir `avaliar` em `flow_functions` na `position = 0` (antes de `planejar`).
- Nome: **Avaliar**. Marca cards que vieram de período planejado e ainda não foram decididos.
- `isReviewFunction` continua reconhecendo só `revisar*` — `avaliar` é uma categoria à parte (aprovar planejamento ≠ revisar produção).

### 2. Materializar cards planejados como demandas em `avaliar`

Quando um período é aprovado/gerado para execução (mesmo momento em que hoje `/approve-cards` cria a demanda ao aprovar), passar a criar **todas** as demandas de `default_plan` + `ultra_plan` de uma vez, já com:

- `current_function_key = 'avaliar'`
- `assigned_to` = responsável por `avaliar` via `collaborator_function_assignments` (fallback: quem hoje é responsável por `revisar`, definido pelo admin da agência)
- `period_plan_id`, `title`, `demand_type`, `channel`, `publish_date` copiados do plan card
- Flag `origin = 'planned'` (usar coluna existente ou config JSON já usada em outras origens — verificar; se não existir, adicionar `origin text`)

Assim, o momento em que o card "existe" no Kanban é o mesmo em que hoje ele existiria após aprovação — só que agora aparece na coluna do responsável em vez de ficar invisível até alguém abrir `/approve-cards`.

### 3. Seção "Avaliar" na coluna do responsável

Na Visão Geral (`KanbanCentralPage.tsx`), replicar o padrão já validado de "Aguardando clientes" / "Em revisão":

- Filtrar `avaliarCards = cards.filter(c => c.current_function_key === 'avaliar')`.
- Renderizar acima da lista principal uma seção **Avaliar** colapsável, colapsada por padrão, com badge de contagem.
- Mesmo tratamento no **Modo Foco** (`CollaboratorDemands.tsx`).

### 4. Ação de avaliar dentro do card do Kanban

Abrir o card na coluna já mostra o `TaskCard` modal. Adicionar, apenas para cards em `avaliar`, três botões no topo do modal:

- **Aprovar** → muda `current_function_key` para a próxima etapa natural (usando `assignInitialResponsible` conforme `demand_type`, tipicamente `planejar` ou a inicial correta) e reatribui `assigned_to`.
- **Reprovar** → arquiva a demanda e move o título para `period_plans.rejected_plan` (mesma lógica hoje em `/approve-cards`).
- **Editar antes de aprovar** → abre a edição inline já existente.

Extrair essa lógica de `ApproveCards.tsx` para um helper `src/lib/evaluateDemand.ts` (aprovar / reprovar / editar) e reutilizar em ambas as telas.

### 5. Tela `/approve-cards` continua existindo

- Passa a ser uma **visão em lote** opcional para quem quiser processar rapidamente vários cards de um cliente, mas não é mais obrigatória.
- O botão "Avaliar Demandas" no Hub do cliente continua funcionando igual.
- Badges de contagem no Hub passam a somar `demands` com `current_function_key='avaliar'` do período em andamento (fonte única passa a ser `demands`, não `period_plans`).

### 6. Contagem e ordenação no Kanban

- Cards em `avaliar` **contam** no total da coluna e no badge do botão Modo Foco.
- Não contam como "revisar" nem como "aguardando cliente".
- Ordenação padrão: por `publish_date` asc (mesma da coluna).

### 7. Backfill

Migration única para períodos com `operational_status = 'em_andamento'` que ainda têm plan cards não convertidos: criar as demandas em `avaliar` retroativamente, respeitando a regra de não duplicar (título + `period_plan_id` já existente = pula).

## Arquivos afetados

- **DB (migration):** insert `flow_functions` `avaliar` (por tenant), adicionar coluna `demands.origin` se não existir, backfill de demandas pendentes.
- **`src/lib/evaluateDemand.ts`** (novo): approve / reject / edit shared logic.
- **`src/lib/flowFunctions.ts`**: helper `isEvaluationFunction(key)`.
- **`src/lib/initialFlowFunction.ts`**: definir `avaliar` como initial quando `origin='planned'`.
- **`supabase/functions/generate-normal-demands` e `generate-ultra-demands`**: além de escrever no JSONB do plano, materializar demandas em `avaliar` (ou fazer isso num passo pós-geração; a escolha depende de onde hoje o plano é considerado "pronto para execução").
- **`src/pages/KanbanCentralPage.tsx`**: seção Avaliar colapsável.
- **`src/pages/CollaboratorDemands.tsx`**: mesma seção no Modo Foco.
- **`src/components/TaskCard.tsx`**: botões Aprovar/Reprovar quando `current_function_key='avaliar'`.
- **`src/pages/ApproveCards.tsx`**: refatorar para consumir `evaluateDemand.ts`; continua acessível pelo hub.
- **`src/lib/periodCounts.ts`**: contadores passam a ler `demands` em `avaliar` (mantém a mesma assinatura pública para não quebrar chamadas).

## Fora de escopo

- Nenhuma mudança em "Conteúdos agendados", Modo Foco layout, Kanban visual.
- Nenhuma mudança nas telas Anamnese / Estratégia / Identidade Visual.
- Botão global de "avaliar" no header da Visão Geral fica descartado — a integração via coluna já resolve.

## Pontos que preciso confirmar antes de implementar

1. **Momento da materialização.** Hoje as demandas só são criadas no clique de "Aprovar" em `/approve-cards`. Materializar tudo em `avaliar` no momento em que o período é gerado é o comportamento correto, ou você prefere que continue sendo num passo explícito ("iniciar execução do período") para não poluir o Kanban com planos ainda não revisados pela agência internamente?

2. **Responsável do `avaliar`.** Deve ser configurável por tenant em `collaborator_function_assignments` (como as outras funções), ou herda automaticamente do responsável por `revisar`?

3. **Cards já reprovados no `rejected_plan`.** Devem virar demandas arquivadas com `status=rejected` também (para histórico completo), ou continuam só como título no JSONB?
