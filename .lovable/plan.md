

## Remover logica legada de convites (invitation legacy cleanup)

O sistema possui uma camada de codigo legado relacionada a convites que nao e mais utilizada. Este plano remove todas essas referencias para evitar duplicacao e confusao.

### O que sera removido

**1. Funcao de banco `use_invitation_v2`**
- Funcao RPC que referencia `agency_memberships` e `agency_id` (tabelas que nao existem)
- Sera dropada via migracao SQL: `DROP FUNCTION IF EXISTS public.use_invitation_v2`

**2. Edge Function `validate-invitation` - limpeza**
- Remover constante `LEGACY_ROLES` e variaveis `isLegacyRole` / `isValidRole`
- Remover campos legados da resposta: `agency_id`, `agency_name`, `tenant_type`, `is_legacy_role`, `is_valid_role`
- Manter apenas: `valid`, `tenant_id`, `tenant_name`, `role`

**3. `src/lib/constants/roles.ts` - limpeza**
- Remover `LEGACY_ROLES`, `LEGACY_ROLE_LABEL`
- Remover funcao `isLegacyRole()`
- Manter `VALID_AGENCY_ROLES`, `ROLE_LABELS`, `INVITE_ROLE_OPTIONS`, `getRoleLabel`, `isValidInviteRole`

**4. `src/components/InviteCodeInput.tsx` - limpeza**
- Remover campo `is_legacy_role` da interface `InvitationInfo`
- Remover import de `isLegacyRole`
- Simplificar: usar `data.tenant_id` direto (sem fallback `agency_id`)
- Remover badge condicional com `isLegacyRole` -- usar sempre variant `outline`

**5. `src/components/InvitationList.tsx` - limpeza**
- Remover import de `isLegacyRole`
- Remover badge condicional com `isLegacyRole` -- usar sempre variant `secondary`

**6. `src/contexts/AgencyContext.tsx` - limpeza de comentarios**
- Remover comentario referenciando `agency_memberships`
- Manter o codigo funcional (que usa `tenants` + `profiles.tenant_id`) intacto

**7. `src/hooks/useAgencyRole.tsx` - limpeza de comentarios**
- Remover comentario sobre `agency_memberships` no futuro

**8. `src/contexts/TenantContext.tsx` - limpeza de comentarios**
- Remover comentarios sobre migracao legada (o arquivo em si permanece pois e usado em 17+ arquivos como re-export)

### O que NAO sera alterado
- A funcao `use_invitation` (v1) permanece -- e o fluxo ativo e funcional
- A tabela `invitations` permanece -- nao tem coluna `agency_id` (ja esta limpa)
- Os arquivos que importam de `TenantContext` (17+ arquivos) -- continuam funcionando via re-export
- O trigger `validate_invitation_role` permanece -- valida roles corretas
- `LEGACY_STATUS_MAP` no `TaskCard.tsx` -- nao e relacionado a convites, e sim a status de cards

### Resumo da migracao SQL

```sql
DROP FUNCTION IF EXISTS public.use_invitation_v2(text, uuid);
```

