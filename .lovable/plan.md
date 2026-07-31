## O que apurei nos dados

Os 2 cards em "Aguardando clientes" na coluna do Eric:

1. **"Hospital Veterinário Leal – vídeos: dia dos pais"** (`df357810`)
   - Histórico: `editar_video` (Letícia) → `aguardando_cliente` mantendo a Letícia (30/07 19:30).
   - Depois, às 19:47, houve um evento `manual_assignment`: `aguardando_cliente` **Letícia → Eric**. Ou seja, alguém trocou o responsável (drag-and-drop / troca de responsável no card) enquanto o card já estava em espera.
2. **"Correção de Bug ao Salvar Aplicações no Monitor de Execuções da Internação"** (`55e69819`, área Sistemas)
   - `demand_flow_history` só tem o evento inicial `planejar`. O card está hoje em `aguardando_cliente` com `assigned_to = Eric` e **`client_wait_started_at` nulo** — chegou nesse estado por um caminho que não registra histórico nem carimba o envio (edição direta de etapa/responsável).

## Por que isso acontece (causa raiz)

- Em `src/pages/KanbanCentralPage.tsx`, as colunas são montadas por colaborador e os cards são filtrados **apenas** por `assigned_to` / `additional_assignees` (linhas 2463-2466). A sub-seção "Aguardando clientes" é só um recorte dessa mesma lista (2494-2499).
- Em `src/lib/proceedDemand.ts` (linhas 638-651 e 767-799), entrar em `aguardando_cliente` **preserva de propósito o responsável anterior** e não chama `pickAssigneeForFunction`. Logo, `collaborator_function_assignments` nunca é consultado para essa etapa.
- Consequência: estar em "Aguardando clientes" não significa "tem a função aguardando cliente"; significa "foi a última pessoa a ficar com o card". No caso do Eric, veio de uma reatribuição manual (card 1) e de uma mudança direta de etapa (card 2). Confirmei também que hoje só **1 colaborador** tem `aguardando_cliente` e **1** tem `enviar_cliente` marcados como permitidos — nenhum deles é o Eric.

Ou seja: não é bug de permissão, é ausência de regra. Nada valida a atribuição de função quando o card entra/permanece em espera, e a tela não deixa claro que a coluna é "quem detém o card", não "quem tem a função".

## Ajuste proposto

1. **Definir o dono da espera pela função, com fallback seguro** (`src/lib/proceedDemand.ts`)
   - Ao entrar em `aguardando_cliente`, tentar `pickAssigneeForFunction(tenant, "aguardando_cliente")`; se houver colaborador habilitado, atribuir a ele; se não houver nenhum, manter o comportamento atual (preserva o responsável anterior). Registrar o `to_user_id` correto no histórico.
2. **Bloquear reatribuição manual para quem não tem a função**
   - No caminho de troca manual de responsável (evento `manual_assignment`) e no drag-and-drop entre colunas: se a etapa atual for `aguardando_cliente`/`enviar_cliente` e o destino não tiver a função permitida, recusar com toast explicativo (mesmo padrão de bloqueio já usado para conflitos de área).
3. **Sinalizar inconsistência na UI em vez de esconder**
   - Na seção "Aguardando clientes" da coluna, marcar com um chip de alerta discreto os cards cujo responsável não tem a função `aguardando_cliente` permitida ("responsável sem a função"), com tooltip apontando para "Atribuir funções aos colaboradores".
4. **Corrigir o dado órfão do card de Sistemas**
   - Carimbar `client_wait_started_at` retroativamente a partir do último evento de histórico (ou do `updated_at`) para o card `55e69819`, para que o pill "Enviado ao cliente em…" pare de aparecer vazio. Já existe rotina de backfill semelhante em `KanbanCentralPage.tsx` (linhas 911-925); vou reaproveitá-la.
5. **(Opcional, se você quiser)** Marcar `aguardando_cliente` como não atribuível na aba Participação e passar a exibir esses cards em uma coluna única "Com o cliente", em vez de dentro da coluna do colaborador. Isso é mudança maior de layout — só faço se você confirmar.

## Detalhes técnicos

- Arquivos: `src/lib/proceedDemand.ts` (resolução de responsável na espera), `src/pages/KanbanCentralPage.tsx` (bloqueio no drag/manual assignment + chip de alerta + backfill), possivelmente `src/components/TaskCard.tsx` (troca manual de responsável).
- Sem migração de schema; apenas um `UPDATE` pontual de dado para o card órfão.
