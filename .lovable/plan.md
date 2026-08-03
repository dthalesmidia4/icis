# Gestor Operacional com área (Mídia / Sistemas)

Hoje existe uma única função "Gestor Operacional" (`agency_manager`), sem distinção de área. Lúcia atua na Mídia e Henrique em Sistemas, mas o sistema os trata igual. A proposta mantém uma única função e acrescenta a **área do gestor** como identificação, sem mudar poderes.

## O que o Gestor Operacional pode hoje (documentado na tela)

Verificado no código e no banco:

- **Fila de liberação**: vê a seção "Ainda não liberadas" em cada coluna e pode liberar/devolver cards (protegido no banco por `can_manage_release_queue` + gatilho `guard_demand_release`).
- **Reorganizar sequência**: botão de reorganização automática por coluna (gestor e super admin).
- **Visão completa**: enxerga todas as colunas de colaboradores; quem não é gestor abre a Visão Geral focada na própria coluna e só vê cards liberados.
- **Criação de demandas**: liberada pela função `can_create_demands`.
- **Área administrativa e gestão de equipe**: acesso a Minha Empresa / Acesso dos Colaboradores.
- **Liberação automática**: quando um colaborador conclui um card, o gatilho `trigger_auto_release_queue` libera o próximo respeitando o limite configurado — automação do sistema, não do gestor.

Essas regras continuam idênticas. A área do gestor será **apenas rótulo/identificação**.

## Mudanças

### 1. Área do gestor no cadastro
- Nova coluna `manager_work_area` (`work_area`, opcional) em `user_roles`. Vazio = sem área definida / ambas.
- Preenchimento inicial: Lúcia → Mídia, Henrique → Sistemas (feito por atualização de dados após a migração).

### 2. Tela "Acesso dos Colaboradores"
- Ao selecionar "Gestor Operacional", aparece ao lado um segundo seletor: **Mídia**, **Sistemas** ou **Ambas**.
- O seletor só é exibido para a função de gestor; ao trocar para outra função a área é limpa.
- Nome exibido passa a ser "Gestor Operacional · Mídia" / "· Sistemas" (ou só "Gestor Operacional" quando ambas).

### 3. Rótulos consistentes no restante do sistema
- `RoleBadge`, lista de membros, `ProfileSettings`, remoção de membro e convites passam a mostrar a área quando existir.
- Convite: ao escolher "Gestor Operacional" também é possível marcar a área, gravada junto ao aceitar o convite.

### 4. Painel explicativo de permissões
- Na tela "Acesso dos Colaboradores", um bloco recolhível **"O que cada função pode fazer"** listando em linguagem simples os itens da seção acima (liberar fila, reorganizar sequência, ver todas as colunas, criar demandas, acessar administração), deixando explícito que a área do gestor é informativa e não restringe ações.

## Detalhes técnicos

- Migração: `ALTER TABLE public.user_roles ADD COLUMN manager_work_area public.work_area;` (nulo permitido). Sem novo valor no enum `app_role`.
- Atualização de dados separada para definir as áreas de Lúcia e Henrique.
- `useAgencyRole` passa a expor `managerWorkArea` (lido do próprio registro em `user_roles`), sem alterar `isAgencyManager`, `canManageQueue` ou `canReorder`.
- Helper de rótulo em `src/lib/constants/roles.ts`: `getRoleLabel(role, managerWorkArea?)`.
- `TeamMembers.tsx`: seleção de função já editável ganha o seletor de área e grava `manager_work_area`.
- Convites: campo opcional adicional em `invitations` (`manager_work_area`) propagado por `use_invitation`.
- Nenhuma alteração em `releaseQueue.ts`, `reorderSequence.ts`, gatilhos de agenda ou validação de etapas.
