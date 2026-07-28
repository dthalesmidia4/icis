## Objetivo

Coexistir duas operações (Mídia e Sistemas) no mesmo Kanban, com os mesmos colaboradores, sem que uma área "invada" a agenda da outra. Cada card carrega sua área, cada colaborador tem blocos por dia da semana para cada área, e o sistema bloqueia conflitos reais e avisa em sobreposições soft.

## 1. Modelo de dados: área do card

- Novo campo `demands.work_area text` com valores `'midia' | 'sistemas'`, default `'midia'`.
- Default no momento da criação: **vem da área do usuário criador** (ver §2). Editável no card (select ao lado do tipo de demanda).
- Backfill: todas as demandas atuais recebem `'midia'` (a menos que o `client_id` seja marcado como sistemas — ver abaixo, opcional).
- Opcional: `tenant_companies.default_work_area` para pré-preencher quando não houver criador (ex: geração automática por plano). Se ausente, cai em `'midia'`.

## 2. Área do usuário

- Novo campo `profiles.default_work_area text` (`'midia' | 'sistemas' | 'ambos'`), configurável em uma nova aba **"Áreas e alocação"** dentro do modal atual "Configurar funções do fluxo".
- Lúcia = `midia`, Henrique = `sistemas`, demais colaboradores conforme o gestor definir. `ambos` = sem pré-seleção.
- Regra de criação de card:
  - Se criador tem área definida → card nasce nessa área.
  - Se `ambos` → nasce na área do responsável (`assigned_to.default_work_area`); se responsável também for `ambos` ou nulo → cai no default do cliente ou `'midia'`.
  - Campo sempre editável no formulário/modal de criação e no card.

## 3. Alocação de blocos por colaborador (dia da semana × área)

- Nova tabela `user_area_schedules`:
  - `user_id`, `tenant_id`, `work_area`, `weekday` (0–6), `start_time`, `end_time`.
  - Múltiplas linhas por dia permitidas (ex.: Mídia 09:00–12:00 e 14:00–16:00).
- UI de configuração: nova aba **"Alocação por área"** no modal "Configurar funções do fluxo". Para cada colaborador, grade 7 dias × 2 áreas com intervalos editáveis. Herda `tenants.settings.work_hours` como default inicial.
- Se um colaborador não tem blocos configurados para uma área, ele é considerado **não alocado** para essa área (aparece como conflito soft ao tentar agendar).

## 4. Detecção de conflitos ao agendar/mover

Utilitário novo `src/lib/areaConflicts.ts` com duas checagens, executadas ao criar/mover/reagendar card (Kanban inline popover, `SchedulePublicationModal`, criação via form, reordenação):

1. **Hard block (conflito real com outra área):** se já existe outro card ativo com `work_area` diferente, mesmo `assigned_to` e janela `[due_date+due_time, delivery_date+delivery_time]` que intersecta a do card sendo salvo → **bloqueia** com toast/dialog explicando o card em conflito e sugerindo o próximo slot livre.
2. **Soft warning (fora do bloco da própria área):** se o intervalo do card cai fora dos `user_area_schedules` da área dele para o dia → dialog "Confirmar? Este horário está alocado para {outra área} deste colaborador (mas ainda livre)". Continuar ou cancelar.

Fontes de verificação: `demands` (não arquivadas). Ignora o próprio card em edição.

## 5. Identificação visual

- Badge/tag discreta no card com o nome da área (Mídia ou Sistemas) ao lado do badge de cliente.
- Fundo do card em tom pastel: Mídia mantém o atual (neutro); Sistemas ganha um `bg-` pastel novo definido como token (`--card-sistemas`) — sutil, sem gritar.
- Aplicar em `TaskCard.tsx`, `KanbanCard.tsx` e nos cards da tela **Avaliar / Aprovar Produção**.
- Filtro global no Kanban Central: novo chip **Área** (Todas / Mídia / Sistemas) no modal de filtros, propagando para todas as sub-seções (Avaliar, Aguardando Clientes, Em Revisão, colunas).

