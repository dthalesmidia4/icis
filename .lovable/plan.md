
# Plano: Corrigir Fluxo de Convites para Schema Atual

## Problema

O sistema está direcionando usuários convidados para a tela de cadastro de empresa (`/agency-setup`) em vez de levá-los diretamente para a página inicial. Isso ocorre porque:

1. A página `AgencySetup.tsx` ainda usa tabelas que **não existem** (`agencies`, `agency_memberships`, `agency_id`)
2. O `RequireTenant` redireciona usuários sem `agencyId` para `/agency-setup` antes do contexto terminar de carregar
3. Não há distinção clara entre "usuário novo sem empresa" e "usuário novo via convite"

---

## Diagnóstico do Banco de Dados

A usuária "Giovanna" (ID: `a6b42f62-09a7-440e-bc8c-a59fecbead6b`):
- `tenant_id`: **null** (não tem empresa vinculada)
- `user_roles`: **vazio** (não tem nenhuma role)
- Convite F118AFA6: **não foi usado** (`used_at: null`)

Isso indica que ela criou a conta **sem usar um convite** ou **o convite não foi processado corretamente**.

---

## Solução

### 1. Corrigir `AgencySetup.tsx` para usar Schema Atual

A página precisa ser revertida para usar `tenants`, `user_roles` e `tenant_id` (que existem), em vez de `agencies`, `agency_memberships` e `agency_id` (que não existem).

**Mudanças:**
- Substituir inserção em `agencies` por inserção em `tenants`
- Substituir inserção em `agency_memberships` por inserção em `user_roles`
- Substituir update de `agency_id` por update de `tenant_id`

```typescript
// Criar tenant (em vez de agency)
const { data: tenant, error: tenantError } = await supabase
  .from('tenants')
  .insert({
    name: data.officialName,
    slug: slug,
    tenant_type: 'agency',
    email: data.email,
    phone: data.phone,
    cnpj_cpf: data.cnpjCpf,
    status: 'active',
    settings: { ... }
  })
  .select()
  .single();

// Atualizar profile com tenant_id (em vez de agency_id)
await supabase
  .from('profiles')
  .update({ tenant_id: tenant.id })
  .eq('id', user.id);

// Criar user_role (em vez de agency_membership)
await supabase
  .from('user_roles')
  .insert({
    user_id: user.id,
    tenant_id: tenant.id,
    role: 'agency_admin'
  });
```

---

### 2. Melhorar Verificação no `AgencySetup.tsx`

Verificar se o usuário já tem `tenant_id` no profile ao carregar (usando schema atual):

```typescript
useEffect(() => {
  const checkExistingTenant = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    // Se já tem tenant_id, redirecionar para home
    if (profile?.tenant_id) {
      navigate('/');
    }
  };

  checkExistingTenant();
}, [user, navigate]);
```

---

### 3. Aumentar Robustez do `AgencyContext`

Melhorar o contexto para forçar um refresh após o cadastro via convite:

```typescript
// Em Auth.tsx, após usar convite com sucesso:
// Aguardar um pouco mais para o RPC commitar
await new Promise(resolve => setTimeout(resolve, 1500));

// Navegar e forçar refresh do contexto
navigate('/');
```

---

### 4. Remover Código que Tenta Usar Tabelas Inexistentes

Na página `AgencySetup.tsx`, remover:
- Query para `agency_memberships` (não existe)
- Insert em `agencies` (não existe)
- Update de `agency_id` no profile (coluna não existe)

---

## Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/pages/AgencySetup.tsx` | Reverter para usar `tenants`, `user_roles`, `tenant_id` |
| `src/pages/Auth.tsx` | Adicionar delay maior após usar convite para garantir que RPC commitou |

---

## Fluxo Corrigido

```text
Usuário com Convite:
1. Entra código de convite → validado
2. Preenche dados pessoais (nome, email, senha)
3. Clica "Criar Conta com Convite"
4. Auth.tsx cria conta → chama RPC use_invitation
5. RPC atualiza profiles.tenant_id e cria user_role
6. Aguarda 1.5s para garantir commit
7. Navega para "/" 
8. AgencyContext carrega tenant_id do profile
9. RequireTenant encontra agencyId → mostra Home

Usuário SEM Convite (Nova Empresa):
1. Preenche formulário completo de cadastro
2. Auth.tsx cria conta → cria tenant → atualiza profile → cria user_role
3. Navega para "/"
4. AgencyContext carrega tenant_id
5. RequireTenant encontra agencyId → mostra Home
```

---

## Resultado Esperado

Após as correções:
1. Usuários convidados serão adicionados à agência existente corretamente
2. Não serão mais redirecionados para `/agency-setup`
3. A página AgencySetup funcionará para casos onde realmente é necessário criar uma nova empresa
4. O sistema usará consistentemente o schema atual (`tenants`, `user_roles`, `tenant_id`)
