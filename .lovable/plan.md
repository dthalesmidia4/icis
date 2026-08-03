# Liberação gradual de demandas + foco padrão + gestão de colaboradores

Três entregas independentes, na ordem abaixo.

## 1. Liberação gradual (fila de espera)

Hoje toda demanda alocada aparece imediatamente na coluna do responsável (a Visão Geral busca tudo que não está arquivado e não é rascunho). A ideia é separar "alocado" de "liberado".

Como vai funcionar:

- Cada demanda ganha um estado de liberação. Demandas criadas por gestor/admin com data futura entram como **não liberadas**; demandas que já estão em andamento hoje são marcadas como liberadas na migração (nada muda no presente).
- **Colaborador** vê na sua coluna apenas as demandas liberadas. As não liberadas simplesmente não existem para ele — sem contador, sem badge, sem "+N na fila".
- **Gestor operacional / admin / super admin** vê a coluna completa. As não liberadas aparecem em um agrupamento próprio no fim da coluna: **"Ainda não liberadas (N)"**, com o mesmo visual leve dos agrupamentos atuais (filete fino + ponto de cor).
- Ações do gestor:
  - **Liberar** um card (no card e dentro do modal da demanda).
  - **Liberar os próximos N** no topo do agrupamento (campo com valor padrão 6), respeitando a ordem cronológica já calculada pela sequência.
  - **Voltar para a fila** (des-liberar), disponível apenas enquanto ninguém tocou no card.
- Liberação automática opcional por coluna: "liberar automaticamente até X cards por colaborador". Quando o colaborador conclui um card, o próximo da fila é liberado sozinho. Configurável em Configurações de fluxo (aba Prioridade e risco), desligado por padrão.
- Cada liberação/retorno fica registrado no histórico do card (Registro de cards), com quem liberou e quando.

Onde a fila **não** interfere:

- Evolução das demandas, Cronograma global, Conteúdos agendados e o motor de reorganização continuam considerando todas as demandas (inclusive as não liberadas), para que o planejamento e a detecção de conflito de agenda não mudem.

## 2. Foco padrão para quem não é gestor

- Ao abrir a Visão Geral, quem não é gestor operacional / admin / super admin entra já no **modo foco da própria coluna** (as subcolunas por agrupamento que hoje surgem ao clicar no nome).
- Existe o botão **"Ver quadro completo"** para sair do foco; a escolha é lembrada no navegador durante a sessão, então quem sai não é jogado de volta ao foco a cada navegação.
- Gestores continuam abrindo no quadro completo, com o modo foco disponível como hoje.

## 3. Reforma de "Minha Empresa > Acesso dos Colaboradores"

A tela hoje só lê o papel (badge) e abre permissões de coluna/hub. Passa a permitir gestão real:

- **Alterar o papel** de cada membro via seletor: Administrador da Agência, Gestor Operacional, Colaborador. Visível apenas para admin da agência e super admin (são os únicos que o banco autoriza a gravar). Super Admin aparece como badge fixo, não editável.
- Proteções: não é possível rebaixar a si mesmo nem remover o último administrador da agência; confirmação antes de aplicar.
- **Remover membro** do tenant, com diálogo de confirmação que avisa quantas demandas ativas estão atribuídas a ele e bloqueia a remoção enquanto houver demandas ativas (para não deixar cards órfãos).
- **Convites**: lista de convites pendentes com reenvio do e-mail e cópia do código, além do botão de novo convite.
- Cada linha ganha um atalho para **Funções de fluxo (Mídia / Sistemas)**, que hoje só existe dentro de Configurações de fluxo — a tela passa a mostrar, em texto curto, quais funções o membro exerce em cada área, para acabar com a sensação de "não sei o que existe".

## Detalhes técnicos

- Migração: `demands.released_at timestamptz null` + `released_by uuid` + índice parcial por tenant para as não liberadas. Backfill: `released_at = created_at` para tudo que já existe (nada desaparece hoje). Configuração de auto-liberação em `tenants.settings.release_queue`.
- Leitura: `KanbanCentralPage.tsx` continua buscando todas as demandas; a separação liberado/fila acontece na montagem das colunas, condicionada a `useAgencyRole()` (`canAccessAdmin`). `ClientEvolution.tsx`, `CronogramaGlobal.tsx`, `Scheduled.tsx` e `src/lib/scheduleOccupancy.ts` ficam intocados.
- Novo helper `src/lib/releaseQueue.ts`: `releaseDemands(ids)`, `unreleaseDemand(id)`, `releaseNext(userId, n)`, sempre registrando em `demand_flow_history` com `action = 'released' | 'unreleased'`.
- Segurança: liberar/des-liberar é ação de gestor. Além do gate de UI, a gravação de `released_at` fica restrita por política/trigger a `agency_admin`, `agency_manager` e super admin, para que um colaborador não libere a própria fila.
- Foco padrão: estado inicial de `focusedColumnId` em `KanbanCentralPage.tsx` derivado do papel + `sessionStorage`.
- Papéis: `TeamMembers.tsx` passa a gravar em `public.user_roles` (as políticas atuais já permitem update/delete para `agency_admin` e super admin); reenvio de convite reutiliza a edge function `send-invitation-email`.
