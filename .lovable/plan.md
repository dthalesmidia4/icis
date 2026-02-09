

## Limpeza geral do sistema: tabelas legadas, colunas duplicadas, componentes sem uso e seguranca

Este plano abrange a remocao completa de elementos legados no banco de dados, frontend e rotas, alem da correcao de seguranca na tabela `api_keys`.

---

### FASE 1 -- Migracao SQL (banco de dados)

Uma unica migracao SQL que executa todas as alteracoes de schema:

```text
1. DROP TABLE companies (legada, substituida por tenant_companies)
2. DROP TABLE marketing_plans (legada, substituida por period_plans)
3. ALTER TABLE demands DROP COLUMNS:
   - objetivo (duplica objective)
   - instrucoes (duplica instructions)
   - column_name (duplica pipeline_statuses.name via status_id)
   - plan_id (legado, substituido por period_plan_id)
   - publication_dates (jsonb legado, substituido por publish_date + publish_time)
   - delivery_date (duplica due_date)
   - file_location (duplica channel)
4. Corrigir RLS da tabela api_keys:
   - DROP POLICY "Allow authenticated users to manage API keys"
   - CREATE POLICY para SELECT: apenas super_admin OU usuario do mesmo tenant
   - CREATE POLICY para INSERT/UPDATE: apenas super_admin OU agency_admin do tenant
```

**Detalhes da RLS de api_keys:**
A tabela `api_keys` nao possui coluna `tenant_id`, entao a politica sera restrita a super_admins. Se no futuro a tabela precisar ser multi-tenant, sera necessario adicionar `tenant_id`.

```text
-- Politica restritiva: somente super_admins podem gerenciar api_keys
DROP POLICY "Allow authenticated users to manage API keys" ON api_keys;
CREATE POLICY "super_admins_manage_api_keys" ON api_keys FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
```

---

### FASE 2 -- Refatorar interface KanbanCardData

O componente `TaskCard.tsx` define a interface `KanbanCardData` com campos legados. Sera refatorada para usar os nomes reais da tabela `demands`:

```text
Mapeamento de campos (legado -> novo):
  objetivo        -> objective
  instrucoes      -> instructions  
  column_name     -> status (ja existe, sera o unico)
  delivery_date   -> due_date
  file_location   -> channel
  plan_id         -> period_plan_id (ja existe)
  publication_dates -> removido (usar publish_date + publish_time direto)
```

A interface `KanbanCardData` passara a ser:

```text
interface KanbanCardData {
  id: string
  title: string
  status: string
  due_date: string
  channel: string | null
  objective: string | null
  description: string | null
  instructions: string | null
  observations: string | null
  period_plan_id: string | null
  tenant_id: string
  created_at: string
  updated_at: string
  attachments: Attachment[] | null
  publish_date: string | null
  publish_time: string | null
  source?: string
  clientId?: string
  clientName?: string
}
```

`PublicationDate` interface sera removida -- o sistema usara `publish_date` (date) + `publish_time` (string "HH:MM") diretamente.

---

### FASE 3 -- Atualizar componentes que mapeiam demands para KanbanCardData

**3 arquivos** fazem o mapeamento de dados do Supabase para `KanbanCardData`:

**3a. `src/pages/KanbanCentralPage.tsx`**
- Remover mapeamento de `(demand as any).objetivo`, `instrucoes`, `delivery_date`, `file_location`, `publication_dates`, `plan_id`
- Mapear direto: `objective`, `instructions`, `due_date`, `channel`, `publish_date`, `publish_time`
- Atualizar `handleSaveCard` para gravar nos campos corretos sem traducao

**3b. `src/pages/Schedule.tsx`**
- Mesmo mapeamento que acima
- Atualizar `handleSaveCard` e `handleSchedulePublication`

**3c. `src/components/Scheduled.tsx`**
- Mesmo mapeamento que acima
- Atualizar `handleCardChange`

---

### FASE 4 -- Atualizar TaskCard.tsx

O `TaskCard.tsx` (977 linhas) usa extensivamente os campos legados. Alteracoes:

- Substituir todas as referencias a `objetivo` por `objective`
- Substituir `instrucoes` por `instructions`
- Substituir `column_name` por `status`
- Substituir `delivery_date` por `due_date`
- Substituir `file_location` por `channel`
- Substituir logica de `publication_dates` (array) por `publish_date` + `publish_time` (campos simples)
- Remover `addPublicationDate`, `removePublicationDate` (multiplas datas nao sao mais suportadas)
- O date picker de publicacao editara `publish_date` e `publish_time` diretamente
- Remover `plan_id` das referencias

---

### FASE 5 -- Remover componentes e rotas sem uso

**5a. Remover `src/pages/Index.tsx`**
- Nao e importado em nenhum lugar (nem no App.tsx)
- Deletar arquivo

**5b. Remover `src/components/MonthSelectionModal.tsx`**
- Nao e importado em nenhum lugar
- Deletar arquivo

**5c. Remover `src/components/RichTextEditor.tsx`**
- Substituido por `BlockEditor.tsx`, nao e importado
- Deletar arquivo

**5d. Remover `src/hooks/useLocalPlanState.tsx`**
- Nao e importado em nenhum lugar
- Deletar arquivo

**5e. Remover rota duplicada `/generate-questions`**
- Em `src/App.tsx`: remover o bloco `<Route path="/generate-questions" ...>`
- Manter apenas `/client-guide` (que ja e usado pelo sidebar e ClientHub)
- Em `src/components/AppSidebar.tsx`: trocar `url: "/generate-questions"` para `url: "/client-guide"`
- Em `src/hooks/useBreadcrumb.tsx`: remover entrada `/generate-questions`

---

### FASE 6 -- Atualizar types.ts (automatico)

O arquivo `src/integrations/supabase/types.ts` sera regenerado automaticamente apos a migracao SQL, refletindo a remocao das tabelas `companies`, `marketing_plans` e das colunas da `demands`.

---

### Resumo de impacto

| Item | Acao | Arquivos afetados |
|------|------|-------------------|
| Tabela `companies` | DROP TABLE | migracao SQL |
| Tabela `marketing_plans` | DROP TABLE | migracao SQL |
| 7 colunas de `demands` | DROP COLUMN | migracao SQL |
| RLS `api_keys` | Corrigir para super_admin | migracao SQL |
| `KanbanCardData` interface | Refatorar campos | TaskCard.tsx |
| Mapeamento demands | Simplificar | KanbanCentralPage, Schedule, Scheduled |
| `Index.tsx` | Deletar | - |
| `MonthSelectionModal.tsx` | Deletar | - |
| `RichTextEditor.tsx` | Deletar | - |
| `useLocalPlanState.tsx` | Deletar | - |
| Rota `/generate-questions` | Remover duplicata | App.tsx, AppSidebar, useBreadcrumb |

### O que NAO muda
- Tabela `demands` continua com todos os campos ativos (`objective`, `instructions`, `due_date`, `channel`, `publish_date`, `publish_time`, `period_plan_id`, etc.)
- Fluxo de Kanban, agendamento e publicacao continuam funcionando
- Edge functions `generate-period-plans` e `generate-strategy` continuam usando `api_keys` (agora com RLS correta)
- `PublicationDate` array logica sera substituida por campos simples -- uma demanda = uma data de publicacao

