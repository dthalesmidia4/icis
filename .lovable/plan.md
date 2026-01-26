
# Plano: Corrigir Sistema de Convites para Schema Atual

## Resumo do Problema

O código foi atualizado para usar um novo modelo (`agencies`, `agency_memberships`, `agency_id`) que ainda **não existe no banco de dados**. As tabelas e colunas necessárias não foram criadas, causando erros em todo o sistema de convites.

### Estado Atual do Banco de Dados
- Tabela `agencies`: **NÃO EXISTE**
- Tabela `agency_memberships`: **NÃO EXISTE**
- Coluna `invitations.agency_id`: **NÃO EXISTE**
- Coluna `profiles.agency_id`: **NÃO EXISTE**

### Tabelas que Funcionam
- `tenants` (funciona como "agencies")
- `user_roles` (funciona como "agency_memberships")
- `invitations.tenant_id` (existe e tem dados)

---

## Solução Proposta

Reverter todo o código para usar o **schema atual funcional** (`tenants`, `user_roles`, `tenant_id`) enquanto as novas tabelas não existem.

---

## Tarefas

### 1. Corrigir Edge Function `validate-invitation`

**Arquivo:** `supabase/functions/validate-invitation/index.ts`

**Mudanças:**
- Remover tentativa de buscar `agency_id` da tabela `invitations`
- Usar apenas `tenant_id` que existe
- Retornar dados do `tenant` como se fosse a "agency"

```typescript
// Buscar apenas tenant_id (que existe)
const { data: invitation } = await supabase
  .from("invitations")
  .select("id, code, tenant_id, role, expires_at")
  .eq("code", code.toUpperCase().trim())
  .is("used_at", null)
  .gt("expires_at", new Date().toISOString())
  .maybeSingle();

// Buscar tenant e retornar como agency
const { data: tenant } = await supabase
  .from("tenants")
  .select("id, name")
  .eq("id", invitation.tenant_id)
  .maybeSingle();

return {
  valid: true,
  tenant_id: invitation.tenant_id,
  agency_id: invitation.tenant_id, // Compatibilidade
  role: invitation.role,
  tenant_name: tenant?.name,
  agency_name: tenant?.name,
};
```

---

### 2. Corrigir `useAgencyRole` Hook

**Arquivo:** `src/hooks/useAgencyRole.tsx`

**Mudanças:**
- Remover tentativa de buscar `agency_memberships` (não existe)
- Usar apenas `user_roles` para determinar a role do usuário
- Manter a interface pública igual para compatibilidade

```typescript
// Usar user_roles ao invés de agency_memberships
const { data: legacyRole } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .in('role', ['agency_admin', 'agency_user'])
  .maybeSingle();

if (legacyRole?.role) {
  setRole(legacyRole.role as AgencyRole);
}
```

---

### 3. Corrigir `InvitationList` Component

**Arquivo:** `src/components/InvitationList.tsx`

**Mudanças:**
- Remover query por `agency_id` (coluna não existe)
- Usar apenas `tenant_id` para filtrar convites

```typescript
// Query apenas por tenant_id
const { data, error } = await supabase
  .from('invitations')
  .select('id, code, role, expires_at, used_at, created_at')
  .eq('tenant_id', currentId)
  .order('created_at', { ascending: false })
  .limit(20);
```

---

### 4. Corrigir `ProfileSettings` Page

**Arquivo:** `src/pages/ProfileSettings.tsx`

**Mudanças:**
- Remover tentativa de inserir `agency_id` em invitations
- Usar apenas `tenant_id` para criar convites

```typescript
// Insert apenas com tenant_id
const { error: insertError } = await supabase
  .from('invitations')
  .insert({
    code,
    tenant_id: tenantId, // Usar tenantId, não agencyId
    role: selectedRole,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });
```

---

### 5. Corrigir `Auth` Page (Cadastro)

**Arquivo:** `src/pages/Auth.tsx`

**Mudanças:**
- Remover tentativa de criar em `agencies` (tabela não existe)
- Remover tentativa de criar em `agency_memberships` (tabela não existe)
- Usar `tenants` e `user_roles` que funcionam

```typescript
// Criar tenant ao invés de agency
const { data: tenant } = await supabase
  .from('tenants')
  .insert({
    name: validated.companyName,
    slug: slug,
    tenant_type: 'agency',
    cnpj_cpf: validated.cnpjCpf,
    email: validated.corporateEmail,
    phone: validated.phone,
    settings: { ... }
  })
  .select()
  .single();

// Atualizar profile com tenant_id
await supabase
  .from('profiles')
  .update({ tenant_id: tenant.id })
  .eq('id', authData.user.id);

// Criar user_role ao invés de agency_membership
await supabase
  .from('user_roles')
  .insert({
    user_id: authData.user.id,
    tenant_id: tenant.id,
    role: 'agency_admin'
  });
```

---

## Resumo das Mudanças

| Arquivo | Problema | Solução |
|---------|----------|---------|
| `validate-invitation` | Query `agency_id` inexistente | Usar apenas `tenant_id` |
| `useAgencyRole.tsx` | Query `agency_memberships` inexistente | Usar `user_roles` |
| `InvitationList.tsx` | Query `agency_id` inexistente | Filtrar por `tenant_id` |
| `ProfileSettings.tsx` | Insert `agency_id` inexistente | Usar `tenant_id` |
| `Auth.tsx` | Insert em `agencies` inexistente | Usar `tenants` |

---

## Resultado Esperado

Após as correções:
1. Sistema de convites funcionará normalmente
2. Cadastro de novas empresas funcionará
3. Validação de convites funcionará
4. Lista de convites carregará corretamente
5. Determinação de roles funcionará

---

## Nota Técnica

O modelo atual usa:
- `tenants` como se fosse `agencies`
- `user_roles` como se fosse `agency_memberships`
- `tenant_id` como se fosse `agency_id`

Os hooks e contextos já exportam aliases (`useAgency`, `useAgencyRole`) que mapeiam para essas tabelas existentes, mantendo a API do frontend consistente para quando a migração real for feita.
