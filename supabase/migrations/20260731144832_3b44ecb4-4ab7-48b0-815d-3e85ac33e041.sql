CREATE POLICY "agency_admins_update_own_tenant"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = tenants.id
      AND ur.role IN ('agency_admin'::app_role, 'agency_manager'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = tenants.id
      AND ur.role IN ('agency_admin'::app_role, 'agency_manager'::app_role)
  )
);