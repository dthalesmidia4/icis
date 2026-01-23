# 📚 Documentação Técnica do Sistema

## Plataforma de Gestão de Marketing para Agências

> Sistema completo de automação de planejamento de conteúdo e gestão de demandas com Inteligência Artificial

---

## 📋 Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura Multi-Tenant](#2-arquitetura-multi-tenant)
3. [Estrutura do Banco de Dados](#3-estrutura-do-banco-de-dados)
4. [Fluxo Operacional Completo](#4-fluxo-operacional-completo)
5. [Edge Functions (APIs)](#5-edge-functions-apis)
6. [Rotas da Aplicação](#6-rotas-da-aplicação)
7. [Contextos React](#7-contextos-react)
8. [Hooks Customizados](#8-hooks-customizados)
9. [Fluxo de Status do Kanban](#9-fluxo-de-status-do-kanban)
10. [Storage (Supabase)](#10-storage-supabase)
11. [Prompts Customizáveis](#11-prompts-customizáveis)
12. [Segurança (RLS)](#12-segurança-rls)
13. [Variáveis de Ambiente](#13-variáveis-de-ambiente)

---

## 1. Visão Geral

### 1.1 Propósito

Sistema SaaS para agências de marketing digital que automatiza o planejamento de conteúdo usando IA, gerencia demandas através de um Kanban visual e organiza o fluxo de trabalho entre agência e clientes.

### 1.2 Stack Tecnológica

| Camada | Tecnologias |
|--------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Backend** | Supabase (Auth, Database, Storage, Edge Functions) |
| **Inteligência Artificial** | OpenAI GPT-5 Mini |
| **Estado** | React Query (TanStack Query v5), Context API |
| **Roteamento** | React Router v6 |
| **Drag & Drop** | @hello-pangea/dnd |
| **Editor de Texto** | TipTap |
| **Geração de PDF** | jsPDF |
| **Gráficos** | Recharts |
| **Validação** | Zod, React Hook Form |

### 1.3 Funcionalidades Principais

- ✅ Autenticação e autorização multi-tenant
- ✅ Cadastro e gestão de clientes
- ✅ Perguntas guias para entender o cliente
- ✅ Geração de estratégia de marketing com IA
- ✅ Planejamento de período com geração de demandas (IA)
- ✅ Modo Normal vs Ultra (abordagens diferentes)
- ✅ Kanban de 5 colunas para gestão de demandas
- ✅ Anexos e arquivos por demanda
- ✅ Prompts customizáveis por agência

---

## 2. Arquitetura Multi-Tenant

### 2.1 Hierarquia Organizacional

```
┌─────────────────────────────────────────────────────────────┐
│                      SUPER ADMIN                             │
│              (Acesso total ao sistema)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        AGÊNCIA                               │
│                    (Tenant Raiz)                             │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  agency_admin   │  │   agency_user   │                   │
│  │ (Administrador) │  │   (Operador)    │                   │
│  └─────────────────┘  └─────────────────┘                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
│   CLIENTE A   │  │   CLIENTE B   │  │   CLIENTE C   │
│  (Empresa)    │  │  (Empresa)    │  │  (Empresa)    │
└───────────────┘  └───────────────┘  └───────────────┘
```

### 2.2 Roles e Permissões

| Role | Escopo | Permissões |
|------|--------|------------|
| `super_admin` | Sistema | Acesso irrestrito a todos os tenants |
| `agency_admin` | Agência | Gerenciar agência, clientes, usuários, prompts, APIs |
| `agency_user` | Agência | Operar clientes, criar demandas, usar Kanban |
| `client_admin` | Cliente | Gerenciar empresa específica |
| `client_user` | Cliente | Visualizar e aprovar demandas |

### 2.3 Isolamento de Dados

- Cada agência é um `tenant` isolado
- Clientes são `tenant_companies` vinculadas ao tenant
- Row-Level Security (RLS) garante isolamento completo
- Função `user_has_tenant_access()` valida acesso hierárquico

---

## 3. Estrutura do Banco de Dados

### 3.1 Tabelas Principais

| Tabela | Descrição | Chave Estrangeira Principal |
|--------|-----------|----------------------------|
| `tenants` | Organizações (agências) | - |
| `profiles` | Perfis de usuários | `auth.users.id` |
| `user_roles` | Papéis dos usuários por tenant | `profiles.id`, `tenants.id` |
| `tenant_companies` | Empresas/clientes cadastrados | `tenants.id` |
| `strategies` | Estratégias globais de marketing | `tenant_companies.id` |
| `question_sessions` | Sessões de perguntas guias | `tenant_companies.id` |
| `period_plans` | Planejamentos de período | `tenant_companies.id` |
| `cards` | Demandas/tarefas do Kanban | `period_plans.id` |
| `system_prompts` | Prompts customizáveis | `tenants.id` |
| `api_keys` | Chaves de API (OpenAI) | `tenants.id` |

### 3.2 Diagrama de Relacionamentos (ER)

```
┌──────────────┐
│   tenants    │
│──────────────│
│ id (PK)      │
│ name         │
│ tenant_type  │
│ parent_id    │◄─────────────────────────────────────┐
└──────┬───────┘                                      │
       │                                              │
       │ 1:N                                          │
       ▼                                              │
┌──────────────────┐     ┌─────────────────┐          │
│ tenant_companies │     │    profiles     │          │
│──────────────────│     │─────────────────│          │
│ id (PK)          │     │ id (PK/FK)      │──────────┤
│ tenant_id (FK)   │◄────│ tenant_id (FK)  │          │
│ name             │     │ full_name       │          │
│ segment          │     │ avatar_url      │          │
│ logo_url         │     └────────┬────────┘          │
└────────┬─────────┘              │                   │
         │                        │ 1:N               │
         │ 1:N                    ▼                   │
         │              ┌─────────────────┐           │
         │              │   user_roles    │           │
         │              │─────────────────│           │
         │              │ id (PK)         │           │
         │              │ user_id (FK)    │           │
         │              │ tenant_id (FK)  │───────────┘
         │              │ role            │
         │              └─────────────────┘
         │
         ├──────────────────────┐
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌──────────────────┐
│   strategies    │    │ question_sessions│
│─────────────────│    │──────────────────│
│ id (PK)         │    │ id (PK)          │
│ company_id (FK) │    │ company_id (FK)  │
│ tenant_id (FK)  │    │ tenant_id (FK)   │
│ strategy_text   │    │ answers (JSONB)  │
└─────────────────┘    └──────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐
│    period_plans     │
│─────────────────────│
│ id (PK)             │
│ company_id (FK)     │
│ tenant_id (FK)      │
│ period_title        │
│ period_start        │
│ period_end          │
│ objective           │
│ priority_channel    │
│ budget              │
│ default_plan (JSON) │
│ ultra_plan (JSON)   │
│ final_plan (JSON)   │
│ primary_mode        │
│ status              │
│ operational_status  │
└──────────┬──────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐
│       cards         │
│─────────────────────│
│ id (PK)             │
│ period_plan_id (FK) │
│ tenant_id (FK)      │
│ title               │
│ objetivo            │
│ description         │
│ instrucoes          │
│ delivery_date       │
│ status              │
│ attachments (JSON)  │
│ publication_dates   │
└─────────────────────┘
```

### 3.3 Schema Detalhado: `period_plans`

```sql
CREATE TABLE period_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  company_id UUID NOT NULL REFERENCES tenant_companies(id),
  
  -- Dados do Período
  period_title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  objective TEXT,
  priority_channel TEXT,
  budget NUMERIC,
  restrictions TEXT,
  observations TEXT,
  
  -- Planos Gerados pela IA
  default_plan JSONB,        -- Plano modo Normal
  ultra_plan JSONB,          -- Plano modo Ultra
  final_plan JSONB,          -- Plano final aprovado
  
  -- Sumários
  normal_summary TEXT,
  ultra_summary TEXT,
  
  -- Seleções do Usuário
  primary_mode TEXT,         -- 'normal' ou 'ultra'
  optional_package JSONB,    -- Pacote inteligente
  optional_package_accepted BOOLEAN DEFAULT false,
  
  -- Status do Workflow
  status TEXT DEFAULT 'draft',
  -- Valores: draft → generating → generated → mode_selected → completed
  
  -- Status Operacional
  operational_status TEXT DEFAULT 'em_planejamento',
  -- Valores: em_planejamento → em_andamento → concluido
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 Schema Detalhado: `cards`

```sql
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  period_plan_id UUID REFERENCES period_plans(id),
  
  -- Conteúdo
  title TEXT NOT NULL,
  objetivo TEXT,
  description TEXT,           -- Conteúdo principal (Markdown)
  instrucoes TEXT,            -- Instruções de produção
  
  -- Metadados
  tipo TEXT,                  -- Tipo de peça (Carrossel, Reels, etc.)
  canal TEXT,                 -- Canal de publicação
  cta_recomendado TEXT,       -- Call-to-action sugerido
  
  -- Datas
  delivery_date DATE,
  publication_dates JSONB,    -- Datas de publicação agendadas
  
  -- Status do Kanban
  status TEXT DEFAULT 'unassigned',
  -- Valores: unassigned → planejamento → producao → revisao → 
  --          aguardando_cliente → agendar_publicacao
  
  -- Arquivos
  file_location TEXT,
  attachments JSONB,          -- Array de anexos
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.5 Estrutura de Demanda (JSONB)

Estrutura de cada item em `default_plan` e `ultra_plan`:

```json
{
  "tipo": "Carrossel (5 slides)",
  "titulo": "5 Erros que Estão Travando Seu Crescimento",
  "objetivo": "Educar a audiência sobre erros comuns",
  "conteudo": "## SLIDE 1\n**Título:** Você está cometendo esses erros?\n\n## SLIDE 2\n...",
  "instrucoes_de_producao": "Usar cores da identidade visual. Tipografia bold para títulos.",
  "cta_recomendado": "Salve esse post para consultar depois!",
  "canal": "Instagram",
  "data_sugerida": "2025-02-15"
}
```

---

## 4. Fluxo Operacional Completo

### 4.1 Jornada do Usuário

```
┌─────────────────────────────────────────────────────────────┐
│                    1. AUTENTICAÇÃO                          │
│                      /auth                                   │
│              Login ou Cadastro                               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  2. SETUP AGÊNCIA                           │
│                   /agency-setup                              │
│         (Apenas no primeiro acesso)                          │
│   • Nome da agência                                          │
│   • Dados iniciais                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      3. HOME                                 │
│                       /home                                  │
│   • Visão geral                                              │
│   • Acesso rápido a clientes                                 │
│   • Kanban Central                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
           ┌──────────────┴──────────────┐
           │                             │
           ▼                             ▼
┌─────────────────────┐     ┌─────────────────────────────────┐
│  4. CADASTRAR       │     │     KANBAN CENTRAL              │
│     CLIENTE         │     │     /kanban-central             │
│   /registration     │     │  (Visão geral de todas          │
│                     │     │   as demandas da agência)       │
└──────────┬──────────┘     └─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                   5. CLIENT HUB                              │
│                    /client-hub                               │
│   Hub de controle do cliente selecionado                     │
│   • Perguntas Guias                                          │
│   • Estratégia Geral                                         │
│   • Planejar Período                                         │
│   • Ver Demandas                                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐
│ 6. PERGUNTAS  │ │ 7. ESTRATÉGIA │ │ 8. PERÍODO        │
│    GUIAS      │ │    GERAL      │ │   /plan-period    │
│ /client-guide │ │  /strategies  │ │                   │
│               │ │               │ │ • Título          │
│ 7 perguntas   │ │ IA gera       │ │ • Datas           │
│ estratégicas  │ │ estratégia    │ │ • Objetivo        │
│ sobre o       │ │ completa      │ │ • Canal           │
│ negócio       │ │               │ │ • Orçamento       │
└───────────────┘ └───────────────┘ └─────────┬─────────┘
                                              │
                                              ▼
                           ┌──────────────────────────────────┐
                           │      9. SELEÇÃO DE MODO          │
                           │                                   │
                           │  ┌─────────┐    ┌─────────┐      │
                           │  │ NORMAL  │ ou │  ULTRA  │      │
                           │  │(Seguro) │    │(Ousado) │      │
                           │  └─────────┘    └─────────┘      │
                           │                                   │
                           │  + Pacote Inteligente (opcional) │
                           └───────────────┬──────────────────┘
                                           │
                                           ▼
                           ┌──────────────────────────────────┐
                           │        10. KANBAN                │
                           │         /schedule                │
                           │                                   │
                           │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
                           │  │PLAN│→│PROD│→│REV │→│CLI │→│PUB │
                           │  └────┘ └────┘ └────┘ └────┘ └────┘
                           └──────────────────────────────────┘
```

### 4.2 Workflow de Planejamento de Período

```
┌─────────────────┐
│  1. FORMULÁRIO  │
│  Preencher dados│
│  do período     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. LOADING     │
│  IA processando │
│  (polling)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. SELEÇÃO     │
│  Normal vs Ultra│
│  (2 cards)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. PACOTE      │
│  INTELIGENTE    │
│  (opcional)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. REVIEW      │
│  DemandReviewModal│
│  Selecionar demandas│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. COMPLETO    │
│  Integrar com   │
│  Kanban         │
└─────────────────┘
```

---

## 5. Edge Functions (APIs)

### 5.1 `generate-strategy`

**Endpoint:** `POST /functions/v1/generate-strategy`

**Descrição:** Gera uma estratégia de marketing completa baseada nas respostas das perguntas guias.

**Headers:**
```
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "companyId": "uuid-da-empresa",
  "tenantId": "uuid-do-tenant",
  "answers": {
    "question_0": "Resposta sobre o negócio",
    "question_1": "Resposta sobre público-alvo",
    "question_2": "Resposta sobre diferenciais",
    "question_3": "Resposta sobre objetivos",
    "question_4": "Resposta sobre concorrentes",
    "question_5": "Resposta sobre tom de voz",
    "question_6": "Resposta sobre restrições"
  }
}
```

**Response (200 OK):**
```json
{
  "strategyId": "uuid-da-estrategia",
  "strategyText": "## POSICIONAMENTO DE MARCA\n\n### Proposta de Valor\n..."
}
```

**Fluxo Interno:**

```
1. Validar payload (companyId, tenantId, answers)
         │
         ▼
2. Buscar dados da empresa
   SELECT * FROM tenant_companies WHERE id = companyId
         │
         ▼
3. Buscar prompt customizado
   SELECT prompt_text FROM system_prompts 
   WHERE tenant_id = tenantId 
   AND prompt_key = 'generate_strategy_prompt'
         │
         ▼
4. Buscar API Key da OpenAI
   SELECT key_value FROM api_keys 
   WHERE tenant_id = tenantId 
   AND key_name = 'OPENAI_API_KEY'
         │
         ▼
5. Chamar OpenAI GPT-5 Mini
   POST https://api.openai.com/v1/chat/completions
   {
     "model": "gpt-5-mini",
     "messages": [
       { "role": "system", "content": prompt },
       { "role": "user", "content": contexto + respostas }
     ]
   }
         │
         ▼
6. Salvar/Atualizar estratégia
   UPSERT INTO strategies (company_id, tenant_id, strategy_text)
         │
         ▼
7. Retornar { strategyId, strategyText }
```

**Modelo de IA:** OpenAI GPT-5 Mini

---

### 5.2 `generate-period-plans`

**Endpoint:** `POST /functions/v1/generate-period-plans`

**Descrição:** Gera dois planos de demandas (Normal e Ultra) para um período específico.

**Headers:**
```
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "periodPlanId": "uuid-do-period-plan",
  "tenantId": "uuid-do-tenant"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "default_plan": [
    {
      "tipo": "Carrossel (5 slides)",
      "titulo": "5 Dicas para Aumentar suas Vendas",
      "objetivo": "Educar sobre técnicas de vendas",
      "conteudo": "## SLIDE 1\n...",
      "instrucoes_de_producao": "Usar cores corporativas...",
      "cta_recomendado": "Salve para depois!",
      "canal": "Instagram",
      "data_sugerida": "2025-02-10"
    }
  ],
  "ultra_plan": [
    {
      "tipo": "Reels (60s)",
      "titulo": "O Segredo que Ninguém Conta",
      "objetivo": "Gerar curiosidade e engajamento",
      "conteudo": "## ROTEIRO\n...",
      "instrucoes_de_producao": "Edição dinâmica, cortes rápidos...",
      "cta_recomendado": "Comente 'EU QUERO'",
      "canal": "Instagram",
      "data_sugerida": "2025-02-12"
    }
  ],
  "normal_summary": "Abordagem tradicional focada em conteúdo educativo...",
  "ultra_summary": "Abordagem ousada com foco em viralização..."
}
```

**Fluxo Interno:**

```
1. Validar payload (periodPlanId, tenantId)
         │
         ▼
2. Buscar period_plan
   SELECT * FROM period_plans WHERE id = periodPlanId
         │
         ▼
3. Buscar empresa
   SELECT * FROM tenant_companies WHERE id = period_plan.company_id
         │
         ▼
4. Buscar estratégia
   SELECT strategy_text FROM strategies WHERE company_id = company.id
         │
         ▼
5. Buscar respostas das perguntas guias
   SELECT answers FROM question_sessions WHERE company_id = company.id
         │
         ▼
6. Buscar prompt OBRIGATÓRIO
   SELECT prompt_text FROM system_prompts 
   WHERE tenant_id = tenantId 
   AND prompt_key = 'generate_demandas_prompt'
   
   ⚠️ ERRO se não encontrar!
         │
         ▼
7. Buscar API Key
   SELECT key_value FROM api_keys 
   WHERE tenant_id = tenantId 
   AND key_name = 'OPENAI_API_KEY'
         │
         ▼
8. Montar contexto completo
   {
     empresa: { nome, segmento, site, ... },
     estrategia: strategy_text,
     respostas: answers,
     periodo: { titulo, inicio, fim, objetivo, canal, budget, ... }
   }
         │
         ▼
9. Chamar OpenAI GPT-5 Mini
   POST https://api.openai.com/v1/chat/completions
   {
     "model": "gpt-5-mini",
     "messages": [
       { "role": "system", "content": prompt_customizado },
       { "role": "user", "content": JSON.stringify(contexto) }
     ],
     "response_format": { "type": "json_object" }
   }
         │
         ▼
10. Processar e validar resposta JSON
          │
          ▼
11. Atualizar period_plan
    UPDATE period_plans SET
      default_plan = resultado.default_plan,
      ultra_plan = resultado.ultra_plan,
      normal_summary = resultado.normal_summary,
      ultra_summary = resultado.ultra_summary,
      status = 'generated'
    WHERE id = periodPlanId
          │
          ▼
12. Retornar resultado
```

**Modelo de IA:** OpenAI GPT-5 Mini

**Estrutura Esperada da Resposta da IA:**
```json
{
  "default_plan": [
    {
      "tipo": "string",
      "titulo": "string",
      "objetivo": "string",
      "conteudo": "string (markdown)",
      "instrucoes_de_producao": "string",
      "cta_recomendado": "string",
      "canal": "string",
      "data_sugerida": "YYYY-MM-DD"
    }
  ],
  "ultra_plan": [...],
  "normal_summary": "string",
  "ultra_summary": "string"
}
```

---

## 6. Rotas da Aplicação

| Rota | Componente | Proteção | Descrição |
|------|------------|----------|-----------|
| `/auth` | `Auth` | Pública | Login e cadastro de usuários |
| `/agency-setup` | `AgencySetup` | `ProtectedRoute` | Configuração inicial da agência |
| `/` | `Index` | Redirect | Redireciona para `/home` ou `/auth` |
| `/home` | `Home` | `ProtectedRoute` + `RequireTenant` | Dashboard principal |
| `/clientes` | `ClientList` | `ProtectedRoute` + `RequireTenant` | Lista de clientes |
| `/clientes/:id` | `ClientDetails` | `ProtectedRoute` + `RequireTenant` | Detalhes do cliente |
| `/registration` | `CompanyRegistration` | `ProtectedRoute` + `RequireTenant` | Cadastro de novo cliente |
| `/client-hub` | `ClientHub` | `ProtectedRoute` + `RequireTenant` | Hub do cliente selecionado |
| `/client-guide` | `GenerateQuestions` | `ProtectedRoute` + `RequireTenant` | Perguntas guias |
| `/strategies` | `StrategyCreation` | `ProtectedRoute` + `RequireTenant` | Geração de estratégia |
| `/plan-period` | `PlanPeriod` | `ProtectedRoute` + `RequireTenant` | Planejamento de período |
| `/schedule` | `Schedule` | `ProtectedRoute` + `RequireTenant` | Kanban do cliente |
| `/kanban-central` | `KanbanCentralPage` | `ProtectedRoute` + `RequireTenant` | Kanban geral da agência |
| `/dev-hub` | `DevHub` | `ProtectedRoute` + `RequireTenant` | Área de desenvolvimento |
| `/dev/prompts` | `DevPrompts` | `ProtectedRoute` + `RequireTenant` | Gerenciar prompts |
| `/dev/apis` | `DevApis` | `ProtectedRoute` + `RequireTenant` | Gerenciar API keys |
| `/dev/webhooks` | `DevWebhooks` | `ProtectedRoute` + `RequireTenant` | Gerenciar webhooks |
| `/profile-settings` | `ProfileSettings` | `ProtectedRoute` | Configurações de perfil |
| `/admin` | `AdminDashboard` | `ProtectedRoute` + `RequireTenant` | Painel administrativo |
| `*` | `NotFound` | Pública | Página 404 |

### 6.1 Proteção de Rotas

**`ProtectedRoute`:** Verifica se o usuário está autenticado. Redireciona para `/auth` se não estiver.

**`RequireTenant`:** Verifica se o usuário tem um tenant associado. Redireciona para `/agency-setup` se não tiver.

---

## 7. Contextos React

### 7.1 TenantContext

**Arquivo:** `src/contexts/TenantContext.tsx`

**Responsabilidade:** Gerencia o tenant (agência) do usuário logado.

**Interface:**
```typescript
interface TenantContextType {
  tenantId: string | null;
  tenantType: 'agency' | 'client' | 'subclient' | null;
  tenantName: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshTenant: () => Promise<void>;
}
```

**Uso:**
```tsx
const { tenantId, tenantName, isLoading } = useTenant();
```

**Comportamento:**
- Carrega automaticamente ao montar
- Busca `profiles.tenant_id` do usuário
- Busca dados do tenant em `tenants`
- Retry automático com backoff exponencial (até 3 tentativas)

---

### 7.2 SelectedClientContext

**Arquivo:** `src/contexts/SelectedClientContext.tsx`

**Responsabilidade:** Gerencia o cliente atualmente selecionado na sessão.

**Interface:**
```typescript
interface SelectedClientContextType {
  selectedClient: TenantCompany | null;
  setSelectedClient: (client: TenantCompany | null) => void;
  clearSelectedClient: () => void;
}
```

**Persistência:** `sessionStorage` (limpa ao fechar aba)

**Uso:**
```tsx
const { selectedClient, setSelectedClient } = useSelectedClient();
```

---

### 7.3 ThemeContext

**Arquivo:** `src/contexts/ThemeContext.tsx`

**Responsabilidade:** Gerencia tema claro/escuro.

**Uso:**
```tsx
const { theme, setTheme } = useTheme();
// theme: 'light' | 'dark' | 'system'
```

---

## 8. Hooks Customizados

### 8.1 useAuth

**Arquivo:** `src/hooks/useAuth.tsx`

**Retorno:**
```typescript
{
  user: User | null;           // Usuário autenticado
  session: Session | null;     // Sessão ativa
  isLoading: boolean;          // Estado de carregamento
  signUp: (email, password, fullName) => Promise<AuthResponse>;
  signIn: (email, password) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
}
```

**Comportamento:**
- Subscreve em `onAuthStateChange`
- Limpa `localStorage` em `SIGNED_OUT`
- Hidrata sessão inicial com `getSession()`

---

### 8.2 useLocalPlanState

**Arquivo:** `src/hooks/useLocalPlanState.tsx`

**Responsabilidade:** Gerencia estado local do planejamento de período (para recuperação de sessão interrompida).

---

### 8.3 useSmartSearch

**Arquivo:** `src/hooks/useSmartSearch.tsx`

**Responsabilidade:** Busca inteligente com debounce e filtros.

---

### 8.4 useVoiceSearch

**Arquivo:** `src/hooks/useVoiceSearch.tsx`

**Responsabilidade:** Busca por reconhecimento de voz (Web Speech API).

---

## 9. Fluxo de Status do Kanban

### 9.1 Colunas do Kanban

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PLANEJAMENTO  │    │    PRODUÇÃO     │    │     REVISÃO     │
│                 │    │                 │    │                 │
│  planejamento   │ →  │    producao     │ →  │     revisao     │
│                 │    │                 │    │                 │
│ Demandas em     │    │ Em criação/     │    │ Aguardando      │
│ definição       │    │ desenvolvimento │    │ revisão interna │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────┐    ┌─────────────────────┐
│       AGENDAR PUBLICAÇÃO            │    │  AGUARDANDO CLIENTE │
│                                     │    │                     │
│       agendar_publicacao            │ ←  │  aguardando_cliente │
│                                     │    │                     │
│ Pronto para agendar                 │    │ Esperando aprovação │
│ nas redes sociais                   │    │ do cliente          │
└─────────────────────────────────────┘    └─────────────────────┘
```

### 9.2 Mapeamento de Status

| Status DB | Coluna Visual | Descrição |
|-----------|---------------|-----------|
| `unassigned` | (não exibido) | Demanda criada mas não atribuída |
| `planejamento` | Planejamento | Em fase de planejamento |
| `producao` | Produção | Em desenvolvimento/criação |
| `revisao` | Revisão | Aguardando revisão interna |
| `aguardando_cliente` | Aguardando Cliente | Enviado para aprovação do cliente |
| `agendar_publicacao` | Agendar Publicação | Aprovado, pronto para publicar |

### 9.3 Transições Permitidas

- Drag & Drop entre qualquer coluna adjacente
- Atualização via `UPDATE cards SET status = ?`

---

## 10. Storage (Supabase)

### 10.1 Buckets Configurados

| Bucket | Público | Uso | Estrutura |
|--------|---------|-----|-----------|
| `company-logos` | ✅ Sim | Logos das empresas | `{tenant_id}/{company_id}/{filename}` |
| `card-attachments` | ✅ Sim | Anexos dos cards | `{tenant_id}/{card_id}/{filename}` |

### 10.2 Políticas de Acesso

Ambos os buckets são públicos para leitura. Upload restrito a usuários autenticados com acesso ao tenant.

---

## 11. Prompts Customizáveis

### 11.1 Tabela `system_prompts`

```sql
CREATE TABLE system_prompts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  prompt_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, prompt_key)
);
```

### 11.2 Prompts Disponíveis

| prompt_key | Uso | Obrigatório |
|------------|-----|-------------|
| `generate_strategy_prompt` | Geração de estratégia global de marketing | Não (usa default) |
| `generate_demandas_prompt` | Geração de demandas por período | ✅ **SIM** |

### 11.3 Configuração

Acesse `/dev/prompts` para criar/editar prompts customizados.

**⚠️ IMPORTANTE:** O prompt `generate_demandas_prompt` é **obrigatório** para a geração de períodos. A Edge Function retornará erro se não existir.

---

## 12. Segurança (RLS)

### 12.1 Conceito

Row-Level Security (RLS) é uma feature do PostgreSQL que permite definir políticas de acesso em nível de linha. Cada tabela tem políticas que determinam quais linhas cada usuário pode ver/modificar.

### 12.2 Funções de Segurança

**`has_role(user_id, role)`**
```sql
-- Verifica se usuário tem determinado role
SELECT has_role(auth.uid(), 'agency_admin');
```

**`user_has_tenant_access(user_id, tenant_id)`**
```sql
-- Verifica acesso hierárquico ao tenant
-- Considera: super_admin, mesmo tenant, tenant pai (agência)
SELECT user_has_tenant_access(auth.uid(), 'uuid-do-tenant');
```

**`get_user_tenant(user_id)`**
```sql
-- Retorna o tenant_id do usuário
SELECT get_user_tenant(auth.uid());
```

**`get_tenant_descendants(tenant_id)`**
```sql
-- Retorna todos os tenants filhos (clientes da agência)
SELECT * FROM get_tenant_descendants('uuid-da-agencia');
```

### 12.3 Exemplo de Política RLS

```sql
-- Política para cards: usuário só vê cards do seu tenant
CREATE POLICY "Users can view cards from their tenant" ON cards
  FOR SELECT
  USING (
    user_has_tenant_access(auth.uid(), tenant_id)
  );

-- Política para insert: usuário só cria no próprio tenant
CREATE POLICY "Users can create cards in their tenant" ON cards
  FOR INSERT
  WITH CHECK (
    user_has_tenant_access(auth.uid(), tenant_id)
  );
```

### 12.4 Isolamento Garantido

- ✅ Agência A não vê dados da Agência B
- ✅ Cliente X não vê dados do Cliente Y
- ✅ Super Admin vê tudo
- ✅ Agência vê todos os seus clientes
- ✅ Cliente vê apenas seus próprios dados

---

## 13. Variáveis de Ambiente

### 13.1 Frontend (Vite)

```env
# .env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 13.2 Edge Functions (Supabase Secrets)

| Secret | Descrição | Configuração |
|--------|-----------|--------------|
| `SUPABASE_URL` | URL do projeto Supabase | Automático |
| `SUPABASE_ANON_KEY` | Chave anônima | Automático |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (admin) | Automático |
| `LOVABLE_API_KEY` | API key do Lovable | Automático |

### 13.3 API Keys por Tenant (Banco de Dados)

As API keys são armazenadas por tenant na tabela `api_keys`:

```sql
-- Estrutura
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  key_name TEXT NOT NULL,      -- Ex: 'OPENAI_API_KEY'
  key_value TEXT NOT NULL,     -- Valor criptografado
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(tenant_id, key_name)
);
```

**Configuração:** Acesse `/dev/apis` para gerenciar as API keys da sua agência.

---

## 📝 Changelog

| Data | Versão | Alterações |
|------|--------|------------|
| 2025-01-23 | 1.0.0 | Documentação inicial criada |

---

## 🤝 Contribuição

Para contribuir com este projeto:

1. Entenda a arquitetura multi-tenant
2. Siga os padrões de código existentes
3. Mantenha o isolamento de dados via RLS
4. Documente novas funcionalidades

---

## 📧 Suporte

Para dúvidas técnicas, consulte esta documentação ou entre em contato com a equipe de desenvolvimento.
