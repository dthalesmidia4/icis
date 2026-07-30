## Diagnóstico (verificado no banco)

- Todas as 9 empresas em `tenant_companies` têm `default_work_area` **nulo**. O filtro atual em `src/lib/clientHealth.ts` trata nulo como "serve para qualquer área", então as 8 empresas de Mídia aparecem no Customer Success · Sistemas.
- Demandas: `sistemas` só existe para SmartVety (10 cards) e 1 card em D'thales Midia; todas as outras empresas têm apenas demandas de `midia`.
- Não existe hoje nenhuma estrutura para cadastrar os **clientes da SmartVety** (as clínicas). Essa era a premissa errada do plano anterior: ele assumiu que os "clientes de Sistemas" seriam empresas de `tenant_companies`.

## O que será construído

### 1. Nova estrutura: clientes de Sistemas (sub-clientes)
Nova tabela `systems_clients`, sempre vinculada a uma empresa de Sistemas (a SmartVety):
- `tenant_id`, `parent_company_id` (→ `tenant_companies`), `name`, `contact_name`, `email`, `phone`, `city/state`, `plan` (texto livre), `notes`
- `contact_cadence_days` (padrão 30), `status` (ativo/pausado/cancelado), `onboarded_at`, timestamps
- Grants para `authenticated`/`service_role`, RLS por tenant (mesmo padrão de `client_touchpoints`), trigger de `updated_at`

Cadastro leve: só o nome é obrigatório.

### 2. Vínculo opcional nas demandas e nos contatos
- `demands.subclient_id` (nulo por padrão): o card continua pertencendo à SmartVety, mas pode indicar a clínica atendida.
- `client_touchpoints.subclient_id` (nulo): permite registrar contato com a clínica.

### 3. Correção dos dados atuais
- `default_work_area = 'midia'` nas 8 empresas de Mídia; `'sistemas'` na SmartVety.
- A partir daí o filtro passa a ser **estrito**: Mídia mostra só Mídia, Sistemas só Sistemas — sem o fallback "nulo vale para tudo".

### 4. Customer Success · Sistemas reescrito
A tela passa a listar **clientes da SmartVety** (não empresas):
- Linhas = `systems_clients` das empresas de área `sistemas`
- Colunas: cliente (+ empresa de sistemas), saúde/score, último contato, cadência, demandas abertas/atrasadas vinculadas ao sub-cliente, contatos 30d, ação "Contato"
- Health score reaproveita a lógica atual (cadência estourada, atrasos, inatividade), agora medida por sub-cliente
- Estado vazio com botão direto para cadastrar clientes
- Registro manual de contato grava `subclient_id`

### 5. Nova tela de cadastro
Rota `/clientes-sistemas`: lista + criar/editar/arquivar clientes de Sistemas, com seletor da empresa de Sistemas dona (SmartVety), busca e status. Acesso pelo header do Customer Success e pelo Kanban Central.

### 6. Card de demanda (Sistemas)
No `TaskCard` e na criação de demanda, quando `work_area = 'sistemas'`: seletor opcional "Cliente da SmartVety", carregado dos sub-clientes da empresa do card. Sem impacto em Mídia.

## Detalhes técnicos

- Migração: `CREATE TABLE public.systems_clients` (+ GRANT + RLS + policies + trigger), `ALTER TABLE demands ADD COLUMN subclient_id uuid`, `ALTER TABLE client_touchpoints ADD COLUMN subclient_id uuid` (FKs com `ON DELETE SET NULL`), índices por `tenant_id`/`parent_company_id`.
- Atualização de dados (`default_work_area`) via operação de dados separada, após a migração.
- `src/lib/clientHealth.ts`: nova função `loadSystemsClientHealth(tenantId)` para sub-clientes; `loadClientHealth` passa a filtrar área estritamente (nulo = mídia).
- `src/lib/recordTouchpoint.ts`: `recordManualTouchpoint` aceita `subclientId`.
- `src/pages/CustomerSuccessSistemas.tsx` reescrita; nova `src/pages/SystemsClients.tsx` + rota em `App.tsx`.
- Sem alteração no motor de fluxo/reorganização — `subclient_id` é puramente informativo/relatorial.