## 6. Reordenação inteligente com áreas

Refatorar `src/lib/reorderSequence.ts`:

- A função de disponibilidade de horários (`getWorkWindows`) passa a considerar `user_area_schedules` do colaborador para a **área do card atual**, em vez do bloco genérico.
- Cards são agrupados **por área** dentro da coluna. Sobre a preocupação levantada pelo usuário ("como não intercalar cards de áreas com horários que não batem"):
  - **Estratégia adotada:** o algoritmo percorre a fila da coluna respeitando a ordem atual, mas cada card só é encaixado em janelas da **sua própria área**. Assim, um card de Mídia às 15h (quando o bloco de Mídia é só de manhã) automaticamente pula para o próximo bloco de Mídia disponível (dia seguinte 9h).
  - Card locked no topo continua locked (regra atual mantida).
  - Multi-day: mantém preservação do horário de início preferido; se não couber inteiro, empurra o card **inteiro** para o próximo bloco da mesma área (não divide em dois cards). Se o card ultrapassa o bloco disponível de hoje, vai para amanhã 9h — não gera dois registros. Badge visual "Multi-dia" continua indicando o span.
  - Resposta ao dilema "aparecer 2 cards intercalados": não — visualmente e em dados continua 1 card só; o algoritmo agrupa os cards de Sistemas no bloco de tarde e os de Mídia no bloco de manhã, sem intercalar.
- Modal de reordenação passa a mostrar as áreas com cor pastel, e um resumo "Mídia: N cards | Sistemas: M cards".

## 7. Sincronia entre gestores

- Ambos os gestores enxergam tudo (nada muda em RLS). O que muda é o **filtro rápido por área** e a **cor** — Lúcia filtra "Mídia" e vê só o dela; Henrique filtra "Sistemas".
- Nas seções **Avaliar** e **Aguardando Clientes**, mesmo comportamento: agrupamento visual por área quando o filtro está em "Todas".

## 8. Backfill e migração

- SQL: cria coluna, tabelas, indexa por `(assigned_to, work_area, weekday)`, RLS por tenant, GRANTs.
- Backfill:
  - `demands.work_area = 'midia'` para tudo existente.
  - Marcar como `sistemas` as demandas do(s) cliente(s) que o usuário indicar (por lista de `client_id`s ou padrão de título) — a confirmar após aprovação do plano.
  - `profiles.default_work_area`: Lúcia = `midia`, Henrique = `sistemas`, resto = `ambos`.

## Detalhes técnicos

- **Novos arquivos:** `src/lib/areaConflicts.ts`, `src/hooks/useUserAreaSchedules.ts`, `src/components/config/AreaAllocationTab.tsx`.
- **Arquivos alterados:** `KanbanCentralPage.tsx`, `KanbanCard.tsx`, `TaskCard.tsx`, `ApproveCards.tsx`, `SchedulePublicationModal.tsx`, `reorderSequence.ts`, `ReorderSequenceModal.tsx`, `createCardFromContent.ts`, `FunctionPermissionsModal.tsx`, `syncActiveDispatchDate.ts`, `src/index.css` (token `--card-sistemas`).
- **Migração:** ADD COLUMN + CREATE TABLE + GRANTs + RLS + backfill.
- **Sem alteração** em publicação/dispatches, geração de conteúdo, edge functions de IA.

## Ordem de entrega

1. Migração (schema + backfill mínimo).
2. Campo `work_area` no card + badge + cor pastel + filtro.
3. UI de alocação por dia da semana × área (aba nova).
4. Detecção de conflitos (hard + soft) em todos os pontos de agendamento.
5. Reordenação com blocos por área.
6. QA guiado (você aponta 1–2 clientes/demandas para marcar como Sistemas no backfill).

## Perguntas pendentes (após aprovar plano)

- Lista de clientes já hoje 100% Sistemas (se houver algum além do misto SmartVety).
- Padrão inicial dos blocos de Lúcia (Mídia dia todo?) e Henrique (Sistemas dia todo?).
