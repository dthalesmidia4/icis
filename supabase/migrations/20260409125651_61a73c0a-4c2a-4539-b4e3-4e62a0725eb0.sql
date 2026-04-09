-- Remover política permissiva que expõe códigos e emails
DROP POLICY IF EXISTS "anyone_can_validate_invitation" ON public.invitations;

-- Permitir leitura apenas para admins do tenant (listagem) e gestores
CREATE POLICY "tenant_admins_read_invitations" ON public.invitations
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR is_agency_admin(tenant_id)
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'agency_manager'::app_role
      AND user_roles.tenant_id = invitations.tenant_id
  )
);