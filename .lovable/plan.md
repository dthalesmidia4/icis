
# Plano: Refatorar Sistema de Convites e Roles

## Análise do Estado Atual

### Enum `app_role` no Banco de Dados
O enum atual contém 6 valores:
- `super_admin` ✅ (manter, mas não expor em convites)
- `agency_admin` ✅ (válido)
- `agency_user` ✅ (válido)
- `client_admin` ❌ (legado)
- `client_user` ❌ (legado)
- `subclient_user` ❌ (legado)

### Problema Crítico
A role `agency_manager` solicitada **NÃO EXISTE** no enum atual. Será necessário adicioná-la via migração SQL.

---

## Solução

### 1. Migração de Banco de Dados
Adicionar `agency_manager` ao enum `app_role`:

```sql
ALTER TYPE app_role ADD VALUE 'agency_manager';
```

### 2. Criar Constantes Centralizadas de Roles

Criar arquivo `src/lib/constants/roles.ts` com definições explícitas (não baseadas no enum):

```typescript
// Roles válidas para o produto atual
export const VALID_AGENCY_ROLES = ['agency_admin', 'agency_manager', 'agency_user'] as const;

// Labels para exibição
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  agency_admin: 'Administrador da Agência',
  agency_manager: 'Gestor Operacional',
  agency_user: 'Colaborador',
};

// Roles legadas (para compatibilidade histórica)
export const LEGACY_ROLE_LABEL = 'Role legada (não utilizada)';
export const LEGACY_ROLES = ['client_admin', 'client_user', 'subclient_user'];

// Opções para o select de convite
export const INVITE_ROLE_OPTIONS = [
  { value: 'agency_admin', label: 'Administrador da Agência', description: 'Acesso total à agência' },
  { value: 'agency_manager', label: 'Gestor Operacional', description: 'Gerencia operações e equipe' },
  { value: 'agency_user', label: 'Colaborador', description: 'Executa tarefas operacionais' },
] as const;
```

### 3. Atualizar `ProfileSettings.tsx`

**Mudanças:**
- Importar constantes de `@/lib/constants/roles`
- Usar `INVITE_ROLE_OPTIONS` no select (lista explícita, não enum)
- Remover referência direta ao tipo `AppRole` para o select

```typescript
import { INVITE_ROLE_OPTIONS } from '@/lib/constants/roles';

// No select:
<Select value={selectedRole} onValueChange={setSelectedRole}>
  <SelectTrigger>
    <SelectValue placeholder="Nível de acesso" />
  </SelectTrigger>
  <SelectContent>
    {INVITE_ROLE_OPTIONS.map((option) => (
      <SelectItem key={option.value} value={option.value}>
        <div>
          <span>{option.label}</span>
          <span className="text-muted-foreground">{option.description}</span>
        </div>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 4. Atualizar `InvitationList.tsx`

**Mudanças:**
- Importar `ROLE_LABELS`, `LEGACY_ROLES`, `LEGACY_ROLE_LABEL`
- Tratar roles legadas no histórico

```typescript
import { ROLE_LABELS, LEGACY_ROLES, LEGACY_ROLE_LABEL } from '@/lib/constants/roles';

// Função para obter label da role
function getRoleLabel(role: string): string {
  if (LEGACY_ROLES.includes(role)) {
    return LEGACY_ROLE_LABEL;
  }
  return ROLE_LABELS[role] || role;
}

// Na tabela:
<Badge variant={LEGACY_ROLES.includes(invitation.role) ? 'destructive' : 'secondary'}>
  {getRoleLabel(invitation.role)}
</Badge>
```

### 5. Atualizar `InviteCodeInput.tsx`

**Mudanças:**
- Importar `ROLE_LABELS`, `LEGACY_ROLE_LABEL`, `LEGACY_ROLES`
- Usar o mesmo padrão de labels

```typescript
import { ROLE_LABELS, LEGACY_ROLES, LEGACY_ROLE_LABEL } from '@/lib/constants/roles';

// Ao exibir a role:
{LEGACY_ROLES.includes(invitationInfo.role) 
  ? LEGACY_ROLE_LABEL 
  : ROLE_LABELS[invitationInfo.role] || invitationInfo.role}
```

### 6. Validação no Backend (Edge Function)

Atualizar `validate-invitation` para rejeitar roles inválidas se necessário:

```typescript
// Roles válidas para novos convites
const VALID_ROLES = ['agency_admin', 'agency_manager', 'agency_user'];

// Na resposta, indicar se é role legada
is_legacy_role: !VALID_ROLES.includes(invitation.role)
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| **Migração SQL** | Adicionar `agency_manager` ao enum `app_role` |
| `src/lib/constants/roles.ts` | **Novo arquivo** - Constantes centralizadas de roles |
| `src/pages/ProfileSettings.tsx` | Usar `INVITE_ROLE_OPTIONS` para popular select |
| `src/components/InvitationList.tsx` | Usar `ROLE_LABELS` e tratar roles legadas |
| `src/components/InviteCodeInput.tsx` | Usar labels centralizados |
| `supabase/functions/validate-invitation/index.ts` | Adicionar flag `is_legacy_role` (opcional) |

---

## Comportamento Esperado

### Select de Convite
Mostrará apenas 3 opções:
- Administrador da Agência
- Gestor Operacional  
- Colaborador

### Histórico de Convites
- Roles válidas: Exibe label correto
- Roles legadas (`client_*`): Exibe "Role legada (não utilizada)" com badge destrutivo

### Validação na Criação
- Apenas `agency_admin` ou `super_admin` podem criar convites
- Convites só podem ser criados com roles: `agency_admin`, `agency_manager`, `agency_user`

---

## Seção Técnica

### Tipo TypeScript para Roles Válidas
```typescript
export type ValidAgencyRole = typeof VALID_AGENCY_ROLES[number];
// Resulta em: 'agency_admin' | 'agency_manager' | 'agency_user'
```

### Ordem de Implementação
1. Executar migração SQL para adicionar `agency_manager`
2. Criar arquivo de constantes `roles.ts`
3. Atualizar componentes de UI em paralelo
4. Atualizar edge function (opcional)
